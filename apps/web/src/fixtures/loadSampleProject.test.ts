import { describe, expect, it } from "vitest";
import { loadDemoProject, loadSampleProject } from "./loadSampleProject.js";

describe("loadSampleProject", () => {
  it("validates and returns the golden driftboard DemoProject", () => {
    const result = loadSampleProject();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected valid sample");
    expect(result.project).toEqual(
      expect.objectContaining({
        id: "driftboard_demo",
        title: "Driftboard Demo",
        duration: 24,
        fps: 60,
        aspectRatio: "16:9",
      }),
    );
    expect(result.project.assets).toHaveLength(1);
    expect(result.project.tracks).toHaveLength(1);
    // Matches the editor design reference: 4 named clips + 2 zoom moves.
    expect(result.project.tracks[0].clips.map((clip) => clip.name)).toEqual([
      "Open dashboard",
      "Invite teammates",
      "Workspace settings",
      "Share & wrap-up",
    ]);
    expect(result.project.zooms).toHaveLength(2);
  });

  it("returns readable validation errors for invalid projects", () => {
    const result = loadDemoProject({ title: "Missing required fields" });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected invalid project");
    expect(result.error.message).toBe("DemoProject validation failed");
    expect(result.error.issues.length).toBeGreaterThan(0);
    expect(result.error.issues.join("\n")).toContain("schemaVersion");
  });
});
