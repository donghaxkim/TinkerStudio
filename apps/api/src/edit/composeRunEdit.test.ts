import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createComposeRunEdit } from "./composeRunEdit.js";
import { createJobStore } from "../jobs/jobStore.js";

const HTML = `<html><body><div data-composition-id="demo"></div><script>window.__timelines={demo:1};\nconst D=1.0;</script></body></html>`;
const indexArtifact = { kind: "composition-index" as const, relativePath: "hyperframes/index.html", url: "/api/jobs/j/artifacts/hyperframes/index.html", mediaType: "text/html" };
const outputVideoArtifact = { kind: "output-video" as const, relativePath: "hyperframes/output.mp4", url: "/api/jobs/j/artifacts/hyperframes/output.mp4", mediaType: "video/mp4" };
const completedResult = { method: "hyperframes" as const, composition: { indexArtifact, outputVideoArtifact }, artifacts: [indexArtifact, outputVideoArtifact], warnings: [] };

async function seededRecord() {
  const outputRoot = await mkdtemp(join(tmpdir(), "tinker-edit-"));
  await mkdir(join(outputRoot, "hyperframes"), { recursive: true });
  await writeFile(join(outputRoot, "hyperframes", "index.html"), HTML, "utf8");
  const store = createJobStore();
  store.create({ id: "j", request: { mode: "ai-url-planning", repoUrl: "https://github.com/a/b", productUrl: "https://a.com", durationCapSeconds: 60, aspectRatio: "16:9", renderer: "hyperframes", hyperframesAgent: "opencode" }, outputRoot, now: "2026-06-14T00:00:00.000Z" });
  store.complete("j", completedResult, "2026-06-14T00:00:00.000Z");
  return { store, outputRoot };
}

describe("createComposeRunEdit", () => {
  it("applies the agent's search/replace, writes the revision, and indexes its artifacts", async () => {
    const { store } = await seededRecord();
    const runAgent = async () => "<<<<<<< SEARCH\nconst D=1.0;\n=======\nconst D=2.0;\n>>>>>>> REPLACE";
    const runEdit = createComposeRunEdit({ runAgent });
    const result = await runEdit(store.getRecord("j")!, { revId: "rev-1", instruction: "slower", context: [] });
    const ci = result.artifacts.find((a) => a.kind === "composition-index")!;
    expect(ci.relativePath).toBe("revisions/rev-1/hyperframes/index.html");
    const written = await readFile(join(store.getRecord("j")!.outputRoot, "revisions/rev-1/hyperframes/index.html"), "utf8");
    expect(written).toContain("const D=2.0;");
  });
  it("does not carry a stale output-video (or render logs) from the base into the revision", async () => {
    const { store } = await seededRecord();
    // Base composition already has a rendered video + render logs from generation.
    const base = join(store.getRecord("j")!.outputRoot, "hyperframes");
    await writeFile(join(base, "output.mp4"), "STALE-BASE-VIDEO", "utf8");
    await writeFile(join(base, "render.log"), "old render", "utf8");
    await writeFile(join(base, "lint.log"), "old lint", "utf8");
    const runAgent = async () => "<<<<<<< SEARCH\nconst D=1.0;\n=======\nconst D=2.0;\n>>>>>>> REPLACE";
    const result = await createComposeRunEdit({ runAgent })(store.getRecord("j")!, { revId: "rev-1", instruction: "x", context: [] });
    // The revision must advertise composition source but NO stale rendered video — Export renders fresh.
    expect(result.artifacts.some((a) => a.kind === "composition-index")).toBe(true);
    expect(result.artifacts.some((a) => a.kind === "output-video")).toBe(false);
  });
  it("throws when the agent edit does not apply", async () => {
    const { store } = await seededRecord();
    const runEdit = createComposeRunEdit({ runAgent: async () => "<<<<<<< SEARCH\nNOPE\n=======\nX\n>>>>>>> REPLACE" });
    await expect(runEdit(store.getRecord("j")!, { revId: "rev-1", instruction: "x", context: [] })).rejects.toThrow(/did not match/i);
  });
  it("throws when the edit breaks the timeline contract (lint)", async () => {
    const { store } = await seededRecord();
    const runEdit = createComposeRunEdit({ runAgent: async () => "<<<<<<< SEARCH\nwindow.__timelines={demo:1};\n=======\n// removed\n>>>>>>> REPLACE" });
    await expect(runEdit(store.getRecord("j")!, { revId: "rev-1", instruction: "x", context: [] })).rejects.toThrow(/__timelines|validation/i);
  });
  it("retries once feeding back the error, then succeeds", async () => {
    const { store } = await seededRecord();
    const runAgent = vi.fn()
      .mockResolvedValueOnce("<<<<<<< SEARCH\nNOPE_NO_MATCH\n=======\nx\n>>>>>>> REPLACE")   // first: won't apply
      .mockResolvedValueOnce("<<<<<<< SEARCH\nconst D=1.0;\n=======\nconst D=2.0;\n>>>>>>> REPLACE"); // retry: good
    const runEdit = createComposeRunEdit({ runAgent: runAgent as unknown as Parameters<typeof createComposeRunEdit>[0]["runAgent"] });
    const result = await runEdit(store.getRecord("j")!, { revId: "rev-1", instruction: "x", context: [] });
    expect(result.artifacts.some((a) => a.kind === "composition-index")).toBe(true);
    expect(runAgent).toHaveBeenCalledTimes(2);
    // the retry prompt includes the previous error
    expect(String(runAgent.mock.calls[1]?.[0])).toMatch(/did not match|previous/i);
  });

  it("throws after the retry also fails", async () => {
    const { store } = await seededRecord();
    const runAgent = vi.fn().mockResolvedValue("<<<<<<< SEARCH\nNOPE_NO_MATCH\n=======\nx\n>>>>>>> REPLACE");
    const runEdit = createComposeRunEdit({ runAgent: runAgent as unknown as Parameters<typeof createComposeRunEdit>[0]["runAgent"] });
    await expect(runEdit(store.getRecord("j")!, { revId: "rev-1", instruction: "x", context: [] })).rejects.toThrow(/did not match/i);
    expect(runAgent).toHaveBeenCalledTimes(2);
  });
});
