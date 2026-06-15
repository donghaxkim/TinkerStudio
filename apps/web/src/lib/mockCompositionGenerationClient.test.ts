import { describe, expect, it } from "vitest";
import { selectArtifactUrl } from "./compositionGenerationClient.js";
import { createMockCompositionGenerationClient } from "./mockCompositionGenerationClient.js";

const request = {
  mode: "ai-url-planning",
  repoUrl: "https://github.com/acme/driftboard",
  productUrl: "https://driftboard.example.com",
  durationCapSeconds: 60,
  aspectRatio: "16:9",
} as const;

describe("MockCompositionGenerationClient", () => {
  it("creates a non-terminal job, then completes with composition + video artifacts", async () => {
    const client = createMockCompositionGenerationClient();
    const created = await client.createJob(request);
    expect(["queued", "running"]).toContain(created.status);

    const done = await client.waitForJob(created.id, { intervalMs: 0 });
    expect(done.status).toBe("completed");
    expect(selectArtifactUrl(done, "composition-index")).toContain("index.html");
    expect(selectArtifactUrl(done, "output-video")).toContain("output.mp4");
  });

  it("keeps completed request renderer consistent with the Hyperframes result", async () => {
    const client = createMockCompositionGenerationClient();
    const created = await client.createJob({ ...request, renderer: "playwright" });

    const done = await client.waitForJob(created.id, { intervalMs: 0 });

    expect(done.status).toBe("completed");
    expect(done.request.renderer).toBe("hyperframes");
    expect(done.result?.method).toBe("hyperframes");
  });

  it("getJob throws for an unknown id", async () => {
    const client = createMockCompositionGenerationClient();
    await expect(client.getJob("nope")).rejects.toThrow("Unknown mock composition job 'nope'");
  });

  it("waitForJob reports a running update before completing", async () => {
    const client = createMockCompositionGenerationClient();
    const created = await client.createJob(request);
    const statuses: string[] = [];
    const done = await client.waitForJob(created.id, { onUpdate: (job) => statuses.push(job.status) });
    expect(statuses).toEqual(["running", "completed"]);
    expect(done.status).toBe("completed");
  });

  it("waitForJob throws if the signal is already aborted", async () => {
    const client = createMockCompositionGenerationClient();
    const created = await client.createJob(request);
    const controller = new AbortController();
    controller.abort();
    await expect(client.waitForJob(created.id, { signal: controller.signal })).rejects.toThrow();
  });
});
