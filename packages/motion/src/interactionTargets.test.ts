import type { CursorEvent, ZoomKeyframe } from "@tinker/project-schema";
import { describe, expect, it } from "vitest";
import {
  buildInteractionFocusCandidates,
  detectZoomDwellCandidates,
  suggestInteractionZooms,
  type ExplicitInteractionTarget,
  type InteractionFocusCandidate,
  type ZoomDwellCandidate,
} from "./interactionTargets.js";
import type { NormalizedCursorPoint } from "./cursorTelemetry.js";

const frame = { width: 1000, height: 1000 };

function point(time: number, cx: number, cy: number): NormalizedCursorPoint {
  return { time, cx, cy, x: cx * frame.width, y: cy * frame.height, type: "move" };
}

function move(time: number, x: number, y: number): CursorEvent {
  return { type: "move", time, x, y };
}

function click(time: number, x: number, y: number): CursorEvent {
  return { type: "click", time, x, y, label: "Click" };
}

function explicit(overrides: Partial<ExplicitInteractionTarget> = {}): ExplicitInteractionTarget {
  return {
    id: "zoom-0",
    time: 2,
    x: 120,
    y: 140,
    width: 160,
    height: 90,
    holdSeconds: 2.5,
    ...overrides,
  };
}

describe("interaction target candidates", () => {
  it("keeps the existing dwell detector behavior available from the shared module", () => {
    const candidates = detectZoomDwellCandidates([
      point(1, 0.4, 0.55),
      point(1.3, 0.405, 0.545),
      point(1.8, 0.395, 0.555),
    ]);

    expect(candidates).toEqual<ZoomDwellCandidate[]>([
      {
        centerTime: 1.4,
        focus: { cx: 0.4, cy: 0.55 },
        strength: 0.8,
        start: 1,
        end: 1.8,
      },
    ]);
  });

  it("creates a click candidate centered on the exact click point during movement", () => {
    const candidates = buildInteractionFocusCandidates(
      [move(1.7, 200, 200), click(2, 640, 360), move(2.2, 900, 800)],
      { duration: 5, frame },
    );

    expect(candidates[0]).toMatchObject<Partial<InteractionFocusCandidate>>({
      id: "click_001",
      kind: "click",
      start: 1.75,
      end: 3.1,
      centerTime: 2,
      focus: { cx: 0.64, cy: 0.36 },
      confidence: 2,
    });
  });

  it("orders an overlapping click ahead of a stronger dwell candidate", () => {
    const candidates = buildInteractionFocusCandidates(
      [move(1.2, 300, 300), move(1.7, 301, 301), click(1.9, 760, 240), move(2.1, 302, 302)],
      { duration: 5, frame, minSpacingSeconds: 0 },
    );

    expect(candidates.map((candidate) => candidate.kind)).toEqual(["click"]);
    expect(candidates[0]?.focus).toEqual({ cx: 0.76, cy: 0.24 });
  });

  it("preserves an explicit target when no click overlaps it", () => {
    const candidates = buildInteractionFocusCandidates([], {
      duration: 6,
      frame,
      explicitTargets: [explicit({ time: 2, x: 100, y: 200, width: 150, height: 80 })],
    });

    expect(candidates).toEqual<InteractionFocusCandidate[]>([
      {
        id: "explicit_001",
        kind: "explicit",
        start: 2,
        end: 4.5,
        centerTime: 2,
        focus: { cx: 0.175, cy: 0.24 },
        targetSize: { width: 150, height: 80 },
        confidence: 1.5,
        priority: 2,
        sourceIndex: 0,
        zoomId: "zoom-0",
      },
    ]);
  });

  it("refines a broad explicit target toward a nearby click while borrowing only tighter target size", () => {
    const candidates = buildInteractionFocusCandidates([click(2.1, 640, 360)], {
      duration: 6,
      frame,
      explicitTargets: [explicit({ time: 2, x: 0, y: 0, width: 1000, height: 1000 })],
      targetSize: { width: 550, height: 550 },
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject<Partial<InteractionFocusCandidate>>({
      kind: "click",
      focus: { cx: 0.64, cy: 0.36 },
      targetSize: { width: 550, height: 550 },
    });
  });

  it("lets a nearby tight explicit target contribute click target size", () => {
    const candidates = buildInteractionFocusCandidates([click(2.1, 640, 360)], {
      duration: 6,
      frame,
      explicitTargets: [explicit({ time: 2, x: 600, y: 330, width: 90, height: 60 })],
      targetSize: { width: 550, height: 550 },
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject<Partial<InteractionFocusCandidate>>({
      kind: "click",
      focus: { cx: 0.64, cy: 0.36 },
      targetSize: { width: 90, height: 60 },
    });
  });

  it("does not borrow click target size from a temporally distant explicit target", () => {
    const candidates = buildInteractionFocusCandidates([click(4.5, 640, 360)], {
      duration: 8,
      frame,
      explicitTargets: [explicit({ time: 1, x: 600, y: 330, width: 90, height: 60, holdSeconds: 1 })],
      targetSize: { width: 550, height: 550 },
    });

    const clickCandidate = candidates.find((candidate) => candidate.kind === "click");

    expect(clickCandidate).toMatchObject<Partial<InteractionFocusCandidate>>({
      kind: "click",
      focus: { cx: 0.64, cy: 0.36 },
      targetSize: { width: 550, height: 550 },
    });
  });

  it("does not merge overlapping explicit targets with distant focus points", () => {
    const zooms = suggestInteractionZooms([], [], {
      duration: 6,
      frame,
      minSpacingSeconds: 0,
      explicitTargets: [
        explicit({ id: "zoom-left", time: 1, x: 100, y: 100, width: 100, height: 100 }),
        explicit({ id: "zoom-right", time: 2, x: 700, y: 100, width: 100, height: 100 }),
      ],
    });

    expect(zooms.map((zoom) => zoom.id)).toEqual(["zoom-left", "zoom-right"]);
    expect(zooms.map((zoom) => zoom.target)).toEqual([
      { x: 100, y: 100, width: 100, height: 100 },
      { x: 700, y: 100, width: 100, height: 100 },
    ]);
  });

  it("merges close overlapping explicit targets into one combined time window", () => {
    const candidates = buildInteractionFocusCandidates([], {
      duration: 6,
      frame,
      minSpacingSeconds: 0,
      explicitTargets: [
        explicit({ id: "zoom-a", time: 1, x: 100, y: 100, width: 100, height: 100, holdSeconds: 2.5 }),
        explicit({ id: "zoom-b", time: 2, x: 120, y: 110, width: 100, height: 100, holdSeconds: 2 }),
      ],
    });

    expect(candidates).toEqual<InteractionFocusCandidate[]>([
      {
        id: "explicit_001",
        kind: "explicit",
        start: 1,
        end: 4,
        centerTime: 1,
        focus: { cx: 0.15, cy: 0.15 },
        targetSize: { width: 100, height: 100 },
        confidence: 1.5,
        priority: 2,
        sourceIndex: 0,
        zoomId: "zoom-a",
      },
    ]);
  });

  it("does not reserve prefixed IDs for candidates skipped by existing zoom overlap", () => {
    const existing: ZoomKeyframe[] = [
      { id: "manual_zoom", start: 1.8, end: 2.5, target: { x: 0, y: 0, width: 100, height: 100 }, easing: "linear" },
    ];
    const zooms = suggestInteractionZooms([click(2, 600, 400), click(6, 600, 400)], existing, {
      duration: 8,
      frame,
      idPrefix: "auto_zoom",
      minSpacingSeconds: 0,
    });

    expect(zooms.map((zoom) => zoom.id)).toEqual(["auto_zoom_001"]);
    expect(zooms[0]?.start).toBe(5.75);
  });

  it("converts accepted candidates to deterministic zoom keyframes", () => {
    const existing: ZoomKeyframe[] = [
      { id: "auto_zoom_001", start: 5, end: 6, target: { x: 0, y: 0, width: 100, height: 100 }, easing: "linear" },
    ];
    const zooms = suggestInteractionZooms([click(2, 600, 400)], existing, {
      duration: 8,
      frame,
      idPrefix: "auto_zoom",
      easing: "easeInOut",
    });

    expect(zooms).toEqual<ZoomKeyframe[]>([
      {
        id: "auto_zoom_002",
        start: 1.75,
        end: 3.1,
        target: { x: 325, y: 125, width: 550, height: 550 },
        easing: "easeInOut",
      },
    ]);
  });
});
