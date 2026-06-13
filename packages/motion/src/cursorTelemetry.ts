import type { CursorEvent } from "@tinker/project-schema";

export type MotionFrame = { width: number; height: number };

export type NormalizedCursorPoint = {
  time: number;
  cx: number;
  cy: number;
  x: number;
  y: number;
  type: CursorEvent["type"];
  id?: string;
  label?: string;
};

type SmoothingOptions = { strength?: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function finitePositiveOrZero(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

function cleanNumber(value: number) {
  return Number(value.toFixed(12));
}

function inferFrame(points: readonly NormalizedCursorPoint[]): MotionFrame {
  let width = 0;
  let height = 0;

  for (const point of points) {
    if (point.cx > 0) {
      width = Math.max(width, point.x / point.cx);
    } else {
      width = Math.max(width, point.x);
    }

    if (point.cy > 0) {
      height = Math.max(height, point.y / point.cy);
    } else {
      height = Math.max(height, point.y);
    }
  }

  return { width: finitePositiveOrZero(width), height: finitePositiveOrZero(height) };
}

function sortedPoints(points: readonly NormalizedCursorPoint[]) {
  return [...points].sort((left, right) => left.time - right.time);
}

function pointWithPosition(
  source: NormalizedCursorPoint,
  position: { time: number; x: number; y: number; cx: number; cy: number },
  options: { preserveMetadata?: boolean; type?: NormalizedCursorPoint["type"] } = {},
): NormalizedCursorPoint {
  const preserveMetadata = options.preserveMetadata ?? true;

  return {
    time: cleanNumber(position.time),
    type: options.type ?? source.type,
    x: cleanNumber(position.x),
    y: cleanNumber(position.y),
    cx: cleanNumber(position.cx),
    cy: cleanNumber(position.cy),
    ...(preserveMetadata && source.id ? { id: source.id } : {}),
    ...(preserveMetadata && source.label ? { label: source.label } : {}),
  };
}

export function normalizeCursorTelemetry(
  events: readonly CursorEvent[],
  options: { frame: MotionFrame; duration?: number },
): NormalizedCursorPoint[] {
  const width = finitePositiveOrZero(options.frame.width);
  const height = finitePositiveOrZero(options.frame.height);
  const hasDuration = options.duration !== undefined && Number.isFinite(options.duration);
  const duration = hasDuration ? Math.max(0, options.duration ?? 0) : undefined;

  return events
    .filter((event) => event.type !== "scroll")
    .filter((event) => Number.isFinite(event.time) && Number.isFinite(event.x) && Number.isFinite(event.y))
    .map((event) => {
      const time = duration === undefined ? event.time : clamp(event.time, 0, duration);
      const x = clamp(event.x, 0, width);
      const y = clamp(event.y, 0, height);

      return {
        time,
        type: event.type,
        x,
        y,
        cx: width === 0 ? 0 : clamp(x / width, 0, 1),
        cy: height === 0 ? 0 : clamp(y / height, 0, 1),
        ...(event.id ? { id: event.id } : {}),
        ...("label" in event && event.label ? { label: event.label } : {}),
      };
    })
    .sort((left, right) => left.time - right.time);
}

export function interpolateCursorPosition(
  points: readonly NormalizedCursorPoint[],
  time: number,
): NormalizedCursorPoint | undefined {
  if (points.length === 0 || !Number.isFinite(time)) {
    return undefined;
  }

  const sorted = sortedPoints(points);
  const first = sorted[0];

  if (time < first.time) {
    return undefined;
  }

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const left = sorted[index];
    const right = sorted[index + 1];

    if (time === left.time) {
      return { ...left };
    }

    if (time >= left.time && time <= right.time) {
      const span = right.time - left.time;
      const progress = span === 0 ? 0 : (time - left.time) / span;

      return pointWithPosition(left, {
        time,
        x: lerp(left.x, right.x, progress),
        y: lerp(left.y, right.y, progress),
        cx: lerp(left.cx, right.cx, progress),
        cy: lerp(left.cy, right.cy, progress),
      }, {
        preserveMetadata: false,
        type: "move",
      });
    }
  }

  return { ...sorted[sorted.length - 1] };
}

export function smoothCursorTelemetry(
  points: readonly NormalizedCursorPoint[],
  options: SmoothingOptions = {},
): NormalizedCursorPoint[] {
  if (points.length === 0) {
    return [];
  }

  const sorted = sortedPoints(points);
  const frame = inferFrame(sorted);
  const strength = clamp(options.strength ?? 0.35, 0, 0.95);
  const follow = 1 - strength;
  let smoothCx = clamp(sorted[0].cx, 0, 1);
  let smoothCy = clamp(sorted[0].cy, 0, 1);

  return sorted.map((point, index) => {
    const targetCx = clamp(point.cx, 0, 1);
    const targetCy = clamp(point.cy, 0, 1);

    if (index === 0) {
      smoothCx = targetCx;
      smoothCy = targetCy;
    } else {
      smoothCx = clamp(smoothCx + (targetCx - smoothCx) * follow, 0, 1);
      smoothCy = clamp(smoothCy + (targetCy - smoothCy) * follow, 0, 1);
    }

    return pointWithPosition(point, {
      time: point.time,
      cx: smoothCx,
      cy: smoothCy,
      x: clamp(smoothCx * frame.width, 0, frame.width),
      y: clamp(smoothCy * frame.height, 0, frame.height),
    });
  });
}

export function sampleSmoothedCursor(
  points: readonly NormalizedCursorPoint[],
  time: number,
  options?: SmoothingOptions,
): NormalizedCursorPoint | undefined {
  return interpolateCursorPosition(smoothCursorTelemetry(points, options), time);
}
