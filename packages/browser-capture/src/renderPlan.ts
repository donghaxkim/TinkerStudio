// render-plan module (first pass)
//
// Reads an ActionTrace and produces `render-plan.json`: declarative cinematic
// metadata (zoom segments, click effects, scroll segments, holds) that a future
// post-render pass can apply as real camera moves. For THIS pass the plan is also
// useful as documentation/preview of how the video "wants" to move — the synthetic
// cursor/click/scroll smoothing already baked into the recording is what makes the
// shipped final.mp4 feel better.
//
// Heuristics are deliberately simple and live in small named functions
// (`zoomScaleForTarget`, `clusterActions`) so they are easy to tune.

import type { ActionTrace, ActionTraceEntry, BoundingBox } from "./actionTrace.js";

export type Focus = { x: number; y: number }; // normalized 0..1 within the viewport

export type ZoomSegment = {
  id: string;
  start: number; // seconds
  end: number;
  scale: number;
  focus: Focus;
  easing: "minimum-jerk" | "easeInOutCubic";
  reason: string;
};

export type ClickEffect = {
  id: string;
  time: number;
  x: number;
  y: number;
  effect: "ripple";
  durationMs: number;
};

export type ScrollSegment = {
  id: string;
  start: number;
  end: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  easing: "easeInOutCubic" | "easeOutCubic";
};

export type Hold = {
  id: string;
  time: number; // seconds at which the hold begins
  durationMs: number;
  reason: string;
};

export type RenderPlan = {
  version: 1;
  fps: number;
  resolution: { width: number; height: number };
  cursor: {
    enabled: boolean;
    style: "synthetic";
    smoothing: "minimum-jerk";
    hideNativeCursor: boolean;
    size: number;
  };
  zoomSegments: ZoomSegment[];
  clickEffects: ClickEffect[];
  scrollSegments: ScrollSegment[];
  holds: Hold[];
  notes: string[];
};

export type BuildRenderPlanOptions = {
  fps?: number;
  /** Two click/type actions within this fraction of the viewport diagonal, and within
   *  `clusterGapSeconds`, share a single zoom instead of zooming per click. */
  clusterRadiusFraction?: number;
  clusterGapSeconds?: number;
};

const DEFAULT_FPS = 30;
const ZOOM_LEAD_IN_SECONDS = 0.25; // start easing the camera in slightly before the action
const HOLD_AFTER_CLICK_MS = 700; // within the 500-1000ms band
const HOLD_AFTER_NAVIGATION_MS = 1200; // within the 1000-1500ms band
const CLICK_RIPPLE_MS = 450;
const SCROLL_ZOOM_SCALE = 1.05; // gentle 1.0-1.1 zoom while scrolling
const MIN_CLICK_ZOOM = 1.2;
const MAX_CLICK_ZOOM = 1.5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function focusFromEntry(entry: ActionTraceEntry, viewport: { width: number; height: number }): Focus {
  const point =
    entry.clickPoint ??
    (entry.targetBox
      ? { x: entry.targetBox.x + entry.targetBox.width / 2, y: entry.targetBox.y + entry.targetBox.height / 2 }
      : { x: viewport.width / 2, y: viewport.height / 2 });
  return {
    x: clamp(point.x / viewport.width, 0, 1),
    y: clamp(point.y / viewport.height, 0, 1),
  };
}

/**
 * HEURISTIC — how hard to zoom on a click/type target.
 * Smaller targets get a tighter zoom (toward 1.5) so the detail is legible; targets
 * that already fill a good chunk of the frame get a gentle 1.2. When we have no box
 * we fall back to the midpoint. Tunable: change the 0.5 "fills half a dimension"
 * pivot or the min/max band to taste.
 */
export function zoomScaleForTarget(box: BoundingBox | undefined, viewport: { width: number; height: number }): number {
  if (!box) return (MIN_CLICK_ZOOM + MAX_CLICK_ZOOM) / 2;
  const fraction = Math.max(box.width / viewport.width, box.height / viewport.height);
  const tightness = 1 - clamp(fraction / 0.5, 0, 1); // 1 = tiny target, 0 = large target
  return Number((MIN_CLICK_ZOOM + tightness * (MAX_CLICK_ZOOM - MIN_CLICK_ZOOM)).toFixed(3));
}

/**
 * HEURISTIC — cluster nearby click/type actions so we hold one zoom across a burst
 * of interaction in the same region (e.g. filling a form) instead of pumping the
 * camera in/out on every click. Actions join the current cluster when they are both
 * close in space (within `clusterRadiusFraction` of the viewport diagonal) and close
 * in time (within `clusterGapSeconds`).
 */
export function clusterActions(
  entries: ActionTraceEntry[],
  viewport: { width: number; height: number },
  options: { clusterRadiusFraction: number; clusterGapSeconds: number },
): ActionTraceEntry[][] {
  const diagonal = Math.hypot(viewport.width, viewport.height);
  const radius = diagonal * options.clusterRadiusFraction;
  const clusters: ActionTraceEntry[][] = [];

  for (const entry of entries) {
    const current = clusters[clusters.length - 1];
    const previous = current?.[current.length - 1];

    if (current && previous && near(previous, entry, radius) && entry.startTime - previous.endTime <= options.clusterGapSeconds) {
      current.push(entry);
    } else {
      clusters.push([entry]);
    }
  }
  return clusters;
}

function near(a: ActionTraceEntry, b: ActionTraceEntry, radius: number): boolean {
  const pa = a.clickPoint ?? boxCenter(a.targetBox);
  const pb = b.clickPoint ?? boxCenter(b.targetBox);
  if (!pa || !pb) return false;
  return Math.hypot(pa.x - pb.x, pa.y - pb.y) <= radius;
}

function boxCenter(box: BoundingBox | undefined): { x: number; y: number } | undefined {
  return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : undefined;
}

export function buildRenderPlan(trace: ActionTrace, options: BuildRenderPlanOptions = {}): RenderPlan {
  const fps = options.fps ?? trace.fps ?? DEFAULT_FPS;
  const clusterRadiusFraction = options.clusterRadiusFraction ?? 0.22;
  const clusterGapSeconds = options.clusterGapSeconds ?? 1.5;
  const viewport = trace.viewport;

  const zoomSegments: ZoomSegment[] = [];
  const clickEffects: ClickEffect[] = [];
  const scrollSegments: ScrollSegment[] = [];
  const holds: Hold[] = [];
  const notes: string[] = [
    "First-pass render plan: zoom/hold segments are cinematic metadata for a future post-render camera pass.",
    "The shipped final.mp4 already includes synthetic cursor, click ripple, and eased scrolling baked into the recording.",
  ];

  const interactionEntries = trace.actions.filter((entry) => entry.type === "click" || entry.type === "type");
  const clusters = clusterActions(interactionEntries, viewport, { clusterRadiusFraction, clusterGapSeconds });

  clusters.forEach((cluster, index) => {
    const first = cluster[0];
    const last = cluster[cluster.length - 1];
    const tightestBox = cluster
      .map((entry) => entry.targetBox)
      .filter((box): box is BoundingBox => box !== undefined)
      .sort((a, b) => a.width * a.height - b.width * b.height)[0];

    zoomSegments.push({
      id: `zoom-${index + 1}`,
      start: Math.max(0, first.startTime - ZOOM_LEAD_IN_SECONDS),
      end: last.endTime + HOLD_AFTER_CLICK_MS / 1000,
      scale: zoomScaleForTarget(tightestBox, viewport),
      focus: focusFromEntry(first, viewport),
      easing: "minimum-jerk",
      reason: cluster.length > 1 ? `Clustered ${cluster.length} interactions in one region` : `Interaction on ${first.description ?? first.selector ?? "target"}`,
    });

    for (const entry of cluster) {
      if (entry.clickPoint) {
        clickEffects.push({
          id: `${entry.id}-ripple`,
          time: entry.endTime,
          x: entry.clickPoint.x,
          y: entry.clickPoint.y,
          effect: "ripple",
          durationMs: CLICK_RIPPLE_MS,
        });
      }
      holds.push({
        id: `${entry.id}-hold`,
        time: entry.endTime,
        durationMs: HOLD_AFTER_CLICK_MS,
        reason: "Settle after interaction",
      });
    }
  });

  // Scroll segments + a gentle zoom while scrolling; navigations get a longer hold.
  let lastScroll = { x: 0, y: 0 };
  let scrollIndex = 0;
  for (const entry of trace.actions) {
    if (entry.type === "scroll" && entry.scrollPosition) {
      scrollIndex += 1;
      scrollSegments.push({
        id: `scroll-${scrollIndex}`,
        start: entry.startTime,
        end: entry.endTime,
        from: lastScroll,
        to: entry.scrollPosition,
        easing: "easeInOutCubic",
      });
      zoomSegments.push({
        id: `scroll-zoom-${scrollIndex}`,
        start: entry.startTime,
        end: entry.endTime,
        scale: SCROLL_ZOOM_SCALE,
        focus: { x: 0.5, y: 0.5 },
        easing: "easeInOutCubic",
        reason: "Gentle hold while scrolling",
      });
      lastScroll = entry.scrollPosition;
    }

    if (entry.type === "navigation") {
      holds.push({
        id: `${entry.id}-hold`,
        time: entry.endTime,
        durationMs: HOLD_AFTER_NAVIGATION_MS,
        reason: "Let the new view land after navigation",
      });
    }
  }

  zoomSegments.sort((a, b) => a.start - b.start);
  holds.sort((a, b) => a.time - b.time);

  return {
    version: 1,
    fps,
    resolution: viewport,
    cursor: {
      enabled: true,
      style: "synthetic",
      smoothing: "minimum-jerk",
      hideNativeCursor: true,
      size: 22,
    },
    zoomSegments,
    clickEffects,
    scrollSegments,
    holds,
    notes,
  };
}
