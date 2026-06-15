import { describe, expect, it, vi } from "vitest";
import { createRenderWorker, type RunRender } from "./renderWorker.js";
import { createJobStore } from "../jobs/jobStore.js";

const REQ = { mode: "ai-url-planning" as const, repoUrl: "https://github.com/a/b", productUrl: "https://a.com", durationCapSeconds: 60, aspectRatio: "16:9" as const, renderer: "hyperframes" as const };
const indexArtifact = { kind: "composition-index" as const, relativePath: "hyperframes/index.html", url: "/api/jobs/j/artifacts/hyperframes/index.html", mediaType: "text/html" };
const outputVideoArtifact = { kind: "output-video" as const, relativePath: "hyperframes/output.mp4", url: "/api/jobs/j/artifacts/hyperframes/output.mp4", mediaType: "video/mp4" };
const completedResult = { method: "hyperframes" as const, composition: { indexArtifact, outputVideoArtifact }, artifacts: [indexArtifact, outputVideoArtifact], warnings: [] };
const revisionIndexArtifact = { kind: "composition-index" as const, relativePath: "revisions/rev-1/hyperframes/index.html", url: "/api/jobs/j/artifacts/revisions/rev-1/hyperframes/index.html", mediaType: "text/html" };
const revisionOutputArtifact = { kind: "output-video" as const, relativePath: "revisions/rev-1/hyperframes/output.mp4", url: "/u/v", mediaType: "video/mp4" };
const revisionResult = { method: "hyperframes" as const, composition: { indexArtifact: revisionIndexArtifact }, artifacts: [revisionIndexArtifact], warnings: [] };
const renderedRevisionResult = { method: "hyperframes" as const, composition: { indexArtifact: revisionIndexArtifact, outputVideoArtifact: revisionOutputArtifact }, artifacts: [revisionIndexArtifact, revisionOutputArtifact], warnings: [] };

function seeded() {
  const store = createJobStore();
  store.create({ id: "j", request: REQ, outputRoot: "/tmp/j", now: "2026-06-14T00:00:00.000Z" });
  store.complete("j", completedResult, "2026-06-14T00:00:00.000Z");
  store.appendRevision("j", { id: "rev-1", status: "completed", createdAt: "2026-06-14T00:00:00.000Z", result: revisionResult }, "2026-06-14T00:00:00.000Z");
  store.setPendingRender("j", { revId: "rev-1" });
  return store;
}

describe("renderWorker", () => {
  it("renders the revision and adds an output-video artifact to it", async () => {
    const store = seeded();
    const runRender: RunRender = vi.fn(async () => renderedRevisionResult);
    await createRenderWorker({ store, runRender, now: () => "2026-06-14T00:00:01.000Z" })("j");
    const rev = store.getSnapshot("j")!.revisions!.find((r) => r.id === "rev-1")!;
    expect(rev.result!.artifacts.some((a) => a.kind === "output-video")).toBe(true);
    expect(store.getRecord("j")?.pendingRender).toBeUndefined();
    expect(runRender).toHaveBeenCalledOnce();
  });
  it("records a renderError on the revision when the render fails (no throw; clears pendingRender)", async () => {
    const store = seeded();
    const runRender: RunRender = vi.fn(async () => { throw new Error("hyperframes render failed; see render.log"); });
    await createRenderWorker({ store, runRender, now: () => "2026-06-14T00:00:02.000Z" })("j");
    const rev = store.getSnapshot("j")!.revisions!.find((r) => r.id === "rev-1")!;
    // The edit succeeded — only the MP4 render failed — so the revision stays completed (re-renderable).
    expect(rev.status).toBe("completed");
    expect(rev.result!.artifacts.some((a) => a.kind === "output-video")).toBe(false);
    expect(rev.renderError?.message).toContain("hyperframes render failed");
    expect(store.getRecord("j")?.pendingRender).toBeUndefined();
  });

  it("is a no-op without pendingRender", async () => {
    const store = createJobStore();
    store.create({ id: "j", request: REQ, outputRoot: "/tmp/j", now: "2026-06-14T00:00:00.000Z" });
    const runRender = vi.fn();
    await createRenderWorker({ store, runRender: runRender as unknown as RunRender, now: () => "t" })("j");
    expect(runRender).not.toHaveBeenCalled();
  });
});
