import { describe, expect, it } from "vitest";
import {
  CreateDemoRequestSchema,
  GenerationPhaseSchema,
  GenerationResultSchema,
  GenerationStatusSchema,
  safeParseCreateDemoRequest,
  safeParseGenerationResult,
} from "./index.js";
import sampleProject from "../../project-schema/fixtures/demo-project.sample.json";

describe("generation contract validators", () => {
  it("accepts a valid create-demo request with localhost product URL", () => {
    const result = safeParseCreateDemoRequest({
      repoUrl: "https://github.com/example/product",
      productUrl: "http://localhost:5173",
      prompt: "Show the analytics workflow",
      durationCapSeconds: 60,
      aspectRatio: "16:9",
      narration: { enabled: true, style: "confident", voiceId: "demo-voice" },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.productUrl).toBe("http://localhost:5173");
      expect(result.data.narration?.enabled).toBe(true);
    }
  });

  it("rejects empty prompts and invalid aspect ratios", () => {
    const result = CreateDemoRequestSchema.safeParse({
      repoUrl: "https://github.com/example/product",
      productUrl: "https://example.com",
      prompt: "",
      durationCapSeconds: 60,
      aspectRatio: "4:3",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issueText = result.error.issues.map((issue) => issue.path.join(".")).join(" ");
      expect(issueText).toContain("prompt");
      expect(issueText).toContain("aspectRatio");
    }
  });

  it("exports the declared status and progress phase enums", () => {
    expect(GenerationStatusSchema.options).toEqual(["queued", "running", "succeeded", "failed", "canceled"]);
    expect(GenerationPhaseSchema.options).toEqual([
      "queued",
      "analyzing_product",
      "creating_storyboard",
      "planning_capture",
      "capturing",
      "compiling_project",
      "validating_project",
      "complete",
    ]);
  });

  it("validates a generation result with a nested DemoProject", () => {
    const result = safeParseGenerationResult({
      project: sampleProject,
      artifacts: {
        storyboardAssetId: "asset_storyboard_json",
        captureTraceAssetId: "asset_capture_trace",
        previewVideoAssetId: "asset_screen_recording",
      },
      warnings: ["used sample project"],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.project.id).toBe("demo_project_sample");
    }
  });

  it("rejects generation results with invalid projects", () => {
    const result = GenerationResultSchema.safeParse({
      project: { ...sampleProject, duration: -1 },
    });

    expect(result.success).toBe(false);
  });
});
