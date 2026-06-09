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
    expect(plan.timeline.duration).toBe(45);
    expect(plan.timeline.fps).toBe(30);
  });

  it("includes DemoProject overlays as render layers", () => {
    const plan = buildFinalRenderPlan(sampleProject);

    expect(plan.layers.map((layer) => `${layer.kind}:${layer.id}`)).toEqual(
      expect.arrayContaining([
        "video:clip_capture_001",
        "audio:clip_narration_001",
        "caption:caption_001",
        "zoom:zoom_001",
        "cursor:cursor_1",
        "callout:callout_001",
      ]),
    );
  });

  it("rejects non-MP4 output filenames", () => {
    expect(() => buildFinalRenderPlan(sampleProject, { fileName: "sample.webm" })).toThrow(/MP4/);
  });
});
