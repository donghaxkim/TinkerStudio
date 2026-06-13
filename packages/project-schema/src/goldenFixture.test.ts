import { describe, expect, it } from "vitest";
import goldenFixture from "../fixtures/person-a-generated-project.sample.json" with { type: "json" };
import { DemoProjectSchema } from "./validators.js";

/**
 * PB-002 + PB-010: the golden generated-project fixture is the canonical example of
 * Person A's expected generation output. It MUST validate against DemoProjectSchema and
 * MUST match the editor design reference (driftboard demo): 4 named clips + 2 named zoom
 * moves at 60fps over 24s. These assertions guard that contract.
 */
describe("golden generated-project fixture (person-a-generated-project.sample.json)", () => {
  it("validates against DemoProjectSchema 0.1.0", () => {
    const result = DemoProjectSchema.safeParse(goldenFixture);
    if (!result.success) {
      throw new Error(`golden fixture invalid: ${JSON.stringify(result.error.issues, null, 2)}`);
    }
    expect(result.success).toBe(true);
  });

  it("matches the design reference: 24s @ 60fps, 16:9", () => {
    const project = DemoProjectSchema.parse(goldenFixture);
    expect(project.schemaVersion).toBe("0.1.0");
    expect(project.duration).toBe(24);
    expect(project.fps).toBe(60);
    expect(project.aspectRatio).toBe("16:9");
    expect(project.title).toBe("Driftboard Demo");
  });

  it("has the 4 named clips from the reference timeline", () => {
    const project = DemoProjectSchema.parse(goldenFixture);
    expect(project.tracks).toHaveLength(1);
    const clips = project.tracks[0].clips;
    expect(clips.map((clip) => clip.name)).toEqual([
      "Open dashboard",
      "Invite teammates",
      "Workspace settings",
      "Share & wrap-up",
    ]);
    expect(clips.map((clip) => [clip.start, clip.end])).toEqual([
      [0, 6],
      [6, 13],
      [13, 18.5],
      [18.5, 24],
    ]);
  });

  it("has the 2 zoom moves from the reference (×1.6 and ×1.5)", () => {
    const project = DemoProjectSchema.parse(goldenFixture);
    expect(project.zooms).toHaveLength(2);
    expect(project.zooms.map((zoom) => [zoom.start, zoom.end, zoom.scale])).toEqual([
      [8, 12.4, 1.6],
      [19.6, 22.6, 1.5],
    ]);
  });

  it("has the design-reference zoom names (PB-012)", () => {
    const project = DemoProjectSchema.parse(goldenFixture);
    expect(project.zooms.map((zoom) => zoom.name)).toEqual(["Invite modal", "Share button"]);
  });

  it("references the captured asset and keeps every clip's source range in bounds", () => {
    const project = DemoProjectSchema.parse(goldenFixture);
    expect(project.assets).toHaveLength(1);
    const asset = project.assets[0];
    expect(asset.source).toBe("captured");
    // The primary asset is the Driftboard dashboard screenshot (image).
    expect(asset.type).toBe("image");

    for (const track of project.tracks) {
      for (const clip of track.clips) {
        expect(clip.assetId).toBe(asset.id);
        expect(clip.sourceStart).toBeGreaterThanOrEqual(0);
        // Image assets have no meaningful duration; clips omit sourceEnd.
        if (clip.sourceEnd !== undefined && asset.duration !== undefined) {
          expect(clip.sourceEnd).toBeLessThanOrEqual(asset.duration);
        }
      }
    }
  });

  it("carries a realistic cursor stream with clicks near the zoom regions", () => {
    const project = DemoProjectSchema.parse(goldenFixture);
    const moves = project.cursorEvents.filter((event) => event.type === "move");
    const clicks = project.cursorEvents.filter((event) => event.type === "click");
    expect(moves.length).toBeGreaterThan(20);
    expect(clicks.length).toBeGreaterThanOrEqual(5);
    // A click coincides with each zoom's start so the auto-zoom has dwell data.
    const clickTimes = clicks.map((click) => click.time);
    expect(clickTimes).toContain(8);
    expect(clickTimes).toContain(19.6);
  });
});
