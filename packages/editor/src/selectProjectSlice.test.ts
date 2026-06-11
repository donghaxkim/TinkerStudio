import { describe, expect, it } from "vitest";
import { sampleProject } from "./test/sampleProject.js";
import { normalizeProjectSliceRange, selectProjectSlice } from "./selectProjectSlice.js";

describe("selectProjectSlice", () => {
  it("includes entities overlapping the selected range", () => {
    const slice = selectProjectSlice(sampleProject, { start: 11.5, end: 18 });

    expect(slice).toEqual(
      expect.objectContaining({
        projectId: sampleProject.id,
        title: sampleProject.title,
        targetRange: { start: 11.5, end: 18 },
      }),
    );
    expect(slice.clips.map((clip) => clip.id)).toEqual(["clip_capture_001"]);
    expect(slice.clips[0]).toEqual(expect.objectContaining({ trackId: "track_video_main", trackName: "Main capture" }));
    expect(slice.zooms.map((zoom) => zoom.id)).toEqual(["zoom_001"]);
    expect(slice.cursorEvents).toHaveLength(2);
  });

  it("excludes entities outside the selected range", () => {
    const slice = selectProjectSlice(sampleProject, { start: 30, end: 35 });

    expect(slice.zooms).toEqual([]);
    expect(slice.cursorEvents).toEqual([]);
    expect(slice.clips.map((clip) => clip.id)).toEqual(["clip_capture_001"]);
  });

  it("handles empty ranges safely", () => {
    const slice = selectProjectSlice(sampleProject, { start: 5, end: 5 });

    expect(slice.targetRange).toEqual({ start: 5, end: 5 });
    expect(slice.clips).toEqual([]);
    expect(slice.zooms).toEqual([]);
    expect(slice.cursorEvents).toEqual([]);
  });

  it("normalizes reversed and out-of-bounds ranges", () => {
    expect(normalizeProjectSliceRange({ start: 50, end: -5 }, sampleProject.duration)).toEqual({
      start: 0,
      end: 45,
    });
  });
});
