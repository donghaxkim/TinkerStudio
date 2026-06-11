import { describe, expect, it } from "vitest";
import { DemoProjectSchema } from "./validators.js";
import { EDGE_CASE_DEMO_PROJECT_FIXTURES } from "./edgeCaseFixtures.js";

const requiredFixtureIds = [
  "empty_tracks",
  "one_valid_video_clip",
  "multiple_clips_with_gap",
  "trimmed_clip",
  "overlapping_clips_separate_tracks",
  "missing_asset",
  "invalid_asset_reference",
  "cursor_outside_frame_bounds",
  "duplicate_timestamps",
  "zoom_target_outside_frame_bounds",
  "aspect_16_9",
  "aspect_9_16",
  "aspect_1_1",
  "very_short_under_one_second",
  "long_over_three_minutes",
];

describe("EDGE_CASE_DEMO_PROJECT_FIXTURES", () => {
  it("contains every MVP-008 checklist fixture", () => {
    expect(EDGE_CASE_DEMO_PROJECT_FIXTURES.map((fixture) => fixture.id)).toEqual(requiredFixtureIds);
  });

  it("parses every exportable fixture with DemoProjectSchema", () => {
    const exportableFixtures = EDGE_CASE_DEMO_PROJECT_FIXTURES.filter((fixture) => fixture.exportable);

    expect(exportableFixtures.length).toBeGreaterThan(0);
    for (const fixture of exportableFixtures) {
      expect(DemoProjectSchema.safeParse(fixture.project).success, fixture.id).toBe(true);
    }
  });

  it("keeps missing asset schema-valid so export preflight owns the failure", () => {
    const fixture = EDGE_CASE_DEMO_PROJECT_FIXTURES.find((candidate) => candidate.id === "missing_asset");

    expect(fixture).toBeDefined();
    expect(fixture?.expectedFailure).toBe("asset_resolution");
    expect(DemoProjectSchema.safeParse(fixture?.project).success).toBe(true);
  });

  it("marks invalid asset references as schema failures with an assetId issue", () => {
    const fixture = EDGE_CASE_DEMO_PROJECT_FIXTURES.find((candidate) => candidate.id === "invalid_asset_reference");

    expect(fixture).toBeDefined();
    expect(fixture?.expectedFailure).toBe("schema");
    const parsed = DemoProjectSchema.safeParse(fixture?.project);

    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("expected invalid asset reference fixture to fail schema validation");
    expect(parsed.error.issues.some((issue) => issue.path.join(".").endsWith("assetId"))).toBe(true);
  });
});
