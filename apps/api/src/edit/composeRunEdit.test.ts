import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createComposeRunEdit } from "./composeRunEdit.js";
import { createJobStore } from "../jobs/jobStore.js";

const HTML = `<html><body><div data-composition-id="demo"></div><script>window.__timelines={demo:1};\nconst D=1.0;</script></body></html>`;

async function seededRecord() {
  const outputRoot = await mkdtemp(join(tmpdir(), "tinker-edit-"));
  await mkdir(join(outputRoot, "hyperframes"), { recursive: true });
  await writeFile(join(outputRoot, "hyperframes", "index.html"), HTML, "utf8");
  const store = createJobStore();
  store.create({ id: "j", request: { mode: "ai-url-planning", repoUrl: "https://github.com/a/b", productUrl: "https://a.com", durationCapSeconds: 60, aspectRatio: "16:9", renderer: "hyperframes" }, outputRoot, now: "2026-06-14T00:00:00.000Z" });
  store.complete("j", { artifacts: [] }, "2026-06-14T00:00:00.000Z");
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
});
