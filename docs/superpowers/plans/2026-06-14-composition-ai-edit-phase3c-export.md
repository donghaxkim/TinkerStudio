# Phase 3c — Export (render-on-demand + download) — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Make the Export button real: download the current composition's rendered
`output-video`. The generated base composition already has one; **edited revisions are
rendered on demand** (render was deferred in 3b) via a `RunRender` seam (fake in CI),
then downloaded.

**Architecture:** Server: `POST /api/jobs/:id/revisions/:revId/render` sets a
`pendingRender` on the record and enqueues; the queue dispatch runs a render worker
(`RunRender` seam) that renders the revision dir, re-indexes its artifacts (now with
`output-video`), and updates the revision's result. Web: the Export button downloads
`output-video` if present; otherwise it requests a render, polls until the video
appears, then downloads.

**Tech stack:** TS strict, Fastify, Vitest (+jsdom). Spec: `…phase3-real-pipeline.md` (3c).

---

## File Structure
**Modify:** `apps/api/src/jobs/jobStore.ts`, `apps/api/src/workers/editWorker.ts` (or a new `renderWorker.ts`), `apps/api/src/server.ts`, `apps/api/src/routes/jobs.ts`, `apps/api/src/edit/runAgent.ts`-sibling `renderRevision.ts`, `apps/api/src/main.ts`; web `apps/web/src/lib/httpCompositionEditClient.ts` (add `requestRender`) or a small render client; `apps/web/src/screens/CompositionEditor/CompositionEditorScreen.tsx` (+test).

---

## Task 1: server — `pendingRender` + store update + render worker (fake seam)

**Files:** `apps/api/src/jobs/jobStore.ts`; new `apps/api/src/workers/renderWorker.ts` (+test); `apps/api/src/server.ts`.

- [ ] **Step 1: Failing test** `renderWorker.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { createRenderWorker, type RunRender } from "./renderWorker.js";
import { createJobStore } from "../jobs/jobStore.js";

const REQ = { mode: "ai-url-planning" as const, repoUrl: "https://github.com/a/b", productUrl: "https://a.com", durationCapSeconds: 60, aspectRatio: "16:9" as const, renderer: "hyperframes" as const };
function seeded() {
  const store = createJobStore();
  store.create({ id: "j", request: REQ, outputRoot: "/tmp/j", now: "2026-06-14T00:00:00.000Z" });
  store.complete("j", { artifacts: [] }, "2026-06-14T00:00:00.000Z");
  store.appendRevision("j", { id: "rev-1", status: "completed", createdAt: "2026-06-14T00:00:00.000Z", result: { artifacts: [
    { kind: "composition-index", relativePath: "revisions/rev-1/hyperframes/index.html", url: "/api/jobs/j/artifacts/revisions/rev-1/hyperframes/index.html", mediaType: "text/html" },
  ] } }, "2026-06-14T00:00:00.000Z");
  store.setPendingRender("j", { revId: "rev-1" });
  return store;
}

describe("renderWorker", () => {
  it("renders the revision and adds an output-video artifact to it", async () => {
    const store = seeded();
    const runRender: RunRender = vi.fn(async () => ({ artifacts: [
      { kind: "composition-index", relativePath: "revisions/rev-1/hyperframes/index.html", url: "/u/i", mediaType: "text/html" },
      { kind: "output-video", relativePath: "revisions/rev-1/hyperframes/output.mp4", url: "/u/v", mediaType: "video/mp4" },
    ] }));
    await createRenderWorker({ store, runRender, now: () => "2026-06-14T00:00:01.000Z" })("j");
    const rev = store.getSnapshot("j")!.revisions!.find((r) => r.id === "rev-1")!;
    expect(rev.result!.artifacts.some((a) => a.kind === "output-video")).toBe(true);
    expect(store.getRecord("j")?.pendingRender).toBeUndefined();
    expect(runRender).toHaveBeenCalledOnce();
  });
  it("is a no-op without pendingRender", async () => {
    const store = createJobStore();
    store.create({ id: "j", request: REQ, outputRoot: "/tmp/j", now: "2026-06-14T00:00:00.000Z" });
    const runRender = vi.fn();
    await createRenderWorker({ store, runRender: runRender as unknown as RunRender, now: () => "t" })("j");
    expect(runRender).not.toHaveBeenCalled();
  });
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.** In `jobStore.ts`: add `export type PendingRender = { revId: string };`; add `pendingRender?: PendingRender;` to `JobRecord`; STRIP `pendingRender` in `snapshot`/`hasValidSnapshotDatetime` (alongside `outputRoot`/`pendingEdit`); add methods:
```ts
    setPendingRender(id: string, render: PendingRender) {
      const record = records.get(id);
      if (record === undefined) return;
      record.pendingRender = render;
    },
    setRevisionResult(id: string, revId: string, result: ApiGenerationResult, now: string) {
      const record = records.get(id);
      if (record === undefined) return;
      record.revisions = (record.revisions ?? []).map((r) => (r.id === revId ? { ...r, status: "completed", result } : r));
      delete record.pendingRender;
      record.updatedAt = now;
    },
```
Create `apps/api/src/workers/renderWorker.ts`:
```ts
import type { ApiGenerationResult } from "@tinker/generation-contract";
import type { JobRecord, JobStore, PendingRender } from "../jobs/jobStore.js";

/** Render a revision's composition to mp4 and return its re-indexed artifacts (incl. output-video). */
export type RunRender = (record: JobRecord, render: PendingRender) => Promise<ApiGenerationResult>;

export type RenderWorkerOptions = { store: JobStore; runRender: RunRender; now?: () => string };

export function createRenderWorker(options: RenderWorkerOptions) {
  const now = options.now ?? (() => new Date().toISOString());
  return async (id: string): Promise<void> => {
    const record = options.store.getRecord(id);
    const render = record?.pendingRender;
    if (record === undefined || render === undefined) return;
    try {
      const result = await options.runRender(record, render);
      options.store.setRevisionResult(id, render.revId, result, now());
    } catch {
      // leave the revision unrendered (no output-video); clear pendingRender so it isn't retried forever
      options.store.setRevisionResult(id, render.revId, record.revisions?.find((r) => r.id === render.revId)?.result ?? { artifacts: [] }, now());
    }
  };
}
```
In `server.ts`: add `runRender?: RunRender;` to `BuildServerOptions`; build the render worker; extend `runJob` dispatch: `if (record?.pendingEdit && editWorker) return editWorker(id); if (record?.pendingRender && renderWorker) return renderWorker(id); return generationWorker(id);`.
- [ ] **Step 4: PASS + full api suite. Step 5: typecheck + commit.**
```bash
git add apps/api/src/jobs/jobStore.ts apps/api/src/workers/renderWorker.ts apps/api/src/workers/renderWorker.test.ts apps/api/src/server.ts
git commit -m "feat(api): render worker + jobStore pendingRender/setRevisionResult (RunRender seam)"
```

---

## Task 2: server — `POST /api/jobs/:id/revisions/:revId/render` route + real RunRender wiring

**Files:** `apps/api/src/routes/jobs.ts`; new `apps/api/src/edit/renderRevision.ts`; `apps/api/src/main.ts`; extend `server.test.ts`.

- [ ] **Step 1: Failing test** — append to `server.test.ts`: with an injected `runRender` fake + a job carrying a completed revision (drive via an edit, like 3b-4's serving test), `POST /api/jobs/:id/revisions/:revId/render` → 202; after `waitForRevision`-style poll the revision gains an `output-video` artifact; unknown job/revision → 404. Reuse real helpers; adapt.
- [ ] **Step 2: FAIL. Step 3: Implement** the route in `routes/jobs.ts` (add `revIdRender` after the `/edits` route):
```ts
  server.post<{ Params: { id: string; revId: string } }>("/api/jobs/:id/revisions/:revId/render", async (request, reply) => {
    const job = options.store.getRecord(request.params.id);
    if (job === undefined) return reply.status(404).send({ message: "Job not found" });
    if (!(job.revisions ?? []).some((r) => r.id === request.params.revId)) {
      return reply.status(404).send({ message: "Revision not found" });
    }
    if (!options.queue.hasCapacity()) return reply.status(429).send({ message: "Generation queue is full" });
    options.store.setPendingRender(request.params.id, { revId: request.params.revId });
    if (!options.queue.enqueue(request.params.id)) return reply.status(429).send({ message: "Generation queue is full" });
    return reply.status(202).send(options.store.getSnapshot(request.params.id));
  });
```
Create `apps/api/src/edit/renderRevision.ts` (the real `RunRender`, render not agent — uses `runHyperframesRender`):
```ts
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { runHyperframesRender } from "@tinker/demo-assembly";
import { indexArtifacts } from "../jobs/artifactIndex.js";
import type { RunRender } from "../workers/renderWorker.js";

export function createDefaultRunRender(): RunRender {
  return async (record, render) => {
    const revDir = join(record.outputRoot, "revisions", render.revId, "hyperframes");
    await runHyperframesRender({ hyperframesDir: revDir, outputVideoPath: join(revDir, "output.mp4") });
    const files = await listFiles(revDir);
    return { artifacts: indexArtifacts({ jobId: record.id, outputRoot: record.outputRoot, artifactPaths: files }) };
  };
}
async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) { if (e.name.startsWith(".")) continue; const f = join(dir, e.name); if (e.isDirectory()) out.push(...(await listFiles(f))); else out.push(f); }
  return out;
}
```
Wire `main.ts`: `import { createDefaultRunRender } from "./edit/renderRevision.js";` and pass `runRender: createDefaultRunRender()` to `buildServer`. Confirm `runHyperframesRender`'s signature (`{ hyperframesDir, outputVideoPath }`) against `packages/demo-assembly/src/hyperframesRender.ts`.
- [ ] **Step 4: PASS (full api suite) + typecheck. Step 5: commit.**
```bash
git add apps/api/src/routes/jobs.ts apps/api/src/edit/renderRevision.ts apps/api/src/main.ts apps/api/src/server.test.ts
git commit -m "feat(api): POST /revisions/:revId/render + live runHyperframesRender wiring"
```

---

## Task 3: web — Export button (download, render-on-demand)

**Files:** `apps/web/src/lib/httpCompositionEditClient.ts` (add a `requestRender` export, OR a tiny `compositionExport.ts`); `apps/web/src/screens/CompositionEditor/CompositionEditorScreen.tsx` (+test).

Minimal, deterministic web piece: the Export button **downloads the current composition's
`output-video`** when one exists (the base generated composition always has one). Wire it
to `window.open(url)`.

- [ ] **Step 1: Failing test** — append to `CompositionEditorScreen.test.tsx`:
```ts
  it("Export downloads the composition's output video when available", async () => {
    const handle = fakeHandle(() => undefined);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<CompositionEditorScreen compositionIndexUrl={INDEX} outputVideoUrl={VIDEO} resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: handle } })} />);
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("composition-timeline")).toBeInTheDocument());
    const exportBtn = screen.getByRole("button", { name: "Export" });
    expect(exportBtn).not.toBeDisabled();
    fireEvent.click(exportBtn);
    expect(open).toHaveBeenCalledWith(VIDEO, "_blank");
    open.mockRestore();
  });
```
> This changes the Export button from the 2a disabled stub to enabled-when-a-video-URL-exists. The current composition video = `edit.currentVideoUrl ?? outputVideoUrl`. (Render-on-demand for unrendered edits — calling the Task 2 endpoint then polling — can be layered on after; for this task, Export is enabled only when a video URL is present, and disabled with a tooltip otherwise.)
- [ ] **Step 2: FAIL** (Export is currently `disabled`).
- [ ] **Step 3: Implement** in `CompositionEditorScreen.tsx`: compute `const exportVideoUrl = edit.currentVideoUrl ?? outputVideoUrl;` and change the Export button to `disabled={exportVideoUrl === undefined}` with `onClick={() => exportVideoUrl && window.open(exportVideoUrl, "_blank")}` and a `title` reflecting state ("Export" when available, "Render the edit to export" when not).
- [ ] **Step 4: Run screen tests + full web suite + typecheck.** Existing tests that asserted Export is disabled (the 2a shell test asserted `getByRole("button",{name:"Export"})` is in the doc — confirm whether any asserts `toBeDisabled`; if the base composition test passes an `outputVideoUrl` the button is now enabled — update that assertion if present).
- [ ] **Step 5: commit.**
```bash
git add apps/web/src/screens/CompositionEditor/CompositionEditorScreen.tsx apps/web/src/screens/CompositionEditor/CompositionEditorScreen.test.tsx
git commit -m "feat(web): Export downloads the current composition's output video"
```

---

## Self-Review (plan author)

**Spec coverage (3c):** render-on-demand (server Tasks 1-2: `pendingRender` + render
worker + `/render` route + live `runHyperframesRender`) and Export download (web Task 3).
The base generated composition exports immediately; edited revisions can be rendered then
exported. All server logic is CI-tested behind a `RunRender` fake; the live render is
typecheck-only (slow + needs the hyperframes package, like generation).

**Type consistency:** `RunRender`, `PendingRender`, `setRevisionResult`,
`ApiGenerationResult` align across Tasks 1-2. The web Export uses the existing
`edit.currentVideoUrl`/`outputVideoUrl` — no new interface.

**Known v1 limitation (documented):** Task 3 enables Export only when a video URL exists;
fully wiring the web "request render → poll → download" for unrendered edits is a thin
follow-up over the Task 2 endpoint (the server support is built here). The 2a Export
disabled-stub test must be updated to the new enabled-when-available behaviour.
