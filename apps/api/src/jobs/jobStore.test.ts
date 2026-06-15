import { describe, expect, it } from "vitest";
import { createJobStore } from "./jobStore.js";

const REQ = { mode: "ai-url-planning" as const, repoUrl: "https://github.com/a/b", productUrl: "https://a.com", durationCapSeconds: 60, aspectRatio: "16:9" as const, renderer: "hyperframes" as const };
const indexArtifact = { kind: "composition-index" as const, relativePath: "hyperframes/index.html", url: "/api/jobs/j/artifacts/hyperframes/index.html", mediaType: "text/html" };
const outputVideoArtifact = { kind: "output-video" as const, relativePath: "hyperframes/output.mp4", url: "/api/jobs/j/artifacts/hyperframes/output.mp4", mediaType: "video/mp4" };
const completedResult = { method: "hyperframes" as const, composition: { indexArtifact, outputVideoArtifact }, artifacts: [indexArtifact, outputVideoArtifact], warnings: [] };
const revisionResult = { method: "hyperframes" as const, composition: { indexArtifact }, artifacts: [indexArtifact], warnings: [] };

function completed(store: ReturnType<typeof createJobStore>) {
  store.create({ id: "j", request: REQ, outputRoot: "/tmp/j", now: "2026-01-01T00:00:00.000Z" });
  store.complete("j", completedResult, "2026-01-01T00:00:01.000Z");
}

describe("jobStore revisions", () => {
  it("setPendingEdit then appendRevision adds a completed revision + sets currentRevisionId; snapshot stays valid + strips pendingEdit", () => {
    const store = createJobStore();
    completed(store);
    store.setPendingEdit("j", { revId: "rev-1", instruction: "x", context: [] });
    expect(store.getRecord("j")?.pendingEdit?.revId).toBe("rev-1");
    store.appendRevision("j", { id: "rev-1", status: "completed", createdAt: "2026-01-01T00:00:02.000Z", result: revisionResult }, "2026-01-01T00:00:02.000Z");
    const snap = store.getSnapshot("j")!;
    expect(snap.status).toBe("completed");
    expect(snap.currentRevisionId).toBe("rev-1");
    expect(snap.revisions?.[0]?.id).toBe("rev-1");
    expect(store.getRecord("j")?.pendingEdit).toBeUndefined();
    expect("pendingEdit" in (snap as object)).toBe(false);
  });

  it("failRevision records a failed revision without flipping the parent status", () => {
    const store = createJobStore();
    completed(store);
    store.setPendingEdit("j", { revId: "rev-1", instruction: "x", context: [] });
    store.failRevision("j", "rev-1", { status: "failed", stage: "unknown", message: "boom" }, "2026-01-01T00:00:03.000Z");
    const snap = store.getSnapshot("j")!;
    expect(snap.status).toBe("completed");
    expect(snap.revisions?.[0]).toMatchObject({ id: "rev-1", status: "failed" });
  });
});
