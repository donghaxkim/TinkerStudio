import { describe, expect, it } from "vitest";
import { createJobStore } from "./jobStore.js";

const request = { mode: "ai-url-planning" as const, repoUrl: "https://github.com/a/b", productUrl: "https://a.com", durationCapSeconds: 60, aspectRatio: "16:9" as const };
const completedResult = { method: "testreel" as const, artifacts: [{ kind: "published-video" as const, relativePath: "testreel/final.mp4", url: "/api/jobs/j/artifacts/testreel/final.mp4", mediaType: "video/mp4" }], warnings: [] };

describe("jobStore", () => {
  it("creates and completes a typed Testreel job snapshot", () => {
    const store = createJobStore();
    store.create({ id: "j", request, outputRoot: "/tmp/j", now: "2026-01-01T00:00:00.000Z" });
    store.complete("j", completedResult, "2026-01-01T00:00:01.000Z");
    expect(store.getSnapshot("j")).toMatchObject({ id: "j", status: "completed", request: { id: "j" }, result: { method: "testreel" } });
  });
});
