import { describe, expect, it } from "vitest";
import { loadDemoProject, loadSampleProject } from "./loadSampleProject.js";

describe("loadSampleProject", () => {
  it("validates and returns the sample DemoProject", () => {
    const result = loadSampleProject();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected valid sample");
    expect(result.project).toEqual(
      expect.objectContaining({
        id: "demo_project_sample",
        title: "Sample Product Demo",
        duration: 45,
        fps: 30,
        aspectRatio: "16:9",
      }),
    );
    expect(result.project.assets).toHaveLength(1);
    expect(result.project.tracks).toHaveLength(1);
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
