import { describe, expect, it } from "vitest";
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

const publishedVideoArtifact = {
  kind: "published-video",
  relativePath: "testreel/final.mp4",
  url: "/api/jobs/job-test/artifacts/testreel/final.mp4",
  mediaType: "video/mp4",
} as const;

const recordingPlanArtifact = {
  kind: "testreel-recording-plan",
  relativePath: "testreel/recording-plan.json",
  url: "/api/jobs/job-test/artifacts/testreel/recording-plan.json",
  mediaType: "application/json; charset=utf-8",
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
      "published-video",
      "testreel-recording-plan",
      "testreel-recording-definition",
      "testreel-manifest",
      "testreel-screenshot",
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
        method: "testreel",
        artifacts: [recordingPlanArtifact, publishedVideoArtifact],
        warnings: [],
      },
    });

    expect(completed.result?.method).toBe("testreel");
    expect(completed.result?.artifacts.map((artifact) => artifact.kind)).toEqual([
      "testreel-recording-plan",
      "published-video",
    ]);
    expect("project" in completed.result!).toBe(false);
  });

  it("requires Testreel API results with a published video artifact", () => {
    expect(
      ApiGenerationResultSchema.safeParse({
        method: "testreel",
        artifacts: [recordingPlanArtifact],
        warnings: [],
      }).success,
    ).toBe(false);

    expect(
      ApiGenerationResultSchema.safeParse({
        method: "playwright",
        artifacts: [publishedVideoArtifact],
        warnings: [],
      }).success,
    ).toBe(false);
  });

  it("rejects stale composition request/result fields", () => {
    const removedCompositionRenderer = "hyper" + "frames";
    expect(
      safeParseApiGenerationJob({
        id: "job-removed-composition",
        status: "queued",
        request: { ...request, renderer: removedCompositionRenderer },
        createdAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:00:00.000Z",
        progressEvents: [],
      }).success,
    ).toBe(false);

    expect(
      ApiGenerationResultSchema.safeParse({
        method: removedCompositionRenderer,
        composition: {},
        artifacts: [],
        warnings: [],
      }).success,
    ).toBe(false);
  });

  it("rejects missing native outputs and extra result fields", () => {
    expect(
      ApiGenerationResultSchema.safeParse({
        method: "testreel",
        artifacts: [recordingPlanArtifact],
        warnings: [],
      }).success,
    ).toBe(false);

    expect(
      ApiGenerationResultSchema.safeParse({
        method: "testreel",
        artifacts: [publishedVideoArtifact],
      }).success,
    ).toBe(false);

    expect(
      ApiGenerationResultSchema.safeParse({
        method: "testreel",
        composition: {},
        artifacts: [publishedVideoArtifact],
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
          method: "testreel",
          artifacts: [publishedVideoArtifact],
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
          method: "testreel",
          artifacts: [publishedVideoArtifact],
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
          method: "testreel",
          artifacts: [publishedVideoArtifact],
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
