import { describe, expect, it } from "vitest";
import type { CompositionTimelineModel, ZoomUnit } from "./compositionTimelineModel.js";
import {
  DEFAULT_ZOOM_EASING,
  DEFAULT_ZOOM_SCALE,
  DEFAULT_ZOOM_TARGET,
  MAX_ZOOM_SCALE,
  MIN_ZOOM_SCALE,
} from "./compositionTimelineModel.js";
import { clipSpeed } from "./compositionTimelineModel.js";
import {
  addMarker,
  addZoom,
  clampTrim,
  clipAt,
  moveZoom,
  removeClip,
  removeZoom,
  resizeZoom,
  setClipSpeed,
  splitClipAt,
  trimClip,
  updateZoom,
} from "./compositionEdits.js";

const model: CompositionTimelineModel = {
  durationSeconds: 12,
  clips: [
    { id: "a", label: "Intro", start: 0, end: 5 },
    { id: "b", label: "Body", start: 5, end: 12 },
  ],
  labels: [],
};

describe("clipAt", () => {
  it("returns the clip strictly under the time, not at a boundary", () => {
    expect(clipAt(model, 3)?.id).toBe("a");
    expect(clipAt(model, 8)?.id).toBe("b");
    expect(clipAt(model, 5)).toBeUndefined(); // boundary
    expect(clipAt(model, 0)).toBeUndefined();
    expect(clipAt(model, 12)).toBeUndefined();
  });
});

describe("splitClipAt", () => {
  it("splits the clip under the time into two adjacent clips with unique ids", () => {
    const next = splitClipAt(model, 3);
    expect(next.clips).toHaveLength(3);
    expect(next.clips[0]).toMatchObject({ start: 0, end: 3, label: "Intro" });
    expect(next.clips[1]).toMatchObject({ start: 3, end: 5, label: "Intro" });
    expect(next.clips[0]!.id).not.toBe(next.clips[1]!.id);
    expect(next.clips[2]).toMatchObject({ id: "b" });
  });
  it("is a no-op (same reference) at a boundary or outside any clip", () => {
    expect(splitClipAt(model, 5)).toBe(model);
    expect(splitClipAt(model, 99)).toBe(model);
  });
});

describe("removeClip", () => {
  it("removes the clip by id, leaving duration untouched", () => {
    const next = removeClip(model, "a");
    expect(next.clips.map((c) => c.id)).toEqual(["b"]);
    expect(next.durationSeconds).toBe(12);
  });
  it("is a no-op when the id is unknown", () => {
    expect(removeClip(model, "nope")).toBe(model);
  });
});

describe("addMarker", () => {
  it("adds a time-sorted marker clamped into range", () => {
    const next = addMarker(model, 7.5, "Marker 1");
    expect(next.labels).toEqual([{ name: "Marker 1", time: 7.5 }]);
    const clamped = addMarker(next, 99, "Marker 2");
    expect(clamped.labels.map((l) => l.time)).toEqual([7.5, 12]);
  });
});

const clipById = (m: CompositionTimelineModel, id: string) => m.clips.find((c) => c.id === id)!;

describe("trimClip", () => {
  it("shortens a clip's end edge and remembers the generated extent as the source bound", () => {
    const next = trimClip(model, "a", "end", 3);
    const a = clipById(next, "a");
    expect(a.start).toBe(0);
    expect(a.end).toBe(3);
    // the original end is captured so the user can extend back to it later
    expect(a.sourceEnd).toBe(5);
    // the neighbouring clip is untouched
    expect(clipById(next, "b")).toEqual(model.clips[1]);
  });

  it("extends a previously-shortened clip back toward its source bound", () => {
    const shortened = trimClip(model, "a", "end", 3);
    const extended = trimClip(shortened, "a", "end", 4.5);
    expect(clipById(extended, "a").end).toBe(4.5);
  });

  it("clamps an over-extension to the generated source bound (invalid bounds)", () => {
    const shortened = trimClip(model, "a", "end", 3);
    const over = trimClip(shortened, "a", "end", 99);
    expect(clipById(over, "a").end).toBe(5); // cannot exceed the generated source
  });

  it("adjusts a clip's start edge and clamps an extend-back to the source start", () => {
    const moved = trimClip(model, "b", "start", 8);
    const b = clipById(moved, "b");
    expect(b.start).toBe(8);
    expect(b.end).toBe(12);
    expect(b.sourceStart).toBe(5);

    const over = trimClip(moved, "b", "start", 0); // past the generated source start
    expect(clipById(over, "b").start).toBe(5);
  });

  it("won't shrink a clip below the minimum duration", () => {
    const next = trimClip(model, "a", "end", 0); // would collapse the clip to zero length
    const a = clipById(next, "a");
    expect(a.end).toBeGreaterThan(a.start);
    expect(a.end).toBeLessThan(1);
  });

  it("is a no-op (same model reference) for an unknown clip id", () => {
    expect(trimClip(model, "nope", "end", 3)).toBe(model);
  });

  it("is a no-op (same model reference) when the edge does not move", () => {
    expect(trimClip(model, "a", "end", 5)).toBe(model);
  });
});

describe("clampTrim", () => {
  it("clamps an end trim to [start + min, source end]", () => {
    expect(clampTrim(model.clips[0]!, "end", 3)).toBe(3);
    expect(clampTrim(model.clips[0]!, "end", 99)).toBe(5);
  });

  it("clamps a start trim to [source start, end - min]", () => {
    expect(clampTrim(model.clips[1]!, "start", 8)).toBe(8);
    expect(clampTrim(model.clips[1]!, "start", 0)).toBe(5);
  });
});

describe("setClipSpeed", () => {
  it("speeds a clip up, shortening its on-timeline length inversely and anchoring its start", () => {
    const next = setClipSpeed(model, "a", 2); // clip a is 0–5 (length 5)
    const a = clipById(next, "a");
    expect(clipSpeed(a)).toBe(2);
    expect(a.start).toBe(0); // start is anchored
    expect(a.end).toBe(2.5); // length 5 / 2 = 2.5
    // the neighbouring clip is untouched
    expect(clipById(next, "b")).toEqual(model.clips[1]);
  });

  it("slows a clip down, lengthening it and growing the composition so it stays in view", () => {
    const next = setClipSpeed(model, "b", 0.5); // clip b is 5–12 (length 7)
    const b = clipById(next, "b");
    expect(clipSpeed(b)).toBe(0.5);
    expect(b.end).toBe(19); // 5 + 7 / 0.5
    expect(next.durationSeconds).toBe(19); // extended past the old 12 to keep the clip readable
  });

  it("does not shrink the composition when a clip speeds up", () => {
    const next = setClipSpeed(model, "a", 2);
    expect(next.durationSeconds).toBe(12); // unchanged — other content/gaps remain
  });

  it("changing speed twice rescales from the live length, not the original", () => {
    const fast = setClipSpeed(model, "a", 2); // 0–2.5
    const slow = setClipSpeed(fast, "a", 0.5); // base length 2.5*2=5 → 5/0.5 = 10
    expect(clipById(slow, "a").end).toBe(10);
    expect(clipSpeed(clipById(slow, "a"))).toBe(0.5);
  });

  it("resets to 1x, restoring the original duration exactly", () => {
    const fast = setClipSpeed(model, "a", 2);
    expect(clipById(fast, "a").end).toBe(2.5);
    const reset = setClipSpeed(fast, "a", 1);
    expect(clipSpeed(clipById(reset, "a"))).toBe(1);
    expect(clipById(reset, "a").end).toBe(5); // back to the original 1x length
  });

  it("clamps speed into the supported range", () => {
    expect(clipSpeed(clipById(setClipSpeed(model, "a", 99), "a"))).toBe(2);
    expect(clipSpeed(clipById(setClipSpeed(model, "a", 0.01), "a"))).toBe(0.5);
  });

  it("is a no-op (same model reference) for an unknown id or an unchanged speed", () => {
    expect(setClipSpeed(model, "nope", 2)).toBe(model);
    expect(setClipSpeed(model, "a", 1)).toBe(model); // already 1x (default)
  });
});

const withZoom = (...zooms: ZoomUnit[]): CompositionTimelineModel => ({
  ...model,
  zooms,
});

describe("addZoom", () => {
  it("appends a normalized zoom unit (start/end ordered)", () => {
    const next = addZoom(model, "zoom-1", 6, 2);
    expect(next.zooms).toEqual([{ id: "zoom-1", start: 2, end: 6 }]);
    // the rest of the model is untouched
    expect(next.clips).toBe(model.clips);
  });

  it("clamps the unit into the composition bounds", () => {
    const next = addZoom(model, "zoom-1", -3, 99);
    expect(next.zooms).toEqual([{ id: "zoom-1", start: 0, end: 12 }]);
  });

  it("gives a single-point (click) range at least the minimum width", () => {
    const next = addZoom(model, "zoom-1", 5, 5);
    const z = next.zooms![0]!;
    expect(z.end - z.start).toBeCloseTo(0.3, 5);
  });
});

describe("moveZoom", () => {
  it("shifts the unit by setting a new start, preserving its length", () => {
    const next = moveZoom(withZoom({ id: "z1", start: 2, end: 6 }), "z1", 5);
    expect(next.zooms).toEqual([{ id: "z1", start: 5, end: 9 }]);
  });

  it("clamps the move so the whole unit stays inside the composition", () => {
    const m = withZoom({ id: "z1", start: 2, end: 6 }); // length 4, duration 12
    expect(moveZoom(m, "z1", 99).zooms).toEqual([{ id: "z1", start: 8, end: 12 }]);
    expect(moveZoom(m, "z1", -3).zooms).toEqual([{ id: "z1", start: 0, end: 4 }]);
  });

  it("is a no-op (same model reference) for an unknown id or no movement", () => {
    const m = withZoom({ id: "z1", start: 2, end: 6 });
    expect(moveZoom(m, "nope", 5)).toBe(m);
    expect(moveZoom(m, "z1", 2)).toBe(m);
  });
});

describe("resizeZoom", () => {
  it("moves one edge, clamped to the min width and composition bounds", () => {
    const m = withZoom({ id: "z1", start: 2, end: 6 });
    expect(resizeZoom(m, "z1", "end", 9).zooms).toEqual([{ id: "z1", start: 2, end: 9 }]);
    expect(resizeZoom(m, "z1", "start", 4).zooms).toEqual([{ id: "z1", start: 4, end: 6 }]);
    // can't invert: end clamped to start + min
    expect(resizeZoom(m, "z1", "end", 1).zooms![0]!.end).toBeCloseTo(2.3, 5);
  });

  it("is a no-op (same model reference) for an unknown id or no movement", () => {
    const m = withZoom({ id: "z1", start: 2, end: 6 });
    expect(resizeZoom(m, "nope", "end", 9)).toBe(m);
    expect(resizeZoom(m, "z1", "end", 6)).toBe(m);
  });
});

describe("removeZoom", () => {
  it("removes the unit by id", () => {
    const m = withZoom({ id: "z1", start: 2, end: 6 }, { id: "z2", start: 7, end: 9 });
    expect(removeZoom(m, "z1").zooms).toEqual([{ id: "z2", start: 7, end: 9 }]);
  });

  it("is a no-op (same model reference) for an unknown id", () => {
    const m = withZoom({ id: "z1", start: 2, end: 6 });
    expect(removeZoom(m, "nope")).toBe(m);
  });
});

const zoomById = (m: CompositionTimelineModel, id: string): ZoomUnit => m.zooms!.find((z) => z.id === id)!;

describe("updateZoom", () => {
  it("sets the look properties on the unit, leaving its timing untouched", () => {
    const m = withZoom({ id: "z1", start: 2, end: 6 });
    const next = updateZoom(m, "z1", { scale: 2, easing: "linear", target: { x: 0.25, y: 0.75 } });
    expect(zoomById(next, "z1")).toEqual({
      id: "z1",
      start: 2,
      end: 6,
      scale: 2,
      easing: "linear",
      target: { x: 0.25, y: 0.75 },
    });
  });

  it("only touches the properties in the patch", () => {
    const m = withZoom({ id: "z1", start: 2, end: 6, scale: 2, easing: "linear" });
    const next = updateZoom(m, "z1", { scale: 2.4 });
    expect(zoomById(next, "z1").scale).toBe(2.4);
    expect(zoomById(next, "z1").easing).toBe("linear"); // preserved
  });

  it("clamps scale into [MIN, MAX] and the target into the [0,1] frame", () => {
    const m = withZoom({ id: "z1", start: 2, end: 6 });
    expect(zoomById(updateZoom(m, "z1", { scale: 99 }), "z1").scale).toBe(MAX_ZOOM_SCALE);
    expect(zoomById(updateZoom(m, "z1", { scale: 0 }), "z1").scale).toBe(MIN_ZOOM_SCALE);
    expect(zoomById(updateZoom(m, "z1", { target: { x: 2, y: -1 } }), "z1").target).toEqual({ x: 1, y: 0 });
  });

  it("resets the look to the defaults when patched with them", () => {
    const m = withZoom({ id: "z1", start: 2, end: 6, scale: 3, easing: "linear", target: { x: 0.1, y: 0.9 } });
    const reset = updateZoom(m, "z1", {
      scale: DEFAULT_ZOOM_SCALE,
      easing: DEFAULT_ZOOM_EASING,
      target: DEFAULT_ZOOM_TARGET,
    });
    expect(zoomById(reset, "z1")).toEqual({
      id: "z1",
      start: 2,
      end: 6,
      scale: DEFAULT_ZOOM_SCALE,
      easing: DEFAULT_ZOOM_EASING,
      target: DEFAULT_ZOOM_TARGET,
    });
  });

  it("is a no-op (same model reference) for an unknown id, empty patch, or unchanged values", () => {
    const m = withZoom({ id: "z1", start: 2, end: 6, scale: 2, easing: "linear" });
    expect(updateZoom(m, "nope", { scale: 2 })).toBe(m);
    expect(updateZoom(m, "z1", {})).toBe(m);
    expect(updateZoom(m, "z1", { scale: 2, easing: "linear" })).toBe(m);
  });
});
