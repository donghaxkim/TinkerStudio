import { describe, expect, it, vi } from "vitest";
import type { AiUrlPlanningCreateDemoRequest, ApiGenerationJob } from "@tinker/generation-contract";
import { DemoProjectSchema } from "@tinker/project-schema";
import goldenProjectInput from "../../../../packages/project-schema/fixtures/person-a-generated-project.sample.json" with { type: "json" };
import { createApiGenerationClient } from "./apiGenerationClient.js";

const goldenProject = DemoProjectSchema.parse(goldenProjectInput);

const request: AiUrlPlanningCreateDemoRequest = {
  mode: "ai-url-planning",
  repoUrl: "https://github.com/example/product",
  productUrl: "https://github.com/example/product",
  prompt: "Show the analytics workflow",
  durationCapSeconds: 60,
  aspectRatio: "16:9",
  renderer: "hyperframes",
};

function job(overrides: Partial<ApiGenerationJob>): ApiGenerationJob {
  const renderer: ApiGenerationJob["request"]["renderer"] = overrides.result?.method ?? "hyperframes";
  return {
    id: "job-test",
    status: "queued",
    request: { ...request, id: "job-test", renderer },
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
    progressEvents: [],
    ...overrides,
  };
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe("createApiGenerationClient", () => {
  it("posts ai-url-planning requests, polls until completion, and emits backend progress", async () => {
    const running = job({
      status: "running",
      progressEvents: [
        {
          jobId: "job-test",
          status: "running",
          message: "AI URL analysis started",
          time: "2026-06-14T00:00:01.000Z",
        },
      ],
    });
    const completed = job({
      status: "completed",
      updatedAt: "2026-06-14T00:00:02.000Z",
      progressEvents: running.progressEvents,
      result: {
        method: "hyperframes",
        composition: {
          indexArtifact: {
            kind: "composition-index",
            relativePath: "hyperframes/index.html",
            url: "/api/jobs/job-test/artifacts/hyperframes/index.html",
            mediaType: "text/html; charset=utf-8",
          },
          outputVideoArtifact: {
            kind: "output-video",
            relativePath: "hyperframes/output.mp4",
            url: "/api/jobs/job-test/artifacts/hyperframes/output.mp4",
            mediaType: "video/mp4",
          },
        },
        artifacts: [
          {
            kind: "composition-index",
            relativePath: "hyperframes/index.html",
            url: "/api/jobs/job-test/artifacts/hyperframes/index.html",
            mediaType: "text/html; charset=utf-8",
          },
          {
            kind: "output-video",
            relativePath: "hyperframes/output.mp4",
            url: "/api/jobs/job-test/artifacts/hyperframes/output.mp4",
            mediaType: "video/mp4",
          },
        ],
        warnings: [],
      },
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(job({})))
      .mockResolvedValueOnce(jsonResponse(running))
      .mockResolvedValueOnce(jsonResponse(completed));
    const client = createApiGenerationClient({ fetch: fetch as unknown as typeof globalThis.fetch, pollIntervalMs: 0 });
    const progressMessages: string[] = [];
    const unsubscribe = client.subscribeToProgress("job-test", (event) => {
      if ("message" in event) progressMessages.push(event.message);
    });

    const result = await client.createDemo(request);
    unsubscribe();

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/jobs/job-test");
    expect(fetch).toHaveBeenNthCalledWith(3, "/api/jobs/job-test");
    expect(result.status).toBe("completed");
    const apiResult = (result as ApiGenerationJob).result;
    expect(apiResult?.method).toBe("hyperframes");
    expect(
      apiResult?.method === "hyperframes"
        ? apiResult.composition.outputVideoArtifact.url
        : undefined,
    ).toBe("/api/jobs/job-test/artifacts/hyperframes/output.mp4");
    expect(progressMessages).toEqual(["AI URL analysis started"]);
  });

  it("parses completed Playwright jobs with embedded DemoProject", async () => {
    const completed = job({
      status: "completed",
      updatedAt: "2026-06-14T00:00:02.000Z",
      result: {
        method: "playwright",
        project: goldenProject,
        artifacts: [
          {
            kind: "playwright-demo-project",
            relativePath: "playwright/demo-project.json",
            url: "/api/jobs/job-test/artifacts/playwright/demo-project.json",
            mediaType: "application/json; charset=utf-8",
          },
        ],
        warnings: [],
      },
    });
    const fetch = vi.fn().mockResolvedValueOnce(jsonResponse(completed));
    const client = createApiGenerationClient({ fetch: fetch as unknown as typeof globalThis.fetch, pollIntervalMs: 0 });

    const result = await client.createDemo({ ...request, renderer: "playwright" });

    expect(result.status).toBe("completed");
    expect((result as ApiGenerationJob).result?.method).toBe("playwright");
  });

  it("turns API error responses into actionable errors", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "Generation queue is full" }, false, 429));
    const client = createApiGenerationClient({ fetch: fetch as unknown as typeof globalThis.fetch, pollIntervalMs: 0 });

    await expect(client.createDemo(request)).rejects.toThrow("Generation queue is full");
  });
});
