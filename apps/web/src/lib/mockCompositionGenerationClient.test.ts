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

  it("getJob throws for an unknown id", async () => {
    const client = createMockCompositionGenerationClient();
    await expect(client.getJob("nope")).rejects.toThrow("Unknown mock composition job 'nope'");
  });
});
