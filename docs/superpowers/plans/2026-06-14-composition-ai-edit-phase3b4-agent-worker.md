# Phase 3b-4 — Real edit worker (agent + revision artifacts) — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** The real `RunEdit`: read the current composition → `buildEditPrompt` → run the
agent (behind an injected seam) → parse/fuzzy-apply/lint (3b-2) → write the revision dir
→ index revision artifacts → serve them. Tasks 1–4 are CI-tested with a **fake agent**;
Task 5 wires the live `claude` agent (`defaultRunOpencode`) in `main.ts` (agent-gated).

**Architecture:** `apps/api/src/edit/`: `buildEditPrompt.ts` (pure), `composeRunEdit.ts`
(the orchestration behind a `RunAgent` seam), `runAgent.ts` (real seam wrapping
`defaultRunOpencode`). Plus revision support in `artifactIndex.ts` (classify) and
`routes/artifacts.ts` (serve). `composeRunEdit` returns a `RunEdit` (the 3b-1 worker seam).

**Tech stack:** TS strict, Vitest, node:fs. Spec: `…phase3-real-pipeline.md` (3b / 3b-4).

---

## File Structure
**Modify:** `apps/api/src/jobs/artifactIndex.ts`, `apps/api/src/routes/artifacts.ts`, `apps/api/src/main.ts`.
**Create:** `apps/api/src/edit/buildEditPrompt.ts` (+test), `apps/api/src/edit/composeRunEdit.ts` (+test), `apps/api/src/edit/runAgent.ts`.
**Commands:** `pnpm --filter @tinker/api test|typecheck`.

---

## Task 1: `classifyArtifact` recognizes revision paths

**Files:** `apps/api/src/jobs/artifactIndex.ts`; test `apps/api/src/jobs/artifactIndex.test.ts` (create/extend).

- [ ] **Step 1: Failing test** (test via the exported `indexArtifacts`, since `classifyArtifact` is module-private):
```ts
import { describe, expect, it } from "vitest";
import { indexArtifacts } from "./artifactIndex.js";

describe("indexArtifacts revision paths", () => {
  it("classifies revision composition-index + output-video by stripping the revisions/<id>/ prefix", () => {
    const arts = indexArtifacts({
      jobId: "j", outputRoot: "/root",
      artifactPaths: ["/root/revisions/rev-1/hyperframes/index.html", "/root/revisions/rev-1/hyperframes/output.mp4"],
    });
    expect(arts.find((a) => a.relativePath.endsWith("index.html"))?.kind).toBe("composition-index");
    expect(arts.find((a) => a.relativePath.endsWith("output.mp4"))?.kind).toBe("output-video");
    expect(arts[0]?.url).toBe("/api/jobs/j/artifacts/revisions/rev-1/hyperframes/index.html");
  });
  it("still classifies base (non-revision) paths", () => {
    const arts = indexArtifacts({ jobId: "j", outputRoot: "/root", artifactPaths: ["/root/hyperframes/index.html"] });
    expect(arts[0]?.kind).toBe("composition-index");
  });
});
```
- [ ] **Step 2: Run → FAIL** (revision index.html currently classifies as `"other"`).
- [ ] **Step 3: Implement** — at the top of `classifyArtifact`, strip a `revisions/<id>/` prefix and classify the remainder:
```ts
function classifyArtifact(relativePath: string): ApiArtifactKind {
  const revMatch = relativePath.match(/^revisions\/[^/]+\/(.+)$/);
  const p = revMatch ? revMatch[1]! : relativePath;
  if (p === "hyperframes/output.mp4") return "output-video";
  if (p === "hyperframes/index.html") return "composition-index";
  if (p === "hyperframes/asset-manifest.json") return "asset-manifest";
  if (p === "hyperframes/generation-manifest.json") return "generation-manifest";
  if (p === "hyperframes/lint.log") return "lint-log";
  if (p === "hyperframes/render.log") return "render-log";
  if (p.startsWith("hyperframes/assets/")) return "asset";
  // ...keep the remaining non-hyperframes cases using `relativePath` as before...
  return "other";
}
```
(Apply the `p` substitution to ALL `hyperframes/...` checks; leave the `playwright/...`/`product-analysis`/`repo-analysis` checks on `relativePath` — revisions only contain hyperframes output.)
- [ ] **Step 4: Run → PASS. Step 5: typecheck + commit.**
```bash
pnpm --filter @tinker/api typecheck
git add apps/api/src/jobs/artifactIndex.ts apps/api/src/jobs/artifactIndex.test.ts
git commit -m "feat(api): classifyArtifact recognizes revisions/<id>/hyperframes paths"
```

---

## Task 2: artifacts route serves revision artifacts

**Files:** `apps/api/src/routes/artifacts.ts`; extend `apps/api/src/server.test.ts` (or `artifacts`-focused test).

- [ ] **Step 1: Failing test** — append to `server.test.ts`. `buildServer`'s store is internal (not exposed), so DON'T try to call the store directly. Instead inject a `runEdit` whose fake **writes a real file and returns the revision artifact** — i.e. use the **real `createComposeRunEdit` with a fake `runAgent`** (it writes `<outputRoot>/revisions/<revId>/hyperframes/index.html` and indexes it). Mirror the existing edit-flow test (`server.test.ts` ~lines 744-793) and `waitForRevision` (~line 1108). Concretely:
```ts
  it("serves a revision artifact when the parent job is completed", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "tinker-api-rev-"));
    let n = 0;
    const runEdit = createComposeRunEdit({
      runAgent: async () => "<<<<<<< SEARCH\nconst D=1.0;\n=======\nconst D=2.0;\n>>>>>>> REPLACE",
    });
    const server = await buildServer({
      config: testConfig(repoRoot),
      runner: <inline completed runner that writes a valid hyperframes/index.html containing "const D=1.0;" + window.__timelines + data-composition-id under outputRoot, resolves a deferred>,
      runEdit,
      idGenerator: () => `id-${++n}`,
    });
    // create + wait for completion (existing pattern), POST /edits, await waitForRevision(server, jobId),
    // then GET the revision's composition-index url from the job snapshot's revisions[0].result.artifacts
    const rev = got.json().revisions[0].result.artifacts.find((a) => a.kind === "composition-index");
    const res = await server.inject({ method: "GET", url: rev.url });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
  });
```
> KEY assertion: the gate now passes for a path registered on `revisions[].result.artifacts` while the parent stays `completed`. (Import `createComposeRunEdit` from `./edit/composeRunEdit.js` — created in Task 4; if executing Task 2 before Task 4, do Task 4's `composeRunEdit` first, or use a hand-written `runEdit` fake that writes the file + returns the artifact.)
- [ ] **Step 2: Run → FAIL** (route only checks `record.result.artifacts`).
- [ ] **Step 3: Implement** — in `routes/artifacts.ts`, replace the gate (lines ~74-79):
```ts
    const inBase = record.result?.artifacts.some((a) => a.relativePath === relativePath) === true;
    const inRevision =
      record.revisions?.some((rev) => rev.result?.artifacts.some((a) => a.relativePath === relativePath)) === true;
    if (record.status !== "completed" || (!inBase && !inRevision)) {
      return reply.status(404).send({ message: "Artifact not found" });
    }
```
- [ ] **Step 4: Run → PASS (full api suite). Step 5: commit.**
```bash
git add apps/api/src/routes/artifacts.ts apps/api/src/server.test.ts
git commit -m "feat(api): artifacts route serves revision artifacts (parent stays completed)"
```

---

## Task 3: `buildEditPrompt` (pure)

**Files:** `apps/api/src/edit/buildEditPrompt.ts` + test.

- [ ] **Step 1: Failing test**:
```ts
import { describe, expect, it } from "vitest";
import { buildEditPrompt } from "./buildEditPrompt.js";

describe("buildEditPrompt", () => {
  it("includes the instruction, clip scope, search/replace format, the contract reminder, and the html", () => {
    const p = buildEditPrompt({
      instruction: "punch in on the modal",
      context: [{ kind: "clip", clipId: "scene-feature", label: "feature", start: 4.2, end: 7.8 }],
      indexHtml: "<html>__MARKER__</html>",
    });
    expect(p).toContain("punch in on the modal");
    expect(p).toContain("feature");
    expect(p).toContain("<<<<<<< SEARCH");
    expect(p).toContain(">>>>>>> REPLACE");
    expect(p).toContain("window.__timelines");
    expect(p).toContain("__MARKER__");
  });
  it("says whole-composition when context is empty", () => {
    expect(buildEditPrompt({ instruction: "x", context: [], indexHtml: "" })).toMatch(/whole composition/i);
  });
});
```
- [ ] **Step 2: FAIL. Step 3: Implement**:
```ts
import type { EditContextRef } from "@tinker/generation-contract";

export function buildEditPrompt(input: { instruction: string; context: EditContextRef[]; indexHtml: string }): string {
  const scope = input.context.length === 0
    ? "Apply the change to the whole composition."
    : "Scope your change to:\n" + input.context.map((c) =>
        c.kind === "clip"
          ? `- clip "${c.label ?? c.clipId ?? "scene"}" (id ${c.clipId ?? "?"}) spanning ${c.start.toFixed(1)}s–${c.end.toFixed(1)}s`
          : `- the time range ${c.start.toFixed(1)}s–${c.end.toFixed(1)}s`,
      ).join("\n");
  return [
    "You are editing an existing animated HTML composition (CSS/SVG + a GSAP timeline registered at window.__timelines, rendered to video).",
    "",
    `User instruction: ${input.instruction}`,
    "",
    scope,
    "",
    "Rules:",
    "- Respond with ONE OR MORE search/replace blocks ONLY. No prose, no explanation.",
    "- Each block MUST be exactly this shape:",
    "<<<<<<< SEARCH",
    "<exact lines to find in index.html, including full leading indentation>",
    "=======",
    "<replacement lines, including full leading indentation>",
    ">>>>>>> REPLACE",
    "- Keep the change minimal and scoped. Do NOT rewrite the whole file.",
    "- The composition MUST still register window.__timelines and keep its data-composition-id root.",
    "- Do NOT create or reference new files (no package.json, node_modules, etc.) and do not read the repository/ folder.",
    "",
    "Current index.html:",
    "```html",
    input.indexHtml,
    "```",
  ].join("\n");
}
```
- [ ] **Step 4: PASS. Step 5: commit.**
```bash
git add apps/api/src/edit/buildEditPrompt.ts apps/api/src/edit/buildEditPrompt.test.ts
git commit -m "feat(api): buildEditPrompt — scoped, search/replace-only edit prompt"
```

---

## Task 4: `createComposeRunEdit` — the RunEdit orchestration (fake agent in CI)

**Files:** `apps/api/src/edit/composeRunEdit.ts` + test.

- [ ] **Step 1: Failing test** (integration with a temp dir + fake agent):
```ts
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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
```
- [ ] **Step 2: FAIL. Step 3: Implement** `composeRunEdit.ts`:
```ts
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ApiGenerationResult } from "@tinker/generation-contract";
import { indexArtifacts } from "../jobs/artifactIndex.js";
import type { RunEdit } from "../workers/editWorker.js";
import { applySearchReplace, parseSearchReplaceBlocks } from "./searchReplace.js";
import { lintComposition } from "./compositionLint.js";
import { buildEditPrompt } from "./buildEditPrompt.js";

/** Runs the edit agent for `prompt`, returning its raw text output (search/replace blocks). */
export type RunAgent = (prompt: string, options: { logDir: string }) => Promise<string>;

async function listFiles(dir: string, root = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".")) continue; // skip agent log dotfiles (.tinker-opencode-*) so they aren't indexed as artifacts
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(full, root)));
    else out.push(full);
  }
  return out;
}

export function createComposeRunEdit(deps: { runAgent: RunAgent }): RunEdit {
  return async (record, edit): Promise<ApiGenerationResult> => {
    const currentDir = record.currentRevisionId
      ? join(record.outputRoot, "revisions", record.currentRevisionId, "hyperframes")
      : join(record.outputRoot, "hyperframes");
    const revDir = join(record.outputRoot, "revisions", edit.revId, "hyperframes");
    await mkdir(revDir, { recursive: true });
    await cp(currentDir, revDir, { recursive: true });

    const indexPath = join(revDir, "index.html");
    const indexHtml = await readFile(indexPath, "utf8");

    const prompt = buildEditPrompt({ instruction: edit.instruction, context: edit.context, indexHtml });
    const agentText = await deps.runAgent(prompt, { logDir: revDir });

    const blocks = parseSearchReplaceBlocks(agentText);
    if (blocks.length === 0) throw new Error("The edit agent returned no search/replace blocks");
    const applied = applySearchReplace(indexHtml, blocks);
    if (!applied.ok) throw new Error(applied.error);
    const lint = lintComposition(applied.result);
    if (!lint.ok) throw new Error(`Edit failed validation: ${lint.issues.join("; ")}`);

    await writeFile(indexPath, applied.result, "utf8");
    const files = await listFiles(revDir);
    return { artifacts: indexArtifacts({ jobId: record.id, outputRoot: record.outputRoot, artifactPaths: files }) };
  };
}
```
- [ ] **Step 4: Run → PASS (3 tests). Step 5: typecheck + commit.**
```bash
git add apps/api/src/edit/composeRunEdit.ts apps/api/src/edit/composeRunEdit.test.ts
git commit -m "feat(api): composeRunEdit — agent->search/replace->apply->lint->revision artifacts"
```

---

## Task 5: live agent wiring in `main.ts` (agent-gated; typecheck only)

**Files:** `apps/api/src/edit/runAgent.ts` (create); `apps/api/src/main.ts`.

- [ ] **Step 1: Implement** `apps/api/src/edit/runAgent.ts`:
```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultRunOpencode } from "@tinker/demo-assembly";
import type { RunAgent } from "./composeRunEdit.js";

/**
 * Real edit-agent runner. defaultRunOpencode sandboxes a `cwd` (copied into a read-only
 * repository/) and returns the agent's text output. A composition edit ignores the repo,
 * so cwd is a throwaway dir and repoCheckoutDirectory is omitted; logDir collects logs.
 */
export function createDefaultRunAgent(): RunAgent {
  return async (prompt, options) => {
    const cwd = await mkdtemp(join(tmpdir(), "tinker-edit-agent-"));
    return defaultRunOpencode(prompt, { cwd, logDir: options.logDir });
  };
}
```
- [ ] **Step 2: Wire `main.ts`:**
```ts
import { readConfig } from "./config.js";
import { buildServer } from "./server.js";
import { createComposeRunEdit } from "./edit/composeRunEdit.js";
import { createDefaultRunAgent } from "./edit/runAgent.js";

const config = readConfig();
const runEdit = createComposeRunEdit({ runAgent: createDefaultRunAgent() });
const server = await buildServer({ config, runEdit });
await server.listen({ host: config.host, port: config.port });
console.info(`Tinker API listening at http://${config.host}:${config.port}`);
```
- [ ] **Step 3: Verify `defaultRunOpencode`'s real signature** by reading `packages/demo-assembly/src/hyperframesPlanning.ts` — confirm it is `(prompt, { cwd, logDir, repoCheckoutDirectory? }) => Promise<string>`. If the option names differ, adapt `runAgent.ts` to the real names. Do NOT run the live agent in CI.
- [ ] **Step 4: typecheck both packages + run full api suite (the live path is not exercised by tests).**
```bash
pnpm --filter @tinker/api typecheck && pnpm --filter @tinker/api test
git add apps/api/src/edit/runAgent.ts apps/api/src/main.ts
git commit -m "feat(api): wire the live claude edit agent (defaultRunOpencode) in main.ts"
```

---

## Self-Review (plan author)

**Spec coverage (3b-4):** revision-path artifact classification (T1) + serving with parent
staying `completed` (T2); scoped search/replace-only `buildEditPrompt` with the full-
indentation instruction the 3b-2 reviewer asked for (T3); the real `RunEdit` composing
agent→parse→fuzzy-apply→lint→write→index, behind a CI fake `RunAgent` (T4); live
`defaultRunOpencode` wiring (T5, agent-gated). Render is deferred (3c handles export).

**Placeholder scan:** T2's test is described (the implementer wires it against real
helpers) rather than fully literal — flagged inline; everything else is complete code.

**Type consistency:** `RunAgent`, `RunEdit` (from 3b-1's `editWorker.ts`), `ApiGenerationResult`,
`EditContextRef`, and the 3b-2 `parseSearchReplaceBlocks`/`applySearchReplace`/`lintComposition`
signatures line up across T1–T5.

**Decisions / out of scope:** no in-worker self-repair retry in v1 (apply/lint failure →
revision fails → user **Reprompts**, matching the UX); no render here (3c); the agent's
indentation discipline is enforced via the prompt (the fuzzy matcher tolerates drift but
can de-indent — 3c/manual smoke will confirm acceptable output).
