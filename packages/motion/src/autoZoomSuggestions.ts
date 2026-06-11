import type { CursorEvent, ZoomKeyframe } from "@tinker/project-schema";
import { normalizeCursorTelemetry, type MotionFrame, type NormalizedCursorPoint } from "./cursorTelemetry.js";

export const DEFAULT_MIN_DWELL_SECONDS = 0.45;
export const DEFAULT_MAX_DWELL_SECONDS = 2.6;
export const DEFAULT_DWELL_MOVE_THRESHOLD = 0.02;
export const DEFAULT_SUGGESTION_SPACING_SECONDS = 1.8;

const DEFAULT_AUTO_ZOOM_DURATION_SECONDS = 0.8;

export type ZoomDwellCandidate = {
  centerTime: number;
  focus: { cx: number; cy: number };
  strength: number;
  start: number;
  end: number;
};

export type DetectZoomDwellCandidatesOptions = {
  minDwellSeconds?: number;
  maxDwellSeconds?: number;
  moveThreshold?: number;
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

function cleanNumber(value: number) {
  return Number(value.toFixed(12));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizedDistance(left: NormalizedCursorPoint, right: NormalizedCursorPoint) {
  return Math.hypot(right.cx - left.cx, right.cy - left.cy);
}

function safePositive(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function safeNonNegative(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function sortedPoints(points: readonly NormalizedCursorPoint[]) {
  return [...points]
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.cx) && Number.isFinite(point.cy))
    .sort((left, right) => left.time - right.time);
}

function candidateFromRun(
  run: NormalizedCursorPoint[],
  options: Required<Pick<DetectZoomDwellCandidatesOptions, "minDwellSeconds" | "maxDwellSeconds" | "moveThreshold">>,
): ZoomDwellCandidate | undefined {
  if (run.length < 2) {
    return undefined;
  }

  const start = run[0].time;
  const end = run[run.length - 1].time;
  const duration = end - start;

  if (duration < options.minDwellSeconds || duration > options.maxDwellSeconds) {
    return undefined;
  }

  const focus = run.reduce(
    (total, point) => ({
      cx: total.cx + clamp(point.cx, 0, 1),
      cy: total.cy + clamp(point.cy, 0, 1),
    }),
    { cx: 0, cy: 0 },
  );

  return {
    centerTime: cleanNumber(start + duration / 2),
    focus: {
      cx: cleanNumber(focus.cx / run.length),
      cy: cleanNumber(focus.cy / run.length),
    },
    strength: cleanNumber(duration),
    start: cleanNumber(start),
    end: cleanNumber(end),
  };
}

export function detectZoomDwellCandidates(
  points: readonly NormalizedCursorPoint[],
  options: DetectZoomDwellCandidatesOptions = {},
): ZoomDwellCandidate[] {
  const sorted = sortedPoints(points);

  if (sorted.length < 2) {
    return [];
  }

  const dwellOptions = {
    minDwellSeconds: safePositive(options.minDwellSeconds, DEFAULT_MIN_DWELL_SECONDS),
    maxDwellSeconds: safePositive(options.maxDwellSeconds, DEFAULT_MAX_DWELL_SECONDS),
    moveThreshold: safePositive(options.moveThreshold, DEFAULT_DWELL_MOVE_THRESHOLD),
  };
  const candidates: ZoomDwellCandidate[] = [];
  let run: NormalizedCursorPoint[] = [sorted[0]];

  for (let index = 1; index < sorted.length; index += 1) {
    const point = sorted[index];
    const previous = sorted[index - 1];

    if (normalizedDistance(previous, point) > dwellOptions.moveThreshold) {
      const candidate = candidateFromRun(run, dwellOptions);
      if (candidate) candidates.push(candidate);
      run = [point];
    } else {
      run.push(point);
    }
  }

  const finalCandidate = candidateFromRun(run, dwellOptions);
  if (finalCandidate) candidates.push(finalCandidate);

  return candidates;
}

function rangesOverlap(left: { start: number; end: number }, right: { start: number; end: number }) {
  return left.start < right.end && left.end > right.start;
}

function formatAutoZoomId(prefix: string, index: number) {
  return `${prefix}_${String(index).padStart(3, "0")}`;
}

function nextAutoZoomId(prefix: string, usedIds: Set<string>) {
  let index = 1;
  let id = formatAutoZoomId(prefix, index);

  while (usedIds.has(id)) {
    index += 1;
    id = formatAutoZoomId(prefix, index);
  }

  usedIds.add(id);
  return id;
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

export function suggestAutoZooms(
  cursorEvents: readonly CursorEvent[],
  existingZooms: readonly ZoomKeyframe[],
  options: SuggestAutoZoomsOptions,
): ZoomKeyframe[] {
  const projectDuration = safePositive(options.duration, 0);
  const zoomDuration = safePositive(options.defaultDurationSeconds, DEFAULT_AUTO_ZOOM_DURATION_SECONDS);
  const minSpacingSeconds = safeNonNegative(options.minSpacingSeconds, DEFAULT_SUGGESTION_SPACING_SECONDS);
  const excludeExistingZooms = options.excludeExistingZooms ?? true;
  const idPrefix = options.idPrefix ?? "auto_zoom";
  const easing = options.easing ?? "easeInOut";
  const usedIds = new Set(existingZooms.map((zoom) => zoom.id));

  if (projectDuration <= 0) {
    return [];
  }

  const normalized = cursorEvents.flatMap((event) =>
    normalizeCursorTelemetry([event], {
      frame: frameAtTime(options, event.time),
      duration: projectDuration,
    }),
  );
  const candidates = detectZoomDwellCandidates(normalized, options).sort((left, right) => {
    if (right.strength !== left.strength) return right.strength - left.strength;
    return left.centerTime - right.centerTime;
  });
  const accepted: ZoomKeyframe[] = [];

  for (const candidate of candidates) {
    if (accepted.some((zoom) => Math.abs((zoom.start + zoom.end) / 2 - candidate.centerTime) < minSpacingSeconds)) {
      continue;
    }

    const range = zoomRange(candidate.centerTime, zoomDuration, projectDuration);
    if (range.end <= range.start) {
      continue;
    }

    if (excludeExistingZooms && existingZooms.some((zoom) => rangesOverlap(range, zoom))) {
      continue;
    }

    const id = nextAutoZoomId(idPrefix, usedIds);
    accepted.push({
      id,
      start: range.start,
      end: range.end,
      target: targetRect(candidate.focus, frameAtTime(options, candidate.centerTime), options.targetSize),
      easing,
    });
  }

  return accepted.sort((left, right) => left.start - right.start);
}
