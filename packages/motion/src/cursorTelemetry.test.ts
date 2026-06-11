import type { CursorEvent } from "@tinker/project-schema";
import { describe, expect, it } from "vitest";
import {
  interpolateCursorPosition,
  normalizeCursorTelemetry,
  sampleSmoothedCursor,
  smoothCursorTelemetry,
} from "./cursorTelemetry.js";

describe("cursor telemetry", () => {
  const frame = { width: 200, height: 100 };

  it("filters invalid cursor events and clamps valid events deterministically", () => {
    const events = [
      { time: Number.NaN, type: "move", x: 40, y: 50 },
      { time: 12, type: "click", x: 250, y: -10, id: "click-1", label: "Launch" },
      { time: 3, type: "scroll", x: Infinity, y: 25 },
      { time: -2, type: "move", x: 20, y: 30 },
    ] as CursorEvent[];

    const normalized = normalizeCursorTelemetry(events, { frame, duration: 10 });

    expect(normalized).toEqual([
      { time: 0, type: "move", x: 20, y: 30, cx: 0.1, cy: 0.3 },
      { time: 10, type: "click", x: 200, y: 0, cx: 1, cy: 0, id: "click-1", label: "Launch" },
    ]);
    expect(events[1]).toEqual({ time: 12, type: "click", x: 250, y: -10, id: "click-1", label: "Launch" });
  });

  it("sorts cursor events by time before processing", () => {
    const normalized = normalizeCursorTelemetry(
      [
        { time: 4, type: "move", x: 40, y: 40 },
        { time: 1, type: "scroll", x: 10, y: 10, deltaX: 0, deltaY: 40 },
        { time: 3, type: "click", x: 30, y: 30 },
      ],
      { frame },
    );

    expect(normalized.map((point) => point.time)).toEqual([1, 3, 4]);
    expect(normalized.map((point) => point.type)).toEqual(["scroll", "click", "move"]);
  });

  it("converts cursor positions between pixel and normalized coordinates", () => {
    const normalized = normalizeCursorTelemetry([{ time: 2, type: "move", x: 50, y: 75 }], {
      frame: { width: 200, height: 300 },
    });

    expect(normalized[0]).toEqual({ time: 2, type: "move", x: 50, y: 75, cx: 0.25, cy: 0.25 });
  });

  it("keeps smoothed cursor positions inside normalized bounds", () => {
    const points = normalizeCursorTelemetry(
      [
        { time: 0, type: "move", x: 0, y: 0 },
        { time: 0.1, type: "move", x: 200, y: 100 },
        { time: 0.2, type: "move", x: 0, y: 100 },
        { time: 0.3, type: "move", x: 200, y: 0 },
      ],
      { frame },
    );

    const smoothed = smoothCursorTelemetry(points, { strength: 0.85 });
    const sampled = sampleSmoothedCursor(points, 0.15, { strength: 0.85 });

    for (const point of [...smoothed, sampled].filter((point) => point !== undefined)) {
      expect(point.cx).toBeGreaterThanOrEqual(0);
      expect(point.cx).toBeLessThanOrEqual(1);
      expect(point.cy).toBeGreaterThanOrEqual(0);
      expect(point.cy).toBeLessThanOrEqual(1);
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(frame.width);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(frame.height);
    }
  });

  it("interpolates cursor positions before, between, and after points", () => {
    const points = normalizeCursorTelemetry(
      [
        { time: 1, type: "move", x: 20, y: 10 },
        { time: 3, type: "click", x: 100, y: 50, id: "target", label: "Select" },
      ],
      { frame },
    );

    expect(interpolateCursorPosition(points, 0.5)).toBeUndefined();
    expect(interpolateCursorPosition(points, 2)).toEqual({
      time: 2,
      type: "move",
      x: 60,
      y: 30,
      cx: 0.3,
      cy: 0.3,
    });
    expect(interpolateCursorPosition(points, 4)).toEqual(points[1]);
  });

  it("does not carry click metadata onto interpolated in-between positions", () => {
    const points = normalizeCursorTelemetry(
      [
        { time: 1, type: "click", x: 20, y: 10, id: "click-1", label: "Open" },
        { time: 3, type: "move", x: 100, y: 50 },
      ],
      { frame },
    );

    expect(interpolateCursorPosition(points, 2)).toEqual({
      time: 2,
      type: "move",
      x: 60,
      y: 30,
      cx: 0.3,
      cy: 0.3,
    });
    expect(interpolateCursorPosition(points, 1)).toEqual(points[0]);
  });
});
