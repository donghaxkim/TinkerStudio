import { describe, expect, it } from "vitest";
import { readCompositionTimeline, type GsapTimelineLike } from "./compositionTimelineModel.js";

function fakeTimeline(opts: {
  totalDuration: number;
  labels?: Record<string, number>;
  children?: { id?: string; start: number; duration: number }[];
}): GsapTimelineLike {
  return {
    totalDuration: () => opts.totalDuration,
    labels: opts.labels ?? {},
    getChildren: () =>
      (opts.children ?? []).map((child) => ({
        startTime: () => child.start,
        totalDuration: () => child.duration,
        vars: child.id === undefined ? {} : { id: child.id },
      })),
  };
}

describe("readCompositionTimeline", () => {
  it("reads duration, named clips, and time-sorted labels", () => {
    const model = readCompositionTimeline(
      fakeTimeline({
        totalDuration: 9,
        labels: { cta: 7.8, hook: 0 },
        children: [
          { id: "hook", start: 0, duration: 4.2 },
          { id: "feature", start: 4.2, duration: 3.6 },
        ],
      }),
    );
    expect(model.durationSeconds).toBe(9);
    expect(model.clips).toEqual([
      { id: "hook", label: "hook", start: 0, end: 4.2 },
      { id: "feature", label: "feature", start: 4.2, end: 7.8 },
    ]);
    expect(model.labels).toEqual([
      { name: "hook", time: 0 },
      { name: "cta", time: 7.8 },
    ]);
  });

  it("generates ids and omits labels for unnamed child timelines", () => {
    const model = readCompositionTimeline(
      fakeTimeline({ totalDuration: 5, children: [{ start: 0, duration: 5 }] }),
    );
    expect(model.clips).toEqual([{ id: "clip-0", label: undefined, start: 0, end: 5 }]);
  });

  it("returns no clips for a flat composition (range-only fallback)", () => {
    const model = readCompositionTimeline(fakeTimeline({ totalDuration: 6 }));
    expect(model.clips).toEqual([]);
    expect(model.labels).toEqual([]);
    expect(model.durationSeconds).toBe(6);
  });

  it("clamps a negative or NaN duration to zero", () => {
    expect(readCompositionTimeline(fakeTimeline({ totalDuration: -1 })).durationSeconds).toBe(0);
    expect(readCompositionTimeline(fakeTimeline({ totalDuration: Number.NaN })).durationSeconds).toBe(0);
  });
});
