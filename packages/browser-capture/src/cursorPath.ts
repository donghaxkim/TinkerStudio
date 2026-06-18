// cursor-path module (first pass)
//
// Pure geometry + easing for Screen Studio-style pointer motion. Deliberately has
// NO DOM or Playwright dependency so it can be unit-tested in isolation and reused
// by both the in-page synthetic cursor (which inlines the same min-jerk formula,
// since injected scripts cannot import) and the offline render planner.

export type Point = { x: number; y: number };

/** A sampled point along a cursor move. `t` is the normalized progress [0,1]. */
export type CursorSample = Point & { t: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/**
 * Minimum-jerk (5th-order) easing: s = 10u^3 - 15u^4 + 6u^5.
 * The smoothest position profile for a point-to-point reach (zero start/end
 * velocity AND acceleration), which is what makes synthetic cursors read as
 * "intentional" rather than linear/robotic.
 */
export function minimumJerk(u: number): number {
  const c = clamp01(u);
  return 10 * c ** 3 - 15 * c ** 4 + 6 * c ** 5;
}

/** easeOutCubic — decelerating; good for short scroll nudges. */
export function easeOutCubic(t: number): number {
  const c = clamp01(t);
  return 1 - (1 - c) ** 3;
}

/** easeInOutCubic — accelerate then decelerate; good for longer eased scrolls. */
export function easeInOutCubic(t: number): number {
  const c = clamp01(t);
  return c < 0.5 ? 4 * c ** 3 : 1 - (-2 * c + 2) ** 3 / 2;
}

// Cursor pacing defaults (Director Mode pass). The previous defaults (250-1200ms moves)
// read as sluggish; these keep motion snappy: short hops ~120-180ms, medium ~180-280ms,
// long sweeps capped at 380ms. Pre-click dwell and post-click hold are short and
// deliberate so a click reads as intentional without dead time before/after it.
export const CURSOR_MOVE_MIN_MS = 120;
export const CURSOR_MOVE_MAX_MS = 380;
export const CURSOR_PRE_CLICK_DWELL_MS = 90; // within the requested 60-120ms band
export const CURSOR_POST_CLICK_HOLD_MS = 200; // within the requested 150-250ms band

/**
 * Distance-aware move duration:
 *   clamp(120 + 70 * log2(distance / targetWidth + 1), 120, 380)
 * Short hops stay snappy; long sweeps stretch out (but cap at 380ms) so the eye can
 * follow them without the pointer feeling slow. `targetWidth` normalizes by how big the
 * thing being approached is — landing on a wide button is quicker than threading an icon.
 */
export function cursorMoveDurationMs(distance: number, targetWidth: number): number {
  const width = Math.max(1, targetWidth);
  const ms = CURSOR_MOVE_MIN_MS + 70 * Math.log2(distance / width + 1);
  return clamp(ms, CURSOR_MOVE_MIN_MS, CURSOR_MOVE_MAX_MS);
}

/** A cubic Bézier evaluated at `t`. */
export function cubicBezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const a = mt ** 3;
  const b = 3 * mt ** 2 * t;
  const c = 3 * mt * t ** 2;
  const d = t ** 3;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/**
 * Two Bézier control points that bow the path slightly off the straight line,
 * giving cursor motion a natural arc instead of a ruler-straight slide. `arc` is
 * the perpendicular offset as a fraction of travel distance.
 */
export function cursorControlPoints(from: Point, to: Point, arc = 0.16): { c1: Point; c2: Point } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy) || 1;
  const nx = -dy / distance;
  const ny = dx / distance;
  const offset = distance * arc;
  return {
    c1: { x: from.x + dx / 3 + nx * offset, y: from.y + dy / 3 + ny * offset },
    c2: { x: from.x + (2 * dx) / 3 + nx * offset, y: from.y + (2 * dy) / 3 + ny * offset },
  };
}

/**
 * Sample a min-jerk-eased Bézier cursor path between two points. Spacing follows
 * the minimum-jerk velocity profile in time, so samples cluster at the ends and
 * spread through the middle — exactly how a smooth reach looks. Used for offline
 * previews/metadata; the live in-page cursor reproduces the same curve per-frame.
 */
export function sampleCursorPath(input: {
  from: Point;
  to: Point;
  steps?: number;
  durationMs?: number;
  targetWidth?: number;
  fps?: number;
}): CursorSample[] {
  const { from, to } = input;
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const durationMs = input.durationMs ?? cursorMoveDurationMs(distance, input.targetWidth ?? 1);
  const fps = input.fps ?? 60;
  const steps = input.steps ?? Math.max(2, Math.round((durationMs / 1000) * fps));
  const { c1, c2 } = cursorControlPoints(from, to);

  const samples: CursorSample[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const eased = minimumJerk(t);
    const point = cubicBezier(from, c1, c2, to, eased);
    samples.push({ x: point.x, y: point.y, t });
  }
  return samples;
}
