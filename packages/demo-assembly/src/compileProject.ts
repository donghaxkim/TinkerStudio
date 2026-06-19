import {
  DemoProjectSchema,
  PROJECT_SCHEMA_VERSION,
  type Asset,
  type CursorEvent,
  type DemoProject,
  type ZoomKeyframe,
} from "@tinker/project-schema";
import type { CaptureAsset, CaptureEvent } from "@tinker/browser-capture";
import { suggestInteractionZooms, type ExplicitInteractionTarget } from "@tinker/motion";
import type { CompileProjectInput } from "./types.js";

const ZOOM_TARGET_HOLD_SECONDS = 2.5;
const RIGHT_EDGE_ZOOM_THRESHOLD_RATIO = 0.86;
const RIGHT_EDGE_OVERVIEW_SECONDS = 0.6;
const RIGHT_EDGE_OUTRO_SECONDS = 0.9;
const RIGHT_EDGE_OUTRO_SCALE = 1.1;
const TERMINAL_ZOOM_EPSILON_SECONDS = 0.001;

type FrameSize = { width: number; height: number };

function cleanNumber(value: number) {
  return Number(value.toFixed(6));
}

function isPositiveFinite(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

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

function isRightEdgeTarget(target: ZoomKeyframe["target"], frame: FrameSize | undefined) {
  return frame !== undefined && target.x + target.width >= frame.width * RIGHT_EDGE_ZOOM_THRESHOLD_RATIO;
}

function terminalRightEdgeOutroTarget(frame: FrameSize): ZoomKeyframe["target"] {
  const width = cleanNumber(frame.width / RIGHT_EDGE_OUTRO_SCALE);
  const height = cleanNumber(frame.height / RIGHT_EDGE_OUTRO_SCALE);

  return {
    x: 0,
    y: cleanNumber((frame.height - height) / 2),
    width,
    height,
  };
}

function cleanZoomKeyframe(zoom: ZoomKeyframe): ZoomKeyframe {
  return {
    ...zoom,
    start: cleanNumber(zoom.start),
    end: cleanNumber(zoom.end),
    target: {
      x: cleanNumber(zoom.target.x),
      y: cleanNumber(zoom.target.y),
      width: cleanNumber(zoom.target.width),
      height: cleanNumber(zoom.target.height),
    },
    ...(zoom.scale !== undefined ? { scale: cleanNumber(zoom.scale) } : {}),
  };
}

function frameTerminalRightEdgeZoom(
  zoom: ZoomKeyframe,
  duration: number,
  frame: FrameSize | undefined,
): ZoomKeyframe[] {
  if (!isRightEdgeTarget(zoom.target, frame) || zoom.end < duration - TERMINAL_ZOOM_EPSILON_SECONDS) {
    return [zoom];
  }

  const overviewStart = cleanNumber(duration - RIGHT_EDGE_OVERVIEW_SECONDS);
  const outroStart = overviewStart;
  const latestInteractionStart = cleanNumber(duration - RIGHT_EDGE_OUTRO_SECONDS);
  if (!frame || latestInteractionStart <= zoom.start) {
    return [];
  }

  return [
    { ...zoom, end: Math.min(zoom.end, overviewStart) },
    {
      id: `${zoom.id}-outro`,
      start: outroStart,
      end: duration,
      target: terminalRightEdgeOutroTarget(frame),
      scale: RIGHT_EDGE_OUTRO_SCALE,
      easing: "easeOut",
    },
  ];
}

function toExplicitInteractionTarget(
  event: Extract<CaptureEvent, { type: "zoomTarget" }>,
  index: number,
): ExplicitInteractionTarget {
  return {
    id: `zoom-${index}`,
    time: event.time,
    x: event.x,
    y: event.y,
    width: event.width,
    height: event.height,
    holdSeconds: ZOOM_TARGET_HOLD_SECONDS,
  };
}

function toZoomKeyframes(
  events: readonly CaptureEvent[],
  cursorEvents: readonly CursorEvent[],
  duration: number,
  frame: FrameSize | undefined,
): ZoomKeyframe[] {
  if (!frame) {
    return [];
  }

  const explicitTargets = events.flatMap((event, index) =>
    event.type === "zoomTarget" ? [toExplicitInteractionTarget(event, index)] : [],
  );
  const zooms = suggestInteractionZooms(cursorEvents, [], {
    duration,
    frame,
    explicitTargets,
    idPrefix: "zoom",
    minSpacingSeconds: 0,
    excludeExistingZooms: false,
    easing: "easeInOut",
  });

  return zooms.flatMap((zoom) => frameTerminalRightEdgeZoom(cleanZoomKeyframe(zoom), duration, frame));
}

function captureFrameRate(asset: CaptureAsset) {
  const frameRate = asset.metadata?.frameRate;

  return typeof frameRate === "number" && Number.isFinite(frameRate) && frameRate > 0 ? frameRate : undefined;
}

// Frame rate used only when the captured clip reports no source rate. A composed/export
// pass that re-renders from screenshots/DemoProject may legitimately target 60fps; the raw
// DemoProject must NOT claim 60fps over a 25fps Playwright recording (FPS honesty).
const FALLBACK_FRAME_RATE = 60;

function captureFrameSize(asset: CaptureAsset, fallback: CompileProjectInput["capturePlan"]["viewport"]): FrameSize | undefined {
  const width = isPositiveFinite(asset.width) ? asset.width : fallback.width;
  const height = isPositiveFinite(asset.height) ? asset.height : fallback.height;

  return isPositiveFinite(width) && isPositiveFinite(height) ? { width, height } : undefined;
}

export function compileProject(input: CompileProjectInput): DemoProject {
  const videoAsset = input.captureResult.clips.find((asset) => asset.type === "video");

  if (!videoAsset) {
    throw new Error("Cannot compile DemoProject without a captured video asset");
  }

  // Footage is the source of truth. When Playwright reports source duration, keep the
  // full recording so the EDL can trim late actions instead of dropping them at the
  // storyboard cap before assembly.
  const duration =
    videoAsset.duration !== undefined
      ? videoAsset.duration
      : input.storyboard.durationCapSeconds;
  const clipDuration = duration;
  const assets = [...input.captureResult.clips, ...input.captureResult.screenshots].map(toProjectAsset);
  const cursorEvents = input.captureResult.events.flatMap((event) => {
    const cursorEvent = toCursorEvent(event);

    return cursorEvent && cursorEvent.time <= duration ? [cursorEvent] : [];
  });
  const frame = captureFrameSize(videoAsset, input.capturePlan.viewport);
  const zooms = toZoomKeyframes(input.captureResult.events, cursorEvents, duration, frame);
  const project: DemoProject = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: input.projectId,
    title: input.storyboard.title,
    duration,
    fps: captureFrameRate(videoAsset) ?? FALLBACK_FRAME_RATE,
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
    // The smooth synthetic cursor is baked INTO the captured webm, so the render/editor
    // overlay cursor must stay hidden or it would draw a second, unsynced pointer on top.
    // cursorEvents are retained (telemetry, zoom suggestion, future un-baked modes).
    cursor: { hidden: true },
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
