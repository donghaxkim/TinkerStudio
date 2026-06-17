import { describe, expect, it, vi } from "vitest";
import { createHttpCompositionImportClient } from "./httpCompositionImportClient.js";

const completedJob = {
  id: "job-1",
  status: "completed",
  request: {
    id: "job-1",
    mode: "ai-url-planning",
    repoUrl: "https://github.com/acme/widget",
    productUrl: "https://widget.example.com",
    durationCapSeconds: 18,
    aspectRatio: "16:9",
    renderer: "hyperframes",
    hyperframesAgent: "claude",
  },
  createdAt: "2026-06-16T00:00:00.000Z",
  updatedAt: "2026-06-16T00:00:00.000Z",
  progressEvents: [],
  result: {
    method: "hyperframes",
    composition: {
      indexArtifact: { kind: "composition-index", relativePath: "hyperframes/index.html", url: "/api/jobs/job-1/artifacts/hyperframes/index.html", mediaType: "text/html" },
      outputVideoArtifact: { kind: "output-video", relativePath: "hyperframes/output.mp4", url: "/api/jobs/job-1/artifacts/hyperframes/output.mp4", mediaType: "video/mp4" },
    },
    artifacts: [
      { kind: "composition-index", relativePath: "hyperframes/index.html", url: "/api/jobs/job-1/artifacts/hyperframes/index.html", mediaType: "text/html" },
      { kind: "output-video", relativePath: "hyperframes/output.mp4", url: "/api/jobs/job-1/artifacts/hyperframes/output.mp4", mediaType: "video/mp4" },
    ],
    warnings: [],
  },
};

describe("createHttpCompositionImportClient", () => {
  it("POSTs multipart form data and returns the parsed job", async () => {
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.body as FormData) instanceof FormData).toBe(true);
      const form = init!.body as FormData;
      expect(form.has("hyperframes/index.html")).toBe(true);
      return new Response(JSON.stringify(completedJob), { status: 200, headers: { "content-type": "application/json" } });
    });
    const client = createHttpCompositionImportClient({ fetchFn: fetchFn as unknown as typeof fetch });
    const job = await client.importComposition([
      { relativePath: "hyperframes/index.html", data: new Blob(["<html>"]) },
      { relativePath: "hyperframes/output.mp4", data: new Blob(["mp4"]) },
    ]);
    expect(job.id).toBe("job-1");
    expect(fetchFn).toHaveBeenCalledWith("/api/jobs/import", expect.objectContaining({ method: "POST" }));
  });

  it("throws the server message on error", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ message: "Couldn't find hyperframes/index.html in the uploaded folder." }), { status: 422, headers: { "content-type": "application/json" } }),
    );
    const client = createHttpCompositionImportClient({ fetchFn: fetchFn as unknown as typeof fetch });
    await expect(client.importComposition([])).rejects.toThrow(/index\.html/);
  });
});
