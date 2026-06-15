import { describe, expect, it } from "vitest";
import { DemoProjectSchema } from "@tinker/project-schema";
import type { AiUrlPlanningCreateDemoRequest } from "@tinker/generation-contract";
import goldenFixture from "../../../../packages/project-schema/fixtures/person-a-generated-project.sample.json";
import { createMockGenerationClient } from "./mockGenerationClient.js";

const request: AiUrlPlanningCreateDemoRequest = {
  mode: "ai-url-planning",
  repoUrl: "https://github.com/example/driftboard",
  productUrl: "https://example.com/driftboard",
  prompt: "Show the driftboard onboarding flow.",
  durationCapSeconds: 60,
  aspectRatio: "16:9",
  renderer: "playwright",
};

describe("mockGenerationClient (PB-002 seam)", () => {
  it("returns the golden driftboard fixture as a successful job's result.project", async () => {
    const client = createMockGenerationClient();
    const job = await client.createDemo(request);

    expect(job.status).toBe("succeeded");
    if (job.status !== "succeeded" || !job.result || !("project" in job.result)) {
      throw new Error("expected a succeeded job with a project result");
    }

    // The success payload IS the golden fixture (same id + title).
    expect(job.result.project.id).toBe(goldenFixture.id);
    expect(job.result.project.title).toBe(goldenFixture.title);
    expect(job.result.project.id).toBe("driftboard_demo");
    expect(job.result.warnings).toEqual(["Mock generation used the golden driftboard fixture."]);
  });

  it("returns a result.project that validates against DemoProjectSchema 0.1.0", async () => {
    const client = createMockGenerationClient();
    const job = await client.createDemo(request);

    if (job.status !== "succeeded" || !job.result || !("project" in job.result)) {
      throw new Error("expected a succeeded job with a project result");
    }

    const parsed = DemoProjectSchema.safeParse(job.result.project);
    expect(parsed.success).toBe(true);
  });

  it("produces a job whose succeeded project carries the 4 reference scenes", async () => {
    const client = createMockGenerationClient();
    const job = await client.createDemo(request);

    if (job.status !== "succeeded" || !job.result || !("project" in job.result)) {
      throw new Error("expected a succeeded job with a project result");
    }

    const clipNames = job.result.project.tracks.flatMap((track) =>
      track.clips.map((clip) => clip.name),
    );
    expect(clipNames).toEqual([
      "Open dashboard",
      "Invite teammates",
      "Workspace settings",
      "Share & wrap-up",
    ]);
    expect(job.result.project.zooms).toHaveLength(2);
  });

  it("surfaces a failed job with an error for the failure mode", async () => {
    const client = createMockGenerationClient({ mode: "failed" });
    const job = await client.createDemo(request);

    expect(job.status).toBe("failed");
    if (job.status !== "failed") throw new Error("expected a failed job");
    expect(job.error?.message).toBe("Capture failed in mock generator");
  });
});
