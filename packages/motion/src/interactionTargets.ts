import type { CursorEvent, ZoomKeyframe } from "@tinker/project-schema";
import { normalizeCursorTelemetry, type MotionFrame, type NormalizedCursorPoint } from "./cursorTelemetry.js";

export const DEFAULT_MIN_DWELL_SECONDS = 0.45;
export const DEFAULT_MAX_DWELL_SECONDS = 2.6;
export const DEFAULT_DWELL_MOVE_THRESHOLD = 0.02;
export const DEFAULT_SUGGESTION_SPACING_SECONDS = 1.8;
export const DEFAULT_AUTO_ZOOM_DURATION_SECONDS = 0.8;
export const DEFAULT_CLICK_LEAD_SECONDS = 0.25;
export const DEFAULT_CLICK_HOLD_SECONDS = 1.1;
export const DEFAULT_EXPLICIT_HOLD_SECONDS = 2.5;
export const DEFAULT_CLOSE_FOCUS_DISTANCE = 0.1;

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

export type ExplicitInteractionTarget = {
  id: string;
  time: number;
  x: number;
  y: number;
  width: number;
  height: number;
  holdSeconds?: number;
};

export type InteractionFocusCandidate = {
  id: string;
  kind: "click" | "explicit" | "dwell";
  start: number;
  end: number;
  centerTime: number;
  focus: { cx: number; cy: number };
  targetSize?: { width: number; height: number };
  confidence: number;
  priority: number;
  sourceIndex: number;
  zoomId?: string;
};

export type BuildInteractionFocusCandidatesOptions = {
  duration: number;
  frame: MotionFrame;
  frameAtTime?: (time: number) => MotionFrame | undefined;
  targetSize?: { width: number; height: number };
  minSpacingSeconds?: number;
  explicitTargets?: readonly ExplicitInteractionTarget[];
  clickLeadSeconds?: number;
  clickHoldSeconds?: number;
  explicitHoldSeconds?: number;
  closeFocusDistance?: number;
} & DetectZoomDwellCandidatesOptions;

export type SuggestInteractionZoomsOptions = BuildInteractionFocusCandidatesOptions & {
  idPrefix?: string;
  defaultDurationSeconds?: number;
  excludeExistingZooms?: boolean;
  easing?: ZoomKeyframe["easing"];
};

function cleanNumber(value: number) {
  return Number(value.toFixed(12));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizedDistance(left: { cx: number; cy: number }, right: { cx: number; cy: number }) {
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

function formatId(prefix: string, index: number) {
  return `${prefix}_${String(index).padStart(3, "0")}`;
}

function frameAtTime(
  options: Pick<BuildInteractionFocusCandidatesOptions, "frame" | "frameAtTime">,
  time: number,
) {
  return options.frameAtTime?.(time) ?? options.frame;
}

function defaultTargetSize(frame: MotionFrame, targetSize?: { width: number; height: number }) {
  const width = safePositive(frame.width, 1);
  const height = safePositive(frame.height, 1);

  return {
    width: cleanNumber(clamp(safePositive(targetSize?.width, width * 0.55), 1, width)),
    height: cleanNumber(clamp(safePositive(targetSize?.height, height * 0.55), 1, height)),
  };
}

function targetArea(target: { width: number; height: number }) {
  return safePositive(target.width, 0) * safePositive(target.height, 0);
}

function containsPoint(target: ExplicitInteractionTarget, point: { x: number; y: number }) {
  return point.x >= target.x && point.x <= target.x + target.width && point.y >= target.y && point.y <= target.y + target.height;
}

function boundedRange(start: number, end: number, duration: number) {
  const boundedStart = clamp(start, 0, duration);
  const boundedEnd = clamp(end, 0, duration);

  return {
    start: cleanNumber(Math.min(boundedStart, boundedEnd)),
    end: cleanNumber(Math.max(boundedStart, boundedEnd)),
  };
}

function explicitCandidate(
  target: ExplicitInteractionTarget,
  sourceIndex: number,
  options: BuildInteractionFocusCandidatesOptions,
): InteractionFocusCandidate | undefined {
  const frame = frameAtTime(options, target.time);
  const frameWidth = safePositive(frame.width, 1);
  const frameHeight = safePositive(frame.height, 1);
  const holdSeconds = safePositive(target.holdSeconds, safePositive(options.explicitHoldSeconds, DEFAULT_EXPLICIT_HOLD_SECONDS));
  const range = boundedRange(target.time, target.time + holdSeconds, safePositive(options.duration, 0));

  if (range.end <= range.start) {
    return undefined;
  }

  return {
    id: formatId("explicit", sourceIndex + 1),
    kind: "explicit",
    start: range.start,
    end: range.end,
    centerTime: cleanNumber(clamp(target.time, 0, safePositive(options.duration, 0))),
    focus: {
      cx: cleanNumber(clamp((target.x + target.width / 2) / frameWidth, 0, 1)),
      cy: cleanNumber(clamp((target.y + target.height / 2) / frameHeight, 0, 1)),
    },
    targetSize: { width: cleanNumber(target.width), height: cleanNumber(target.height) },
    confidence: 1.5,
    priority: 2,
    sourceIndex,
    zoomId: target.id,
  };
}

function clickTargetSize(
  clickPoint: NormalizedCursorPoint,
  clickRange: { start: number; end: number },
  explicitTargets: readonly ExplicitInteractionTarget[],
  options: BuildInteractionFocusCandidatesOptions,
) {
  const fallback = defaultTargetSize(frameAtTime(options, clickPoint.time), options.targetSize);
  let best: { width: number; height: number } | undefined;

  for (const target of explicitTargets) {
    const explicitSize = { width: target.width, height: target.height };
    const holdSeconds = safePositive(target.holdSeconds, safePositive(options.explicitHoldSeconds, DEFAULT_EXPLICIT_HOLD_SECONDS));
    const explicitRange = boundedRange(target.time, target.time + holdSeconds, safePositive(options.duration, 0));

    if (
      !rangesOverlap(clickRange, explicitRange) ||
      !containsPoint(target, clickPoint) ||
      targetArea(explicitSize) >= targetArea(fallback)
    ) {
      continue;
    }

    if (!best || targetArea(explicitSize) < targetArea(best)) {
      best = explicitSize;
    }
  }

  return best ? { width: cleanNumber(best.width), height: cleanNumber(best.height) } : fallback;
}

function clickCandidate(
  point: NormalizedCursorPoint,
  sourceIndex: number,
  options: BuildInteractionFocusCandidatesOptions,
): InteractionFocusCandidate | undefined {
  const duration = safePositive(options.duration, 0);
  const leadSeconds = safeNonNegative(options.clickLeadSeconds, DEFAULT_CLICK_LEAD_SECONDS);
  const holdSeconds = safeNonNegative(options.clickHoldSeconds, DEFAULT_CLICK_HOLD_SECONDS);
  const range = boundedRange(point.time - leadSeconds, point.time + holdSeconds, duration);

  if (range.end <= range.start) {
    return undefined;
  }

  return {
    id: formatId("click", sourceIndex + 1),
    kind: "click",
    start: range.start,
    end: range.end,
    centerTime: cleanNumber(point.time),
    focus: { cx: cleanNumber(point.cx), cy: cleanNumber(point.cy) },
    targetSize: clickTargetSize(point, range, options.explicitTargets ?? [], options),
    confidence: 2,
    priority: 3,
    sourceIndex,
  };
}

function dwellCandidate(candidate: ZoomDwellCandidate, sourceIndex: number): InteractionFocusCandidate {
  return {
    id: formatId("dwell", sourceIndex + 1),
    kind: "dwell",
    start: candidate.start,
    end: candidate.end,
    centerTime: candidate.centerTime,
    focus: candidate.focus,
    confidence: candidate.strength,
    priority: 1,
    sourceIndex,
  };
}

function compareCandidates(left: InteractionFocusCandidate, right: InteractionFocusCandidate) {
  if (right.priority !== left.priority) return right.priority - left.priority;
  if (right.confidence !== left.confidence) return right.confidence - left.confidence;
  if (left.start !== right.start) return left.start - right.start;
  if (left.centerTime !== right.centerTime) return left.centerTime - right.centerTime;
  if (left.sourceIndex !== right.sourceIndex) return left.sourceIndex - right.sourceIndex;
  return left.id.localeCompare(right.id);
}

function shouldSkipCandidate(
  candidate: InteractionFocusCandidate,
  accepted: readonly InteractionFocusCandidate[],
  options: Required<Pick<BuildInteractionFocusCandidatesOptions, "minSpacingSeconds" | "closeFocusDistance">>,
) {
  for (const existing of accepted) {
    if (candidate.kind === "explicit" && existing.kind === "explicit" && rangesOverlap(candidate, existing)) {
      if (normalizedDistance(candidate.focus, existing.focus) <= options.closeFocusDistance) {
        existing.start = cleanNumber(Math.min(existing.start, candidate.start));
        existing.end = cleanNumber(Math.max(existing.end, candidate.end));
        return true;
      }

      continue;
    }

    if (rangesOverlap(candidate, existing)) {
      return true;
    }

    if (Math.abs(existing.centerTime - candidate.centerTime) < options.minSpacingSeconds) {
      return true;
    }
  }

  return false;
}

export function buildInteractionFocusCandidates(
  cursorEvents: readonly CursorEvent[],
  options: BuildInteractionFocusCandidatesOptions,
): InteractionFocusCandidate[] {
  const duration = safePositive(options.duration, 0);

  if (duration <= 0) {
    return [];
  }

  const normalized = cursorEvents.flatMap((event) =>
    normalizeCursorTelemetry([event], {
      frame: frameAtTime(options, event.time),
      duration,
    }),
  );
  const rawCandidates: InteractionFocusCandidate[] = [];

  let clickIndex = 0;

  for (const point of normalized) {
    if (point.type === "click") {
      const candidate = clickCandidate(point, clickIndex, options);
      clickIndex += 1;
      if (candidate) rawCandidates.push(candidate);
    }
  }

  for (const [index, target] of (options.explicitTargets ?? []).entries()) {
    const candidate = explicitCandidate(target, index, options);
    if (candidate) rawCandidates.push(candidate);
  }

  detectZoomDwellCandidates(normalized, options).forEach((candidate, index) => {
    rawCandidates.push(dwellCandidate(candidate, index));
  });

  const selectionOptions = {
    minSpacingSeconds: safeNonNegative(options.minSpacingSeconds, DEFAULT_SUGGESTION_SPACING_SECONDS),
    closeFocusDistance: safePositive(options.closeFocusDistance, DEFAULT_CLOSE_FOCUS_DISTANCE),
  };
  const accepted: InteractionFocusCandidate[] = [];

  for (const candidate of rawCandidates.sort(compareCandidates)) {
    if (!shouldSkipCandidate(candidate, accepted, selectionOptions)) {
      accepted.push(candidate);
    }
  }

  return accepted.sort((left, right) => left.start - right.start || right.priority - left.priority || left.id.localeCompare(right.id));
}

function targetRect(
  focus: InteractionFocusCandidate["focus"],
  frame: MotionFrame,
  targetSize?: { width: number; height: number },
): ZoomKeyframe["target"] {
  const frameWidth = safePositive(frame.width, 1);
  const frameHeight = safePositive(frame.height, 1);
  const size = defaultTargetSize(frame, targetSize);
  const width = clamp(size.width, 1, frameWidth);
  const height = clamp(size.height, 1, frameHeight);
  const centerX = clamp(focus.cx, 0, 1) * frameWidth;
  const centerY = clamp(focus.cy, 0, 1) * frameHeight;

  return {
    x: cleanNumber(clamp(centerX - width / 2, 0, frameWidth - width)),
    y: cleanNumber(clamp(centerY - height / 2, 0, frameHeight - height)),
    width: cleanNumber(width),
    height: cleanNumber(height),
  };
}

function nextAutoZoomId(prefix: string, usedIds: Set<string>) {
  let index = 1;
  let id = formatId(prefix, index);

  while (usedIds.has(id)) {
    index += 1;
    id = formatId(prefix, index);
  }

  usedIds.add(id);
  return id;
}

function candidateZoomId(candidate: InteractionFocusCandidate, idPrefix: string, usedIds: Set<string>) {
  if (candidate.zoomId && !usedIds.has(candidate.zoomId)) {
    usedIds.add(candidate.zoomId);
    return candidate.zoomId;
  }

  return nextAutoZoomId(idPrefix, usedIds);
}

function zoomRange(centerTime: number, duration: number, projectDuration: number) {
  const boundedDuration = clamp(duration, 0, projectDuration);
  const start = clamp(centerTime - boundedDuration / 2, 0, Math.max(0, projectDuration - boundedDuration));
  const end = clamp(start + boundedDuration, 0, projectDuration);

  return { start: cleanNumber(start), end: cleanNumber(end) };
}

function candidateZoomRange(candidate: InteractionFocusCandidate, options: SuggestInteractionZoomsOptions) {
  if (candidate.kind !== "dwell") {
    return { start: candidate.start, end: candidate.end };
  }

  return zoomRange(
    candidate.centerTime,
    safePositive(options.defaultDurationSeconds, DEFAULT_AUTO_ZOOM_DURATION_SECONDS),
    safePositive(options.duration, 0),
  );
}

function candidateTargetSize(candidate: InteractionFocusCandidate, options: SuggestInteractionZoomsOptions) {
  return candidate.targetSize ?? (candidate.kind === "dwell" ? options.targetSize : undefined);
}

export function suggestInteractionZooms(
  cursorEvents: readonly CursorEvent[],
  existingZooms: readonly ZoomKeyframe[],
  options: SuggestInteractionZoomsOptions,
): ZoomKeyframe[] {
  const excludeExistingZooms = options.excludeExistingZooms ?? true;
  const idPrefix = options.idPrefix ?? "auto_zoom";
  const easing = options.easing ?? "easeInOut";
  const usedIds = new Set(existingZooms.map((zoom) => zoom.id));
  const candidates = buildInteractionFocusCandidates(cursorEvents, options)
    .map((candidate) => ({ candidate, zoomRange: candidateZoomRange(candidate, options) }))
    .filter(({ zoomRange }) => zoomRange.end > zoomRange.start)
    .filter(
      ({ zoomRange }) => !excludeExistingZooms || !existingZooms.some((existing) => rangesOverlap(zoomRange, existing)),
    );
  const idsByCandidate = new Map<InteractionFocusCandidate, string>();

  for (const { candidate } of [...candidates].sort((left, right) => compareCandidates(left.candidate, right.candidate))) {
    idsByCandidate.set(candidate, candidateZoomId(candidate, idPrefix, usedIds));
  }

  return candidates
    .map(({ candidate, zoomRange }) => ({
      id: idsByCandidate.get(candidate) ?? candidateZoomId(candidate, idPrefix, usedIds),
      start: zoomRange.start,
      end: zoomRange.end,
      target: targetRect(candidate.focus, frameAtTime(options, candidate.centerTime), candidateTargetSize(candidate, options)),
      easing,
    }))
    .sort((left, right) => left.start - right.start || left.id.localeCompare(right.id));
}
