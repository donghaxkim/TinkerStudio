import { DemoProjectSchema } from "@tinker/project-schema";
import { describe, expect, it } from "vitest";
import sampleProjectInput from "../../project-schema/fixtures/demo-project.sample.json";
import { buildFinalRenderPlan } from "./renderFinal.js";

const sampleProject = DemoProjectSchema.parse(sampleProjectInput);

describe("buildFinalRenderPlan", () => {
  it("builds MP4 output metadata from a DemoProject", () => {
    const plan = buildFinalRenderPlan(sampleProject);

    expect(plan.output.fileName).toBe("sample-product-demo.mp4");
    expect(plan.output.mimeType).toBe("video/mp4");
    expect(plan.output.width).toBe(1920);
    expect(plan.output.height).toBe(1080);
    expect(plan.source).toEqual({ width: 1920, height: 1080 });
    expect(plan.timeline.duration).toBe(45);
    expect(plan.timeline.fps).toBe(30);
  });

  it("uses captured media dimensions as the source frame for overlay scaling", () => {
    const project = {
      ...sampleProject,
      assets: sampleProject.assets.map((asset) =>
        asset.id === "asset_capture_001" ? { ...asset, width: 1280, height: 720 } : asset,
      ),
    };

    const plan = buildFinalRenderPlan(project);

    expect(plan.output).toEqual(expect.objectContaining({ width: 1920, height: 1080 }));
    expect(plan.source).toEqual({ width: 1280, height: 720 });
  });

  it("includes DemoProject overlays as render layers", () => {
    const plan = buildFinalRenderPlan(sampleProject);

    expect(plan.layers.map((layer) => `${layer.kind}:${layer.id}`)).toEqual(
      expect.arrayContaining([
        "video:clip_capture_001",
        "zoom:zoom_001",
        "cursor:cursor_1",
      ]),
    );
  });

  it("reflects edited zoom overlays in the render plan", () => {
    const editedProject = {
      ...sampleProject,
      zooms: [
        ...sampleProject.zooms,
        {
          id: "zoom_manual_001",
          start: 6,
          end: 9,
          target: { x: 200, y: 120, width: 600, height: 340 },
          easing: "easeInOut" as const,
        },
      ],
    };

    const originalPlan = buildFinalRenderPlan(sampleProject);
    const editedPlan = buildFinalRenderPlan(editedProject);

    expect(editedPlan.layers.map((layer) => `${layer.kind}:${layer.id}`)).toContain("zoom:zoom_manual_001");
    expect(editedPlan.layers.length).toBe(originalPlan.layers.length + 1);
  });

  it("rejects non-MP4 output filenames", () => {
    expect(() => buildFinalRenderPlan(sampleProject, { fileName: "sample.webm" })).toThrow(/MP4/);
  });
});
