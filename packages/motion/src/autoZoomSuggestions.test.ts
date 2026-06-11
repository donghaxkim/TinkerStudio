import type { CursorEvent, ZoomKeyframe } from "@tinker/project-schema";
import { describe, expect, it } from "vitest";
import {
  detectZoomDwellCandidates,
  suggestAutoZooms,
  type ZoomDwellCandidate,
} from "./autoZoomSuggestions.js";
import type { NormalizedCursorPoint } from "./cursorTelemetry.js";

function point(time: number, cx: number, cy: number): NormalizedCursorPoint {
  return { time, cx, cy, x: cx * 1000, y: cy * 1000, type: "move" };
}

function move(time: number, x: number, y: number): CursorEvent {
  return { time, type: "move", x, y };
}

describe("auto zoom suggestions", () => {
  it("dwell detection ignores short movement pauses", () => {
    const candidates = detectZoomDwellCandidates([
      point(0, 0.25, 0.25),
      point(0.2, 0.251, 0.251),
      point(0.36, 0.252, 0.252),
      point(0.5, 0.7, 0.7),
      point(0.7, 0.701, 0.701),
    ]);

    expect(candidates).toEqual([]);
  });

  it("dwell detection accepts sustained cursor focus", () => {
    const candidates = detectZoomDwellCandidates([
      point(1, 0.4, 0.55),
      point(1.3, 0.405, 0.545),
      point(1.8, 0.395, 0.555),
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual<ZoomDwellCandidate>({
      centerTime: 1.4,
      focus: { cx: 0.4, cy: 0.55 },
      strength: 0.8,
      start: 1,
      end: 1.8,
    });
  });

  it("dwell detection ignores pauses longer than the maximum dwell window", () => {
    const candidates = detectZoomDwellCandidates([
      point(1, 0.4, 0.55),
      point(2.5, 0.405, 0.545),
      point(4, 0.395, 0.555),
    ]);

    expect(candidates).toEqual([]);
  });

  it("auto-zoom suggestions avoid overlapping existing zooms", () => {
    const existingZooms: ZoomKeyframe[] = [
      {
        id: "zoom_001",
        start: 0.9,
        end: 2.2,
        target: { x: 100, y: 100, width: 400, height: 300 },
        easing: "easeInOut",
      },
    ];

    const suggestions = suggestAutoZooms(
      [
        move(1, 400, 300),
        move(1.5, 402, 302),
        move(2, 401, 301),
        move(4, 700, 500),
        move(4.5, 702, 502),
        move(5, 701, 501),
      ],
      existingZooms,
      { duration: 8, frame: { width: 1000, height: 800 }, minSpacingSeconds: 0 },
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.start).toBe(4.1);
  });

  it("auto-zoom suggestions enforce minimum spacing between accepted centers", () => {
    const suggestions = suggestAutoZooms(
      [
        move(1, 200, 200),
        move(1.4, 202, 202),
        move(1.8, 201, 201),
        move(2.4, 500, 500),
        move(2.8, 501, 501),
        move(3.2, 499, 499),
      ],
      [],
      { duration: 6, frame: { width: 1000, height: 1000 }, minSpacingSeconds: 1.8 },
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.id).toBe("auto_zoom_001");
    expect(suggestions[0]?.start).toBe(1);
  });

  it("allows zero minimum spacing when explicitly requested", () => {
    const suggestions = suggestAutoZooms(
      [
        move(1, 200, 200),
        move(1.4, 202, 202),
        move(1.8, 201, 201),
        move(2.4, 500, 500),
        move(2.8, 501, 501),
        move(3.2, 499, 499),
      ],
      [],
      { duration: 6, frame: { width: 1000, height: 1000 }, minSpacingSeconds: 0 },
    );

    expect(suggestions.map((zoom) => zoom.id)).toEqual(["auto_zoom_001", "auto_zoom_002"]);
  });

  it("does not reuse ids from existing zooms", () => {
    const existingZooms: ZoomKeyframe[] = [
      {
        id: "auto_zoom_001",
        start: 6,
        end: 7,
        target: { x: 100, y: 100, width: 400, height: 300 },
        easing: "easeInOut",
      },
    ];
    const suggestions = suggestAutoZooms(
      [
        move(1, 200, 200),
        move(1.4, 202, 202),
        move(1.8, 201, 201),
      ],
      existingZooms,
      { duration: 8, frame: { width: 1000, height: 1000 }, minSpacingSeconds: 0 },
    );

    expect(suggestions.map((zoom) => zoom.id)).toEqual(["auto_zoom_002"]);
  });

  it("target rect is clamped to frame and ids are deterministic", () => {
    const suggestions = suggestAutoZooms(
      [
        move(0.2, 990, 790),
        move(0.7, 992, 792),
        move(1.2, 991, 791),
        move(4, 10, 12),
        move(4.5, 11, 10),
        move(5, 12, 11),
      ],
      [],
      {
        duration: 8,
        frame: { width: 1000, height: 800 },
        idPrefix: "auto_zoom",
        targetSize: { width: 300, height: 200 },
        minSpacingSeconds: 0,
      },
    );

    expect(suggestions.map((zoom) => zoom.id)).toEqual(["auto_zoom_001", "auto_zoom_002"]);
    expect(suggestions[0]?.target).toEqual({ x: 700, y: 600, width: 300, height: 200 });
    expect(suggestions[1]?.target).toEqual({ x: 0, y: 0, width: 300, height: 200 });
  });
});
