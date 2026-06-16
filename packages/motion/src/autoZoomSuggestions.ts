import type { CursorEvent, ZoomKeyframe } from "@tinker/project-schema";
import {
  DEFAULT_AUTO_ZOOM_DURATION_SECONDS,
  DEFAULT_DWELL_MOVE_THRESHOLD,
  DEFAULT_MAX_DWELL_SECONDS,
  DEFAULT_MIN_DWELL_SECONDS,
  DEFAULT_SUGGESTION_SPACING_SECONDS,
  detectZoomDwellCandidates,
  suggestInteractionZooms,
  type DetectZoomDwellCandidatesOptions,
  type ExplicitInteractionTarget,
  type ZoomDwellCandidate,
} from "./interactionTargets.js";
import { normalizeCursorTelemetry, type MotionFrame } from "./cursorTelemetry.js";

export {
  DEFAULT_AUTO_ZOOM_DURATION_SECONDS,
  DEFAULT_DWELL_MOVE_THRESHOLD,
  DEFAULT_MAX_DWELL_SECONDS,
  DEFAULT_MIN_DWELL_SECONDS,
  DEFAULT_SUGGESTION_SPACING_SECONDS,
  detectZoomDwellCandidates,
  type DetectZoomDwellCandidatesOptions,
  type ZoomDwellCandidate,
};

export type SuggestAutoZoomsOptions = {
  duration: number;
  frame: MotionFrame;
  frameAtTime?: (time: number) => MotionFrame | undefined;
  idPrefix?: string;
  defaultDurationSeconds?: number;
  targetSize?: { width: number; height: number };
  minSpacingSeconds?: number;
  excludeExistingZooms?: boolean;
  easing?: ZoomKeyframe["easing"];
} & DetectZoomDwellCandidatesOptions;

export function suggestAutoZooms(
  cursorEvents: readonly CursorEvent[],
  existingZooms: readonly ZoomKeyframe[],
  options: SuggestAutoZoomsOptions,
): ZoomKeyframe[] {
  const dwellTargets = legacyDwellTargets(cursorEvents, options);

  return suggestInteractionZooms(cursorEvents, existingZooms, {
    ...options,
    explicitTargets: dwellTargets,
  });
}

function cleanNumber(value: number) {
  return Number(value.toFixed(12));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function safePositive(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function frameAtTime(options: Pick<SuggestAutoZoomsOptions, "frame" | "frameAtTime">, time: number) {
  return options.frameAtTime?.(time) ?? options.frame;
}

function targetRect(
  focus: ZoomDwellCandidate["focus"],
  frame: MotionFrame,
  targetSize?: { width: number; height: number },
): ZoomKeyframe["target"] {
  const frameWidth = safePositive(frame.width, 1);
  const frameHeight = safePositive(frame.height, 1);
  const width = clamp(safePositive(targetSize?.width, frameWidth * 0.55), 1, frameWidth);
  const height = clamp(safePositive(targetSize?.height, frameHeight * 0.55), 1, frameHeight);
  const centerX = clamp(focus.cx, 0, 1) * frameWidth;
  const centerY = clamp(focus.cy, 0, 1) * frameHeight;

  return {
    x: cleanNumber(clamp(centerX - width / 2, 0, frameWidth - width)),
    y: cleanNumber(clamp(centerY - height / 2, 0, frameHeight - height)),
    width: cleanNumber(width),
    height: cleanNumber(height),
  };
}

function zoomRange(centerTime: number, duration: number, projectDuration: number) {
  const boundedDuration = clamp(duration, 0, projectDuration);
  const start = clamp(centerTime - boundedDuration / 2, 0, Math.max(0, projectDuration - boundedDuration));
  const end = clamp(start + boundedDuration, 0, projectDuration);

  return { start: cleanNumber(start), end: cleanNumber(end) };
}

function legacyDwellTargets(
  cursorEvents: readonly CursorEvent[],
  options: SuggestAutoZoomsOptions,
): ExplicitInteractionTarget[] {
  const projectDuration = safePositive(options.duration, 0);

  if (projectDuration <= 0) {
    return [];
  }

  const zoomDuration = safePositive(options.defaultDurationSeconds, DEFAULT_AUTO_ZOOM_DURATION_SECONDS);
  const normalized = cursorEvents.flatMap((event) =>
    normalizeCursorTelemetry([event], {
      frame: frameAtTime(options, event.time),
      duration: projectDuration,
    }),
  );

  return detectZoomDwellCandidates(normalized, options)
    .sort((left, right) => {
      if (right.strength !== left.strength) return right.strength - left.strength;
      return left.centerTime - right.centerTime;
    })
    .flatMap((candidate) => {
      const range = zoomRange(candidate.centerTime, zoomDuration, projectDuration);

      if (range.end <= range.start) {
        return [];
      }

      const target = targetRect(candidate.focus, frameAtTime(options, candidate.centerTime), options.targetSize);

      return [
        {
          id: "",
          time: range.start,
          x: target.x,
          y: target.y,
          width: target.width,
          height: target.height,
          holdSeconds: cleanNumber(range.end - range.start),
        },
      ];
    });
}
