import { describe, expect, it } from "vitest";
import {
  ApiArtifactKindSchema,
  ApiArtifactSchema,
  ApiGenerationJobSchema,
  ApiGenerationJobStatusSchema,
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
  renderer: "hyperframes",
} as const;

const progressEvent = {
  jobId: "job-test",
  status: "running",
  message: "AI URL analysis started",
  time: "2026-06-11T00:00:01.000Z",
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
      "output-video",
      "composition-index",
      "asset-manifest",
      "generation-manifest",
      "lint-log",
      "render-log",
      "product-analysis",
      "product-analysis-screenshot",
      "repo-analysis",
      "asset",
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

    const completed = parseApiGenerationJob({
      ...queued,
      status: "completed",
      updatedAt: "2026-06-11T00:00:02.000Z",
      progressEvents: [progressEvent],
      result: {
        artifacts: [
          {
            kind: "output-video",
            relativePath: "hyperframes/output.mp4",
            url: "/api/jobs/job-test/artifacts/hyperframes/output.mp4",
            mediaType: "video/mp4",
          },
        ],
      },
    });

    expect(completed.result?.artifacts[0]?.kind).toBe("output-video");
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
        request: { ...request, unexpected: true },
        createdAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:00:00.000Z",
        progressEvents: [],
      }).success,
    ).toBe(false);

    for (const renderer of ["playwright", "both"] as const) {
      expect(
        safeParseApiGenerationJob({
          id: "job-test",
          status: "queued",
          request: { ...request, renderer },
          createdAt: "2026-06-11T00:00:00.000Z",
          updatedAt: "2026-06-11T00:00:00.000Z",
          progressEvents: [],
        }).success,
      ).toBe(false);
    }

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
          artifacts: [
            {
              kind: "output-video",
              relativePath: "hyperframes/output.mp4",
              url: "/api/jobs/job-test/artifacts/hyperframes/output.mp4",
            },
          ],
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
          artifacts: [
            {
              kind: "output-video",
              relativePath: "hyperframes/output.mp4",
              url: "/api/jobs/job-test/artifacts/hyperframes/output.mp4",
            },
          ],
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
          artifacts: [
            {
              kind: "output-video",
              relativePath: "hyperframes/output.mp4",
              url: "/api/jobs/job-test/artifacts/hyperframes/output.mp4",
            },
          ],
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
