import { EDGE_CASE_DEMO_PROJECT_FIXTURES } from "@tinker/project-schema";
import { describe, expect, it } from "vitest";
import { buildFinalRenderPlan, type RenderLayer } from "./renderFinal.js";

function fixture(id: string) {
  const found = EDGE_CASE_DEMO_PROJECT_FIXTURES.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Missing edge-case fixture '${id}'`);
  return found;
}

function layersFor(id: string): RenderLayer[] {
  return buildFinalRenderPlan(fixture(id).project).layers;
}

describe("edge-case fixtures render planning", () => {
  it("builds a final render plan for every exportable fixture", () => {
    const exportableFixtures = EDGE_CASE_DEMO_PROJECT_FIXTURES.filter((candidate) => candidate.exportable);

    expect(exportableFixtures.length).toBeGreaterThan(0);
    for (const candidate of exportableFixtures) {
      expect(() => buildFinalRenderPlan(candidate.project), candidate.id).not.toThrow();
    }
  });

  it("uses the correct output dimensions for aspect-ratio fixtures", () => {
    expect(buildFinalRenderPlan(fixture("aspect_16_9").project).output).toEqual(expect.objectContaining({ width: 1920, height: 1080 }));
    expect(buildFinalRenderPlan(fixture("aspect_9_16").project).output).toEqual(expect.objectContaining({ width: 1080, height: 1920 }));
    expect(buildFinalRenderPlan(fixture("aspect_1_1").project).output).toEqual(expect.objectContaining({ width: 1080, height: 1080 }));
  });

  it("preserves clip gaps and trim ranges in render layers", () => {
    expect(layersFor("multiple_clips_with_gap").filter((layer) => layer.kind === "video")).toEqual([
      expect.objectContaining({ id: "clip_gap_first", start: 0, end: 5, sourceStart: 0, sourceEnd: 5 }),
      expect.objectContaining({ id: "clip_gap_second", start: 8, end: 14, sourceStart: 8, sourceEnd: 14 }),
    ]);
    expect(layersFor("trimmed_clip").find((layer) => layer.kind === "video")).toEqual(
      expect.objectContaining({ id: "clip_trimmed", start: 0, end: 4, sourceStart: 12, sourceEnd: 16 }),
    );
  });

  it("keeps overlapping clips on separate tracks as separate media layers", () => {
    expect(layersFor("overlapping_clips_separate_tracks").filter((layer) => layer.kind === "video")).toEqual([
      expect.objectContaining({ id: "clip_overlap_a", trackId: "track_video_main", start: 2, end: 10 }),
      expect.objectContaining({ id: "clip_overlap_b", trackId: "track_video_overlay", start: 5, end: 12 }),
    ]);
  });

  it("plans cursor and zoom edge fixtures without crashing", () => {
    expect(layersFor("cursor_outside_frame_bounds").find((layer) => layer.kind === "cursor")).toEqual(
      expect.objectContaining({ id: "cursor_outside", x: 2400, y: -80 }),
    );
    expect(layersFor("duplicate_timestamps").filter((layer) => layer.kind === "cursor")).toEqual([
      expect.objectContaining({ id: "cursor_duplicate_a", start: 3, end: 3.5 }),
      expect.objectContaining({ id: "cursor_duplicate_b", start: 3, end: 3.5 }),
    ]);
    expect(layersFor("zoom_target_outside_frame_bounds").find((layer) => layer.kind === "zoom")).toEqual(
      expect.objectContaining({ id: "zoom_outside", target: expect.objectContaining({ x: -200, y: 700 }) }),
    );
  });

  it("preserves very short and long project durations", () => {
    expect(buildFinalRenderPlan(fixture("very_short_under_one_second").project).timeline.duration).toBe(0.75);
    expect(buildFinalRenderPlan(fixture("long_over_three_minutes").project).timeline.duration).toBe(181);
  });
});
