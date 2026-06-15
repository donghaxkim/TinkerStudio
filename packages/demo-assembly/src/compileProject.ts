import {
  DemoProjectSchema,
  PROJECT_SCHEMA_VERSION,
  type Asset,
  type CursorEvent,
  type DemoProject,
  type ZoomKeyframe,
} from "@tinker/project-schema";
import type { CaptureAsset, CaptureEvent } from "@tinker/browser-capture";
import type { CompileProjectInput } from "./types.js";

const ZOOM_TARGET_HOLD_SECONDS = 2.5;
const ZOOM_MERGE_EPSILON_SECONDS = 0.001;

function toProjectAsset(asset: CaptureAsset): Asset {
  return {
    id: asset.id,
    type: asset.type,
    uri: `capture/${asset.uri}`,
    source: asset.source,
    mimeType: asset.mimeType,
    duration: asset.duration,
    width: asset.width,
    height: asset.height,
    sizeBytes: asset.sizeBytes,
    metadata: asset.metadata ?? {},
  };
}

function toCursorEvent(event: CaptureEvent): CursorEvent | undefined {
  if (event.type === "cursor") {
    return { type: "move", time: event.time, x: event.x, y: event.y };
  }

  if (event.type === "click") {
    return { type: "click", time: event.time, x: event.x, y: event.y, label: event.label };
  }

  if (event.type === "scroll") {
    return {
      type: "scroll",
      time: event.time,
      x: event.x,
      y: event.y,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
    };
  }

  return undefined;
}

function mergeRects(left: ZoomKeyframe["target"], right: ZoomKeyframe["target"]): ZoomKeyframe["target"] {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const maxX = Math.max(left.x + left.width, right.x + right.width);
  const maxY = Math.max(left.y + left.height, right.y + right.height);

  return { x, y, width: maxX - x, height: maxY - y };
}

function toZoomKeyframes(events: readonly CaptureEvent[], duration: number): ZoomKeyframe[] {
  const zooms: ZoomKeyframe[] = [];
  const zoomTargets = events
    .map((event, index) => ({ event, index }))
    .filter(
      (entry): entry is { event: Extract<CaptureEvent, { type: "zoomTarget" }>; index: number } =>
        entry.event.type === "zoomTarget",
    )
    .sort((left, right) => left.event.time - right.event.time || left.index - right.index);

  zoomTargets.forEach(({ event, index }) => {
    const end = Math.min(event.time + ZOOM_TARGET_HOLD_SECONDS, duration);

    if (end <= event.time) {
      return;
    }

    const target = { x: event.x, y: event.y, width: event.width, height: event.height };
    const previous = zooms.at(-1);

    if (previous && event.time <= previous.end + ZOOM_MERGE_EPSILON_SECONDS) {
      previous.end = Math.max(previous.end, end);
      previous.target = mergeRects(previous.target, target);
      return;
    }

    zooms.push({
      id: `zoom-${index}`,
      start: event.time,
      end,
      target,
      easing: "easeInOut",
    });
  });

  return zooms;
}

function captureFrameRate(asset: CaptureAsset) {
  const frameRate = asset.metadata?.frameRate;

  return typeof frameRate === "number" && Number.isFinite(frameRate) && frameRate > 0 ? frameRate : undefined;
}

export function compileProject(input: CompileProjectInput): DemoProject {
  const videoAsset = input.captureResult.clips.find((asset) => asset.type === "video");

  if (!videoAsset) {
    throw new Error("Cannot compile DemoProject without a captured video asset");
  }

  // Footage is the source of truth: a timeline longer than the captured clip
  // renders black frames past the end of footage.
  const duration =
    videoAsset.duration !== undefined
      ? Math.min(input.storyboard.durationCapSeconds, videoAsset.duration)
      : input.storyboard.durationCapSeconds;
  const clipDuration = duration;
  const assets = [...input.captureResult.clips, ...input.captureResult.screenshots].map(toProjectAsset);
  const cursorEvents = input.captureResult.events.flatMap((event) => {
    const cursorEvent = toCursorEvent(event);

    return cursorEvent && cursorEvent.time <= duration ? [cursorEvent] : [];
  });
  const zooms = toZoomKeyframes(input.captureResult.events, duration);
  const project: DemoProject = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: input.projectId,
    title: input.storyboard.title,
    duration,
    fps: captureFrameRate(videoAsset) ?? 30,
    aspectRatio: input.storyboard.aspectRatio,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    assets,
    tracks: [
      {
        id: "track-video-main",
        type: "video",
        name: "Captured browser video",
        locked: false,
        hidden: false,
        clips: [
          {
            id: "clip-video-main",
            assetId: videoAsset.id,
            start: 0,
            end: clipDuration,
            sourceStart: 0,
            sourceEnd: clipDuration,
            name: "Manual fixture capture",
            muted: false,
            opacity: 1,
            transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          },
        ],
      },
    ],
    zooms,
    cursorEvents,
    cursor: { clickEffect: "none" },
    aiEditHistory: [],
    metadata: {
      ...(input.sourceRepoUrl ? { sourceRepoUrl: input.sourceRepoUrl } : {}),
      ...(input.productUrl ? { productUrl: input.productUrl } : {}),
      ...(input.prompt ? { prompt: input.prompt } : {}),
      notes: [
        "Generated from a manual storyboard and deterministic browser capture plan.",
        `Capture target: ${input.capturePlan.targetUrl}`,
      ],
    },
  };

  return DemoProjectSchema.parse(project);
}
