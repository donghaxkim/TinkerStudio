import { describe, expect, it } from "vitest";
import type { CompositionTimelineModel } from "./compositionTimelineModel.js";
import { addMarker, clampTrim, clipAt, removeClip, splitClipAt, trimClip } from "./compositionEdits.js";

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
