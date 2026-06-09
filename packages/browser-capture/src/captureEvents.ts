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
