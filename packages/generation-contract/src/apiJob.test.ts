import { describe, expect, it } from "vitest";
import { DemoProjectSchema } from "@tinker/project-schema";
import goldenProjectInput from "../../project-schema/fixtures/person-a-generated-project.sample.json" with { type: "json" };
import {
  ApiArtifactKindSchema,
  ApiArtifactSchema,
  ApiGenerationJobSchema,
  ApiGenerationJobStatusSchema,
  ApiGenerationResultSchema,
  parseApiGenerationJob,
  safeParseApiGenerationJob,
} from "./index.js";

const request = {
  id: "job-test",
  mode: "ai-url-planning",
  repoUrl: "https://github.com/example/product",
  productUrl: "https://example.com",
  prompt: "Make a short demo.",
  durationCapSeconds: 12,
  aspectRatio: "16:9",
} as const;

const progressEvent = {
  jobId: "job-test",
  status: "running",
  message: "AI URL analysis started",
  time: "2026-06-11T00:00:01.000Z",
} as const;

const goldenProject = DemoProjectSchema.parse(goldenProjectInput);

const playwrightProjectArtifact = {
  kind: "playwright-demo-project",
  relativePath: "playwright/demo-project.json",
  url: "/api/jobs/job-test/artifacts/playwright/demo-project.json",
  mediaType: "application/json; charset=utf-8",
} as const;

const playwrightVideoArtifact = {
  kind: "playwright-video",
  relativePath: "playwright/final.mp4",
  url: "/api/jobs/job-test/artifacts/playwright/final.mp4",
  mediaType: "video/mp4",
} as const;

describe("API generation job contract", () => {
  it("exports the narrowed API job status enum", () => {
    expect(ApiGenerationJobStatusSchema.options).toEqual([
      "queued",
      "running",
      "capturing",
      "assembling",
      "completed",
      "failed",
    ]);
  });

  it("exports the artifact kind enum", () => {
    expect(ApiArtifactKindSchema.options).toEqual([
      "product-analysis",
      "product-analysis-screenshot",
      "repo-analysis",
      "playwright-demo-project",
      "playwright-storyboard",
      "playwright-capture-plan",
      "playwright-capture-result",
      "playwright-video",
      "playwright-screenshot",
      "playwright-trace",
      "other",
    ]);
  });

  it("parses queued and completed API job snapshots", () => {
    const queued = parseApiGenerationJob({
      id: "job-test",
      status: "queued",
      request,
      createdAt: "2026-06-11T00:00:00.000Z",
      updatedAt: "2026-06-11T00:00:00.000Z",
      progressEvents: [],
    });

    expect(queued.status).toBe("queued");
    expect(queued.request.id).toBe("job-test");
    expect("renderer" in queued.request).toBe(false);

    const completed = parseApiGenerationJob({
      id: "job-test",
      status: "completed",
      request,
      createdAt: "2026-06-11T00:00:00.000Z",
      updatedAt: "2026-06-11T00:00:02.000Z",
      progressEvents: [progressEvent],
      result: {
        method: "playwright",
        project: goldenProject,
        artifacts: [playwrightProjectArtifact, playwrightVideoArtifact],
        warnings: [],
      },
    });

    expect(completed.result?.method).toBe("playwright");
    expect(completed.result?.artifacts.map((artifact) => artifact.kind)).toEqual([
      "playwright-demo-project",
      "playwright-video",
    ]);
  });

  it("accepts Playwright API results with a valid DemoProject", () => {
    const result = ApiGenerationResultSchema.parse({
      method: "playwright",
      project: goldenProject,
      artifacts: [playwrightProjectArtifact],
      warnings: [],
    });

    expect(result.method).toBe("playwright");
    expect(result.project.id).toBe(goldenProject.id);
  });

  it("rejects stale HyperFrames request/result fields", () => {
    expect(
      safeParseApiGenerationJob({
        id: "job-hyperframes",
        status: "queued",
        request: { ...request, renderer: "hyperframes" },
        createdAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:00:00.000Z",
        progressEvents: [],
      }).success,
    ).toBe(false);

    expect(
      ApiGenerationResultSchema.safeParse({
        method: "hyperframes",
        composition: {},
        artifacts: [],
        warnings: [],
      }).success,
    ).toBe(false);
  });

  it("rejects missing native outputs and extra result fields", () => {
    expect(
      ApiGenerationResultSchema.safeParse({
        method: "playwright",
        artifacts: [playwrightProjectArtifact],
        warnings: [],
      }).success,
    ).toBe(false);

    expect(
      ApiGenerationResultSchema.safeParse({
        method: "playwright",
        project: goldenProject,
        artifacts: [playwrightProjectArtifact],
      }).success,
    ).toBe(false);

    expect(
      ApiGenerationResultSchema.safeParse({
        method: "playwright",
        project: goldenProject,
        composition: {},
        artifacts: [playwrightProjectArtifact],
        warnings: [],
      }).success,
    ).toBe(false);
  });

  it("requires AI URL planning requests and explicit progress events", () => {
    expect(
      safeParseApiGenerationJob({
        id: "job-test",
        status: "queued",
        request: {
          id: "job-test",
          mode: "manual-fixture",
          repoUrl: "https://github.com/example/product",
          productUrl: "https://example.com",
          prompt: "Make a short demo.",
          durationCapSeconds: 12,
          aspectRatio: "16:9",
        },
        createdAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:00:00.000Z",
        progressEvents: [],
      }).success,
    ).toBe(false);

    expect(
      safeParseApiGenerationJob({
        id: "job-test",
        status: "queued",
        request,
        createdAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:00:00.000Z",
      }).success,
    ).toBe(false);

    expect(
      safeParseApiGenerationJob({
        id: "job-test",
        status: "queued",
        request: {
          mode: "ai-url-planning",
          repoUrl: "https://github.com/example/product",
          productUrl: "https://example.com",
          prompt: "Make a short demo.",
          durationCapSeconds: 12,
          aspectRatio: "16:9",
        },
        createdAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:00:00.000Z",
        progressEvents: [],
      }).success,
    ).toBe(false);

    expect(
      safeParseApiGenerationJob({
        id: "job-test",
        status: "queued",
        request: { ...request, unexpected: true },
        createdAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:00:00.000Z",
        progressEvents: [],
      }).success,
    ).toBe(false);

    expect(
      safeParseApiGenerationJob({
        id: "job-test",
        status: "queued",
        request: { ...request, outputDirectory: "/tmp/demo-output" },
        createdAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:00:00.000Z",
        progressEvents: [],
      }).success,
    ).toBe(false);
  });

  it("requires result only for completed jobs and error only for failed jobs", () => {
    expect(
      safeParseApiGenerationJob({
        id: "job-test",
        status: "completed",
        request,
        createdAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:00:00.000Z",
        progressEvents: [],
      }).success,
    ).toBe(false);

    expect(
      safeParseApiGenerationJob({
        id: "job-test",
        status: "failed",
        request,
        createdAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:00:00.000Z",
        progressEvents: [],
      }).success,
    ).toBe(false);

    expect(
      safeParseApiGenerationJob({
        id: "job-test",
        status: "running",
        request,
        createdAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:00:00.000Z",
        progressEvents: [progressEvent],
        result: {
          method: "playwright",
          project: goldenProject,
          artifacts: [playwrightProjectArtifact],
          warnings: [],
        },
      }).success,
    ).toBe(false);

    expect(
      safeParseApiGenerationJob({
        id: "job-test",
        status: "running",
        request,
        createdAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:00:00.000Z",
        progressEvents: [progressEvent],
        error: {
          status: "failed",
          stage: "planning",
          message: "Planner failed",
        },
      }).success,
    ).toBe(false);

    expect(
      safeParseApiGenerationJob({
        id: "job-test",
        status: "failed",
        request,
        createdAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:00:00.000Z",
        progressEvents: [progressEvent],
        error: {
          status: "failed",
          stage: "planning",
          message: "Planner failed",
        },
      }).success,
    ).toBe(true);

    expect(
      safeParseApiGenerationJob({
        id: "job-test",
        status: "completed",
        request,
        createdAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:00:00.000Z",
        progressEvents: [progressEvent],
        result: {
          method: "playwright",
          project: goldenProject,
          artifacts: [playwrightProjectArtifact],
          warnings: [],
        },
        error: {
          status: "failed",
          stage: "planning",
          message: "Planner failed",
        },
      }).success,
    ).toBe(false);

    expect(
      safeParseApiGenerationJob({
        id: "job-test",
        status: "failed",
        request,
        createdAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:00:00.000Z",
        progressEvents: [progressEvent],
        result: {
          method: "playwright",
          project: goldenProject,
          artifacts: [playwrightProjectArtifact],
          warnings: [],
        },
        error: {
          status: "failed",
          stage: "planning",
          message: "Planner failed",
        },
      }).success,
    ).toBe(false);
  });

  it("rejects assisted result dialects and malformed artifacts", () => {
    expect(ApiArtifactSchema.safeParse({ kind: "output-video", url: "/x", relativePath: "x", extra: true }).success).toBe(
      false,
    );

    expect(
      ApiGenerationJobSchema.safeParse({
        id: "job-test",
        status: "succeeded",
        request,
        createdAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:00:00.000Z",
        progressEvents: [],
      }).success,
    ).toBe(false);
  });
});
