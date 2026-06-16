import { describe, expect, it } from "vitest";
import {
  DEFAULT_ZOOM_EASING,
  DEFAULT_ZOOM_SCALE,
  DEFAULT_ZOOM_TARGET,
  MAX_ZOOM_SCALE,
  MIN_ZOOM_SCALE,
  readCompositionTimeline,
  zoomEasing,
  zoomScale,
  zoomTarget,
  type GsapTimelineLike,
  type ZoomUnit,
} from "./compositionTimelineModel.js";

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

  it("treats a whitespace-only id as unnamed", () => {
    const model = readCompositionTimeline(
      fakeTimeline({ totalDuration: 5, children: [{ id: "   ", start: 0, duration: 5 }] }),
    );
    expect(model.clips[0]!.id).toBe("clip-0");
    expect(model.clips[0]!.label).toBeUndefined();
  });
});

const bareUnit: ZoomUnit = { id: "z1", start: 2, end: 6 };

describe("zoom property accessors", () => {
  it("fall back to the defaults when a unit omits look properties", () => {
    expect(zoomScale(bareUnit)).toBe(DEFAULT_ZOOM_SCALE);
    expect(zoomEasing(bareUnit)).toBe(DEFAULT_ZOOM_EASING);
    expect(zoomTarget(bareUnit)).toEqual(DEFAULT_ZOOM_TARGET);
  });

  it("read explicit look properties when present", () => {
    const u: ZoomUnit = { ...bareUnit, scale: 2, easing: "linear", target: { x: 0.25, y: 0.75 } };
    expect(zoomScale(u)).toBe(2);
    expect(zoomEasing(u)).toBe("linear");
    expect(zoomTarget(u)).toEqual({ x: 0.25, y: 0.75 });
  });

  it("clamps the scale into [MIN_ZOOM_SCALE, MAX_ZOOM_SCALE]", () => {
    expect(zoomScale({ ...bareUnit, scale: 0.2 })).toBe(MIN_ZOOM_SCALE);
    expect(zoomScale({ ...bareUnit, scale: 99 })).toBe(MAX_ZOOM_SCALE);
  });

  it("clamps a target focal point into the [0,1] frame", () => {
    expect(zoomTarget({ ...bareUnit, target: { x: -1, y: 2 } })).toEqual({ x: 0, y: 1 });
  });
});
