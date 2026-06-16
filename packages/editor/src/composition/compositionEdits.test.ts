import { describe, expect, it } from "vitest";
import type { CompositionTimelineModel } from "./compositionTimelineModel.js";
import { addMarker, clipAt, removeClip, splitClipAt } from "./compositionEdits.js";

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
