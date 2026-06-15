import { describe, expect, it, vi } from "vitest";
import { createHttpCompositionEditClient } from "./httpCompositionEditClient.js";
import type { ApiGenerationJob } from "@tinker/generation-contract";

function job(over: Partial<ApiGenerationJob>): ApiGenerationJob {
  return {
    id: "job-1", status: "completed",
    request: { id: "job-1", mode: "ai-url-planning", repoUrl: "https://github.com/a/b", productUrl: "https://a.com", durationCapSeconds: 60, aspectRatio: "16:9", renderer: "hyperframes" },
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    progressEvents: [], result: { artifacts: [] }, ...over,
  } as ApiGenerationJob;
}
const res = (j: ApiGenerationJob, status = 200) => new Response(JSON.stringify(j), { status, headers: { "content-type": "application/json" } });

describe("createHttpCompositionEditClient", () => {
  it("POSTs the edit then polls until the new revision and maps its artifacts", async () => {
    const before = job({ revisions: [] });
    const after = job({
      currentRevisionId: "rev-1",
      revisions: [{ id: "rev-1", status: "completed", createdAt: "2026-01-01T00:00:01.000Z", result: { artifacts: [
        { kind: "composition-index", relativePath: "revisions/rev-1/hyperframes/index.html", url: "/api/jobs/job-1/artifacts/revisions/rev-1/hyperframes/index.html", mediaType: "text/html" },
        { kind: "output-video", relativePath: "revisions/rev-1/hyperframes/output.mp4", url: "/api/jobs/job-1/artifacts/revisions/rev-1/hyperframes/output.mp4", mediaType: "video/mp4" },
      ] } }],
    });
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(res(before, 202))  // POST /edits
      .mockResolvedValueOnce(res(after));        // GET poll
    const client = createHttpCompositionEditClient({ fetchFn: fetchFn as unknown as typeof fetch, intervalMs: 0 });
    const rev = await client.editComposition({ jobId: "job-1", instruction: "punch in", context: [] });
    expect(rev).toEqual({ id: "rev-1", compositionIndexUrl: "/api/jobs/job-1/artifacts/revisions/rev-1/hyperframes/index.html", outputVideoUrl: "/api/jobs/job-1/artifacts/revisions/rev-1/hyperframes/output.mp4" });
    expect(fetchFn).toHaveBeenNthCalledWith(1, expect.stringContaining("/api/jobs/job-1/edits"), expect.objectContaining({ method: "POST" }));
  });

  it("throws when the new revision failed", async () => {
    const before = job({ revisions: [] });
    const after = job({ revisions: [{ id: "rev-1", status: "failed", createdAt: "2026-01-01T00:00:01.000Z", error: { status: "failed", stage: "unknown", message: "agent boom" } }] });
    const fetchFn = vi.fn().mockResolvedValueOnce(res(before, 202)).mockResolvedValueOnce(res(after));
    const client = createHttpCompositionEditClient({ fetchFn: fetchFn as unknown as typeof fetch, intervalMs: 0 });
    await expect(client.editComposition({ jobId: "job-1", instruction: "x", context: [] })).rejects.toThrow(/agent boom/);
  });

  it("renderRevision POSTs /render then polls until the output-video artifact appears", async () => {
    const indexArt = { kind: "composition-index" as const, relativePath: "revisions/rev-1/hyperframes/index.html", url: "/i", mediaType: "text/html" };
    const before = job({ revisions: [{ id: "rev-1", status: "completed", createdAt: "2026-01-01T00:00:01.000Z", result: { artifacts: [indexArt] } }] });
    const after = job({ revisions: [{ id: "rev-1", status: "completed", createdAt: "2026-01-01T00:00:01.000Z", result: { artifacts: [
      indexArt,
      { kind: "output-video", relativePath: "revisions/rev-1/hyperframes/output.mp4", url: "/api/jobs/job-1/artifacts/revisions/rev-1/hyperframes/output.mp4", mediaType: "video/mp4" },
    ] } }] });
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(res(before, 202)) // POST /render
      .mockResolvedValueOnce(res(after));       // GET poll
    const client = createHttpCompositionEditClient({ fetchFn: fetchFn as unknown as typeof fetch, intervalMs: 0 });
    const url = await client.renderRevision({ jobId: "job-1", revId: "rev-1" });
    expect(url).toBe("/api/jobs/job-1/artifacts/revisions/rev-1/hyperframes/output.mp4");
    expect(fetchFn).toHaveBeenNthCalledWith(1, expect.stringContaining("/api/jobs/job-1/revisions/rev-1/render"), expect.objectContaining({ method: "POST" }));
  });

  it("renderRevision throws when the revision records a renderError", async () => {
    const before = job({ revisions: [{ id: "rev-1", status: "completed", createdAt: "2026-01-01T00:00:01.000Z", result: { artifacts: [] } }] });
    const after = job({ revisions: [{ id: "rev-1", status: "completed", createdAt: "2026-01-01T00:00:01.000Z", result: { artifacts: [] }, renderError: { status: "failed", stage: "assembly", message: "render boom" } }] });
    const fetchFn = vi.fn().mockResolvedValueOnce(res(before, 202)).mockResolvedValueOnce(res(after));
    const client = createHttpCompositionEditClient({ fetchFn: fetchFn as unknown as typeof fetch, intervalMs: 0 });
    await expect(client.renderRevision({ jobId: "job-1", revId: "rev-1" })).rejects.toThrow(/render boom/);
  });
});
