import {
  DemoProjectSchema,
  PROJECT_SCHEMA_VERSION,
  type Asset,
  type Caption,
  type CursorEvent,
  type DemoProject,
  type ZoomKeyframe,
} from "@tinker/project-schema";
import type { CaptureAsset, CaptureEvent } from "@tinker/browser-capture";
import type { CompileProjectInput } from "./types.js";

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

function toZoomKeyframe(event: CaptureEvent, index: number, duration: number): ZoomKeyframe[] {
  if (event.type !== "zoomTarget") {
    return [];
  }

  const end = Math.min(event.time + 2.5, duration);

  if (end <= event.time) {
    return [];
  }

  return [
    {
      id: `zoom-${index}`,
      start: event.time,
      end,
      target: { x: event.x, y: event.y, width: event.width, height: event.height },
      easing: "easeInOut",
    },
  ];
}

export function compileProject(input: CompileProjectInput): DemoProject {
  const duration = input.storyboard.durationCapSeconds;
  const videoAsset = input.captureResult.clips.find((asset) => asset.type === "video");

  if (!videoAsset) {
    throw new Error("Cannot compile DemoProject without a captured video asset");
  }

  const clipDuration = videoAsset.duration !== undefined ? Math.min(duration, videoAsset.duration) : duration;
  const assets = [...input.captureResult.clips, ...input.captureResult.screenshots].map(toProjectAsset);
  const captions: Caption[] = input.storyboard.beats
    .flatMap((beat, index) => {
      if (!beat.narration) {
        return [];
      }

      const start = Math.max(0, beat.startHint ?? index * 3);
      const end = Math.min(beat.endHint ?? start + 3, duration);

      if (end <= start) {
        return [];
      }

      return [
        {
          id: `caption-${beat.id}`,
          start,
          end,
          text: beat.narration,
          style: { position: "bottom" },
        },
      ];
    });
  const cursorEvents = input.captureResult.events.flatMap((event) => {
    const cursorEvent = toCursorEvent(event);

    return cursorEvent && cursorEvent.time <= duration ? [cursorEvent] : [];
  });
  const zooms: ZoomKeyframe[] = input.captureResult.events.flatMap((event, index) =>
    toZoomKeyframe(event, index, duration),
  );
  const project: DemoProject = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: input.projectId,
    title: input.storyboard.title,
    duration,
    fps: 30,
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
    captions,
    zooms,
    cursorEvents,
    callouts: [],
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
