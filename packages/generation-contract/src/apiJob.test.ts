import { describe, expect, it } from "vitest";
import { DemoProjectSchema } from "@tinker/project-schema";
import goldenProjectInput from "../../project-schema/fixtures/person-a-generated-project.sample.json" with { type: "json" };
import {
  ApiArtifactKindSchema,
  ApiArtifactSchema,
  ApiGenerationJobSchema,
  ApiGenerationJobStatusSchema,
  ApiGenerationResultSchema,
  ApiRevisionSchema,
  ApiRevisionResultSchema,
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

const goldenProject = DemoProjectSchema.parse(goldenProjectInput);

const compositionIndexArtifact = {
  kind: "composition-index",
  relativePath: "hyperframes/index.html",
  url: "/api/jobs/job-test/artifacts/hyperframes/index.html",
  mediaType: "text/html; charset=utf-8",
} as const;

const outputVideoArtifact = {
  kind: "output-video",
  relativePath: "hyperframes/output.mp4",
  url: "/api/jobs/job-test/artifacts/hyperframes/output.mp4",
  mediaType: "video/mp4",
} as const;

const playwrightProjectArtifact = {
  kind: "playwright-demo-project",
  relativePath: "playwright/demo-project.json",
  url: "/api/jobs/job-test/artifacts/playwright/demo-project.json",
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
      "output-video",
      "composition-index",
      "asset-manifest",
      "generation-manifest",
      "lint-log",
      "render-log",
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
      "asset",
      "other",
    ]);
  });

  it("parses queued and completed API job snapshots", () => {
    for (const renderer of ["hyperframes", "playwright"] as const) {
      const queued = parseApiGenerationJob({
        id: `job-${renderer}`,
        status: "queued",
        request: { ...request, id: `job-${renderer}`, renderer },
        createdAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:00:00.000Z",
        progressEvents: [],
      });

      expect(queued.status).toBe("queued");
      expect(queued.request.id).toBe(`job-${renderer}`);
      expect(queued.request.renderer).toBe(renderer);
    }

    const completed = parseApiGenerationJob({
      id: "job-test",
      status: "completed",
      request,
      createdAt: "2026-06-11T00:00:00.000Z",
      updatedAt: "2026-06-11T00:00:02.000Z",
      progressEvents: [progressEvent],
      result: {
        method: "hyperframes",
        composition: {
          indexArtifact: compositionIndexArtifact,
          outputVideoArtifact,
        },
        artifacts: [compositionIndexArtifact, outputVideoArtifact],
        warnings: [],
      },
    });

    expect(completed.result?.method).toBe("hyperframes");
    expect(completed.result?.artifacts.map((artifact) => artifact.kind)).toEqual(["composition-index", "output-video"]);
  });

  it("accepts Playwright API results with a valid DemoProject", () => {
    const result = ApiGenerationResultSchema.parse({
      method: "playwright",
      project: goldenProject,
      artifacts: [playwrightProjectArtifact],
      warnings: [],
    });

    expect(result.method).toBe("playwright");
    if (result.method !== "playwright") {
      throw new Error("expected playwright result");
    }
    expect(result.project.id).toBe(goldenProject.id);
  });

  it("accepts HyperFrames API results with required composition artifacts", () => {
    const result = ApiGenerationResultSchema.parse({
      method: "hyperframes",
      composition: {
        indexArtifact: compositionIndexArtifact,
        outputVideoArtifact,
      },
      artifacts: [compositionIndexArtifact, outputVideoArtifact],
      warnings: [],
    });

    expect(result.method).toBe("hyperframes");
    if (result.method !== "hyperframes") {
      throw new Error("expected hyperframes result");
    }
    expect(result.composition.indexArtifact.kind).toBe("composition-index");
    expect(result.composition.outputVideoArtifact.kind).toBe("output-video");
  });

  it("rejects method/result mismatches and missing native outputs", () => {
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
        composition: {
          indexArtifact: compositionIndexArtifact,
          outputVideoArtifact,
        },
        artifacts: [playwrightProjectArtifact],
        warnings: [],
      }).success,
    ).toBe(false);

    expect(
      ApiGenerationResultSchema.safeParse({
        method: "hyperframes",
        composition: {
          indexArtifact: compositionIndexArtifact,
        },
        artifacts: [compositionIndexArtifact],
        warnings: [],
      }).success,
    ).toBe(false);

    expect(
      ApiGenerationResultSchema.safeParse({
        method: "hyperframes",
        composition: {
          indexArtifact: outputVideoArtifact,
          outputVideoArtifact: compositionIndexArtifact,
        },
        artifacts: [compositionIndexArtifact, outputVideoArtifact],
        warnings: [],
      }).success,
    ).toBe(false);
  });

  it("rejects renderer both in API job snapshots", () => {
    expect(
      safeParseApiGenerationJob({
        id: "job-both",
        status: "queued",
        request: { ...request, id: "job-both", renderer: "both" },
        createdAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:00:00.000Z",
        progressEvents: [],
      }).success,
    ).toBe(false);
  });

  it("rejects completed API jobs when request renderer and result method disagree", () => {
    expect(
      safeParseApiGenerationJob({
        id: "job-test",
        status: "completed",
        request: { ...request, renderer: "playwright" },
        createdAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:00:02.000Z",
        progressEvents: [progressEvent],
        result: {
          method: "hyperframes",
          composition: {
            indexArtifact: compositionIndexArtifact,
            outputVideoArtifact,
          },
          artifacts: [compositionIndexArtifact, outputVideoArtifact],
          warnings: [],
        },
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
          id: "job-test",
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
        request: { ...request, renderer: "canvas" },
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
          method: "hyperframes",
          composition: {
            indexArtifact: compositionIndexArtifact,
            outputVideoArtifact,
          },
          artifacts: [compositionIndexArtifact, outputVideoArtifact],
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
          method: "hyperframes",
          composition: {
            indexArtifact: compositionIndexArtifact,
            outputVideoArtifact,
          },
          artifacts: [compositionIndexArtifact, outputVideoArtifact],
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
          method: "hyperframes",
          composition: {
            indexArtifact: compositionIndexArtifact,
            outputVideoArtifact,
          },
          artifacts: [compositionIndexArtifact, outputVideoArtifact],
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

const revBaseJob = {
  id: "job-1",
  status: "completed" as const,
  request: {
    id: "job-1",
    mode: "ai-url-planning",
    repoUrl: "https://github.com/a/b",
    productUrl: "https://a.com",
    durationCapSeconds: 60,
    aspectRatio: "16:9",
    renderer: "hyperframes",
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  progressEvents: [],
  result: {
    method: "hyperframes",
    composition: {
      indexArtifact: compositionIndexArtifact,
      outputVideoArtifact,
    },
    artifacts: [compositionIndexArtifact, outputVideoArtifact],
    warnings: [],
  },
};

const editOnlyRevisionResult = {
  method: "hyperframes",
  composition: {
    indexArtifact: compositionIndexArtifact,
  },
  artifacts: [compositionIndexArtifact],
  warnings: [],
} as const;

describe("ApiRevisionSchema", () => {
  it("accepts edit-only HyperFrames revision results before render", () => {
    const result = ApiRevisionResultSchema.parse(editOnlyRevisionResult);

    expect(result.method).toBe("hyperframes");
    expect(result.composition.indexArtifact.kind).toBe("composition-index");
    expect(result.composition.outputVideoArtifact).toBeUndefined();
  });

  it("requires result when completed, error when failed", () => {
    expect(
      ApiRevisionSchema.safeParse({
        id: "rev-1",
        status: "completed",
        createdAt: "2026-01-01T00:00:00.000Z",
        result: editOnlyRevisionResult,
      }).success,
    ).toBe(true);
    expect(ApiRevisionSchema.safeParse({ id: "rev-1", status: "completed", createdAt: "2026-01-01T00:00:00.000Z" }).success).toBe(false);
    expect(ApiRevisionSchema.safeParse({ id: "rev-1", status: "failed", createdAt: "2026-01-01T00:00:00.000Z", error: { status: "failed", stage: "unknown", message: "boom" } }).success).toBe(true);
  });
});

describe("ApiGenerationJobSchema with revisions", () => {
  it("accepts a completed job carrying revisions + currentRevisionId", () => {
    expect(ApiGenerationJobSchema.safeParse({
      ...revBaseJob, currentRevisionId: "rev-1",
      revisions: [{ id: "rev-1", status: "completed", createdAt: "2026-01-01T00:00:00.000Z", result: editOnlyRevisionResult }],
    }).success).toBe(true);
  });
  it("still accepts a job with no revisions (back-compat)", () => {
    expect(ApiGenerationJobSchema.safeParse(revBaseJob).success).toBe(true);
  });
});
