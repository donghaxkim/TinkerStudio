import { describe, expect, it, vi } from "vitest";
import type { ApiGenerationJob, DemoOutline } from "@tinker/generation-contract";
import { createHttpCompositionGenerationClient } from "./httpCompositionGenerationClient.js";

function jsonResponse(status: number, data: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as unknown as Response;
}

function job(overrides: Partial<ApiGenerationJob> = {}): ApiGenerationJob {
  return {
    id: "job-1",
    status: "queued",
    request: {
      id: "job-1",
      mode: "ai-url-planning",
      repoUrl: "https://github.com/acme/driftboard",
      productUrl: "https://driftboard.example.com",
      durationCapSeconds: 60,
      aspectRatio: "16:9",
      renderer: "hyperframes",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    progressEvents: [],
    ...overrides,
  } as ApiGenerationJob;
}

const validRequest = {
  mode: "ai-url-planning",
  repoUrl: "https://github.com/acme/driftboard",
  durationCapSeconds: 60,
  aspectRatio: "16:9",
} as const;

const approvedOutline: DemoOutline = {
  title: "Driftboard launch demo",
  durationCapSeconds: 60,
  aspectRatio: "16:9",
  summary: "Show the launch workflow from product evidence.",
  scenes: [
    { id: "scene-1", goal: "Open on the launch problem", visual: "Show the homepage hero.", evidence: ["website"] },
    { id: "scene-2", goal: "Show repo-backed details", visual: "Use real component names from the repo.", evidence: ["repo", "website"] },
  ],
  generationNotes: ["Keep pacing concise."],
};

describe("HttpCompositionGenerationClient", () => {
  it("POSTs repo-only ai-url-planning to /api/jobs and forces renderer=hyperframes", async () => {
    const fetchFn = vi.fn(async (..._args: Parameters<typeof fetch>) => jsonResponse(202, job()));
    const client = createHttpCompositionGenerationClient({ fetchFn });
    const created = await client.createJob(validRequest);
    expect(created.status).toBe("queued");
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("/api/jobs");
    expect(init?.method).toBe("POST");
    const sent = JSON.parse((init?.body as string) ?? "{}");
    expect(sent.renderer).toBe("hyperframes");
    expect(sent.mode).toBe("ai-url-planning");
    expect(sent.productUrl).toBeUndefined();
  });

  it("throws the server message on a 422 validation error", async () => {
    const fetchFn = vi.fn(async (..._args: Parameters<typeof fetch>) => jsonResponse(422, { status: "failed", stage: "validation", message: "repoUrl: required" }));
    const client = createHttpCompositionGenerationClient({ fetchFn });
    await expect(client.createJob(validRequest)).rejects.toThrow("repoUrl: required");
  });

  it("GETs a job by id", async () => {
    const fetchFn = vi.fn(async (..._args: Parameters<typeof fetch>) => jsonResponse(200, job({ status: "running" })));
    const client = createHttpCompositionGenerationClient({ fetchFn });
    const got = await client.getJob("job-1");
    expect(got.status).toBe("running");
    expect(fetchFn.mock.calls[0]![0]).toBe("/api/jobs/job-1");
  });

  it("POSTs job cancellation to the API", async () => {
    const fetchFn = vi.fn(async (..._args: Parameters<typeof fetch>) => jsonResponse(200, job({ status: "failed", error: { status: "failed", stage: "cancelled", message: "Generation cancelled." } })));
    const client = createHttpCompositionGenerationClient({ fetchFn });
    expect(client.cancelJob).toBeDefined();
    await client.cancelJob!("job-1");
    expect(fetchFn).toHaveBeenCalledWith("/api/jobs/job-1/cancel", { method: "POST" });
  });

  it("waitForJob polls until terminal and reports each update", async () => {
    const outputVideoArtifact = {
      kind: "output-video",
      relativePath: "hyperframes/output.mp4",
      url: "/api/jobs/job-1/artifacts/hyperframes/output.mp4",
      mediaType: "video/mp4",
    } as const;
    const compositionIndexArtifact = {
      kind: "composition-index",
      relativePath: "hyperframes/index.html",
      url: "/api/jobs/job-1/artifacts/hyperframes/index.html",
      mediaType: "text/html",
    } as const;
    const completed = job({
      status: "completed",
      result: {
        method: "hyperframes",
        composition: {
          indexArtifact: compositionIndexArtifact,
          outputVideoArtifact,
        },
        artifacts: [outputVideoArtifact, compositionIndexArtifact],
        warnings: [],
      },
    });
    const responses = [jsonResponse(200, job({ status: "running" })), jsonResponse(200, completed)];
    const fetchFn = vi.fn(async (..._args: Parameters<typeof fetch>) => responses.shift()!);
    const client = createHttpCompositionGenerationClient({ fetchFn });
    const seen: string[] = [];
    const result = await client.waitForJob("job-1", { intervalMs: 0, onUpdate: (j) => seen.push(j.status) });
    expect(result.status).toBe("completed");
    expect(seen).toEqual(["running", "completed"]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("lets the caller override the renderer to Playwright", async () => {
    const fetchFn = vi.fn(async (..._args: Parameters<typeof fetch>) => jsonResponse(202, job()));
    const client = createHttpCompositionGenerationClient({ fetchFn });
    await client.createJob({ ...validRequest, renderer: "playwright" });
    const [, init] = fetchFn.mock.calls[0]!;
    const sent = JSON.parse((init?.body as string) ?? "{}");
    expect(sent.renderer).toBe("playwright");
  });

  it("serializes approvedOutline when the caller provides one", async () => {
    const fetchFn = vi.fn(async (..._args: Parameters<typeof fetch>) => jsonResponse(202, job()));
    const client = createHttpCompositionGenerationClient({ fetchFn });
    await client.createJob({ ...validRequest, approvedOutline });
    const [, init] = fetchFn.mock.calls[0]!;
    const sent = JSON.parse((init?.body as string) ?? "{}");
    expect(sent.approvedOutline).toEqual(approvedOutline);
  });

  it("waitForJob rejects once the signal is aborted", async () => {
    const controller = new AbortController();
    const fetchFn = vi.fn(async (..._args: Parameters<typeof fetch>) => {
      controller.abort();
      return jsonResponse(200, job({ status: "running" }));
    });
    const client = createHttpCompositionGenerationClient({ fetchFn });
    await expect(
      client.waitForJob("job-1", { intervalMs: 5, signal: controller.signal }),
    ).rejects.toThrow();
  });
});
