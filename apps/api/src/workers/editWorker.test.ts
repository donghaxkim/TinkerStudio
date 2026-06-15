import { describe, expect, it, vi } from "vitest";
import { createEditWorker, type RunEdit } from "./editWorker.js";
import { createJobStore } from "../jobs/jobStore.js";

const REQ = { mode: "ai-url-planning" as const, repoUrl: "https://github.com/a/b", productUrl: "https://a.com", durationCapSeconds: 60, aspectRatio: "16:9" as const, renderer: "hyperframes" as const };
function seeded() {
  const store = createJobStore();
  store.create({ id: "j", request: REQ, outputRoot: "/tmp/j", now: "2026-01-01T00:00:00.000Z" });
  store.complete("j", { artifacts: [] }, "2026-01-01T00:00:01.000Z");
  store.setPendingEdit("j", { revId: "rev-1", instruction: "x", context: [] });
  return store;
}

describe("editWorker", () => {
  it("runs the edit and appends the revision", async () => {
    const store = seeded();
    const runEdit: RunEdit = vi.fn(async () => ({ artifacts: [{ kind: "composition-index" as const, relativePath: "revisions/rev-1/hyperframes/index.html", url: "/api/jobs/j/artifacts/revisions/rev-1/hyperframes/index.html", mediaType: "text/html" }] }));
    await createEditWorker({ store, runEdit, now: () => "2026-01-01T00:00:02.000Z" })("j");
    const snap = store.getSnapshot("j")!;
    expect(snap.currentRevisionId).toBe("rev-1");
    expect(snap.revisions?.[0]?.result?.artifacts[0]?.kind).toBe("composition-index");
    expect(runEdit).toHaveBeenCalledOnce();
  });
  it("fails the revision when runEdit throws, leaving the parent completed", async () => {
    const store = seeded();
    const runEdit: RunEdit = async () => { throw new Error("agent boom"); };
    await createEditWorker({ store, runEdit, now: () => "2026-01-01T00:00:02.000Z" })("j");
    const snap = store.getSnapshot("j")!;
    expect(snap.status).toBe("completed");
    expect(snap.revisions?.[0]).toMatchObject({ id: "rev-1", status: "failed" });
  });
  it("is a no-op when there is no pendingEdit", async () => {
    const store = createJobStore();
    store.create({ id: "j", request: REQ, outputRoot: "/tmp/j", now: "2026-01-01T00:00:00.000Z" });
    const runEdit = vi.fn();
    await createEditWorker({ store, runEdit: runEdit as unknown as RunEdit, now: () => "t" })("j");
    expect(runEdit).not.toHaveBeenCalled();
  });
});
