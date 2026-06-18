import type { CaptureEvent } from "./types.js";

type EventTiming = { startedAtMs: number; nowMs?: number };

export function secondsSince(startedAtMs: number, nowMs = Date.now()) {
  return Math.round(((nowMs - startedAtMs) / 1_000) * 1_000) / 1_000;
}

export function createClickEvent(input: EventTiming & { x: number; y: number; label?: string }): CaptureEvent {
  const time = secondsSince(input.startedAtMs, input.nowMs);
  const { x, y, label } = input;
  return label === undefined ? { time, type: "click", x, y } : { time, type: "click", x, y, label };
}

export function createCursorEvent(input: EventTiming & { x: number; y: number }): CaptureEvent {
  return { time: secondsSince(input.startedAtMs, input.nowMs), type: "cursor", x: input.x, y: input.y };
}

// Director Mode: snappier default cursor-event move (was 450ms). Callers that know the
// target geometry pass an explicit, distance-aware duration via `cursorMoveDurationMs`.
const DEFAULT_CURSOR_PATH_DURATION_MS = 220;
const DEFAULT_CURSOR_PATH_STEP_MS = 1_000 / 30;

function easeInOutProgress(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

export function createCursorPathEvents(input: {
  startedAtMs: number;
  nowMs?: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  durationMs?: number;
  stepMs?: number;
}): CaptureEvent[] {
  const nowMs = input.nowMs ?? Date.now();
  const stepMs = input.stepMs ?? DEFAULT_CURSOR_PATH_STEP_MS;
  const requestedDurationMs = input.durationMs ?? DEFAULT_CURSOR_PATH_DURATION_MS;
  const durationMs = Math.min(requestedDurationMs, Math.max(0, nowMs - input.startedAtMs));
  const distance = Math.hypot(input.to.x - input.from.x, input.to.y - input.from.y);

  if (distance < 1 || durationMs < stepMs) {
    return [
      createCursorEvent({
        startedAtMs: input.startedAtMs,
        nowMs,
        x: Math.round(input.to.x),
        y: Math.round(input.to.y),
      }),
    ];
  }

  const startMs = nowMs - durationMs;
  const steps = Math.ceil(durationMs / stepMs);
  const events: CaptureEvent[] = [];

  for (let index = 0; index <= steps; index += 1) {
    const progress = easeInOutProgress(index / steps);

    events.push(
      createCursorEvent({
        startedAtMs: input.startedAtMs,
        nowMs: startMs + (index / steps) * durationMs,
        x: Math.round(input.from.x + (input.to.x - input.from.x) * progress),
        y: Math.round(input.from.y + (input.to.y - input.from.y) * progress),
      }),
    );
  }

  return events;
}

export function createScrollEvent(
  input: EventTiming & { x: number; y: number; deltaX: number; deltaY: number },
): CaptureEvent {
  return {
    time: secondsSince(input.startedAtMs, input.nowMs),
    type: "scroll",
    x: input.x,
    y: input.y,
    deltaX: input.deltaX,
    deltaY: input.deltaY,
  };
}

export function createZoomTargetEvent(
  input: EventTiming & { x: number; y: number; width: number; height: number; label?: string },
): CaptureEvent {
  const time = secondsSince(input.startedAtMs, input.nowMs);
  const { x, y, width, height, label } = input;
  return label === undefined
    ? { time, type: "zoomTarget", x, y, width, height }
    : { time, type: "zoomTarget", x, y, width, height, label };
}
