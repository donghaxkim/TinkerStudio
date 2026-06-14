# Phase 3b-1 — Revisions schema + store + `POST /edits` endpoint — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** The server-side foundation for AI edits: a `revisions`/`currentRevisionId`
model on the job, `jobStore` revision methods, and a `POST /api/jobs/:id/edits`
endpoint that enqueues an edit run dispatched to an **injected `runEdit` seam** — all
CI-testable with a fake (no agent, no render).

**Architecture:** An edit is a **revision on the existing job**, not a new job. The
endpoint stashes a `pendingEdit` on the job record and re-enqueues the job id; the
queue's `runJob` dispatches to the edit worker when `pendingEdit` is set (else
generation). The edit worker calls the injected `runEdit(record, pendingEdit)` and
`appendRevision`/`failRevision`. The **parent job stays `completed`** throughout
(load-bearing: `routes/artifacts.ts` serves files only when `status==="completed"`).
`pendingEdit` is a record-only field stripped before the `.strict()` schema parse.

**Tech stack:** TypeScript (strict), Fastify, Zod, Vitest. Spec:
`docs/superpowers/specs/2026-06-14-composition-ai-edit-phase3-real-pipeline.md` (3b-1).

---

## File Structure

**Modify:**
- `packages/generation-contract/src/apiJob.ts` — `ApiRevisionSchema`, `revisions?`/`currentRevisionId?` on the job.
- `packages/generation-contract/src/editRequest.ts` *(create)* — `EditContextRefSchema` + `EditCompositionRequestBodySchema`.
- `packages/generation-contract/src/index.ts` — export the new symbols.
- `apps/api/src/jobs/jobStore.ts` — record fields + snapshot stripping + revision methods.
- `apps/api/src/workers/editWorker.ts` *(create)* — the edit worker behind a `RunEdit` seam.
- `apps/api/src/server.ts` — `runEdit` option; `runJob` dispatch by `pendingEdit`.
- `apps/api/src/routes/jobs.ts` — `POST /api/jobs/:id/edits`.

**Test:** co-located `*.test.ts` + extend `apps/api/src/server.test.ts`.

**Commands:** `pnpm --filter @tinker/generation-contract test|typecheck`,
`pnpm --filter @tinker/api test|typecheck`.

---

## Task 1: `ApiRevision` schema + job fields + edit request body

**Files:** `packages/generation-contract/src/apiJob.ts`, new
`packages/generation-contract/src/editRequest.ts`, `index.ts`; tests
`apiJob.test.ts` (extend) + `editRequest.test.ts` (create).

- [ ] **Step 1: Failing tests.** Create `packages/generation-contract/src/editRequest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EditCompositionRequestBodySchema } from "./editRequest.js";

describe("EditCompositionRequestBodySchema", () => {
  it("accepts an instruction with range + clip context", () => {
    const r = EditCompositionRequestBodySchema.safeParse({
      instruction: "punch in on the modal",
      context: [
        { kind: "range", start: 4.2, end: 7.8 },
        { kind: "clip", clipId: "scene-feature", label: "feature", start: 4.2, end: 7.8 },
      ],
    });
    expect(r.success).toBe(true);
  });
  it("accepts an empty context (whole-composition edit)", () => {
    expect(EditCompositionRequestBodySchema.safeParse({ instruction: "brighter", context: [] }).success).toBe(true);
  });
  it("rejects an empty instruction and unknown keys", () => {
    expect(EditCompositionRequestBodySchema.safeParse({ instruction: "", context: [] }).success).toBe(false);
    expect(EditCompositionRequestBodySchema.safeParse({ instruction: "x", context: [], extra: 1 }).success).toBe(false);
  });
});
```

Append to `packages/generation-contract/src/apiJob.test.ts` (create the file if absent; mirror existing schema tests):

```ts
import { describe, expect, it } from "vitest";
import { ApiGenerationJobSchema, ApiRevisionSchema } from "./apiJob.js";

const baseJob = {
  id: "job-1", status: "completed" as const,
  request: { id: "job-1", mode: "ai-url-planning", repoUrl: "https://github.com/a/b", productUrl: "https://a.com", durationCapSeconds: 60, aspectRatio: "16:9", renderer: "hyperframes" },
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  progressEvents: [], result: { artifacts: [] },
};

describe("ApiRevisionSchema", () => {
  it("requires result when completed, error when failed", () => {
    expect(ApiRevisionSchema.safeParse({ id: "rev-1", status: "completed", createdAt: "2026-01-01T00:00:00.000Z", result: { artifacts: [] } }).success).toBe(true);
    expect(ApiRevisionSchema.safeParse({ id: "rev-1", status: "completed", createdAt: "2026-01-01T00:00:00.000Z" }).success).toBe(false);
    expect(ApiRevisionSchema.safeParse({ id: "rev-1", status: "failed", createdAt: "2026-01-01T00:00:00.000Z", error: { status: "failed", stage: "edit", message: "boom" } }).success).toBe(true);
  });
});

describe("ApiGenerationJobSchema with revisions", () => {
  it("accepts a completed job carrying revisions + currentRevisionId", () => {
    expect(ApiGenerationJobSchema.safeParse({
      ...baseJob, currentRevisionId: "rev-1",
      revisions: [{ id: "rev-1", status: "completed", createdAt: "2026-01-01T00:00:00.000Z", result: { artifacts: [] } }],
    }).success).toBe(true);
  });
  it("still accepts a job with no revisions (back-compat)", () => {
    expect(ApiGenerationJobSchema.safeParse(baseJob).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`ApiRevisionSchema`/`EditCompositionRequestBodySchema` missing).
`pnpm --filter @tinker/generation-contract exec vitest run src/editRequest.test.ts src/apiJob.test.ts`

- [ ] **Step 3: Implement.** Create `packages/generation-contract/src/editRequest.ts`:

```ts
import { z } from "zod";

export const EditContextRefSchema = z
  .object({
    kind: z.enum(["range", "clip"]),
    start: z.number(),
    end: z.number(),
    clipId: z.string().min(1).optional(),
    label: z.string().min(1).optional(),
  })
  .strict();

export const EditCompositionRequestBodySchema = z
  .object({
    instruction: z.string().min(1),
    context: z.array(EditContextRefSchema),
  })
  .strict();

export type EditContextRef = z.infer<typeof EditContextRefSchema>;
export type EditCompositionRequestBody = z.infer<typeof EditCompositionRequestBodySchema>;
```

In `apiJob.ts`, add `ApiRevisionSchema` (after `ApiGenerationResultSchema`) and the two optional fields on the job object (before `.strict()`):

```ts
export const ApiRevisionSchema = z
  .object({
    id: z.string().min(1),
    status: ApiGenerationJobStatusSchema,
    createdAt: z.string().datetime(),
    result: ApiGenerationResultSchema.optional(),
    error: GenerationErrorSchema.optional(),
  })
  .strict()
  .superRefine((rev, ctx) => {
    if (rev.status === "completed" && rev.result === undefined) {
      ctx.addIssue({ code: "custom", path: ["result"], message: "completed revisions require a result" });
    }
    if (rev.status === "failed" && rev.error === undefined) {
      ctx.addIssue({ code: "custom", path: ["error"], message: "failed revisions require an error" });
    }
  });

export type ApiRevision = z.infer<typeof ApiRevisionSchema>;
```

Add to the `ApiGenerationJobSchema` object (before `.strict()`):
```ts
    revisions: z.array(ApiRevisionSchema).optional(),
    currentRevisionId: z.string().min(1).optional(),
```

> Note: `ApiGenerationJobStatusSchema` is declared *after* `ApiGenerationResultSchema`
> but *before* the job schema today — move the `ApiRevisionSchema` block to AFTER
> `ApiGenerationJobStatusSchema` (line ~59) so the status enum is defined. Keep
> `ApiRevisionSchema`'s `superRefine` lenient (no "result only when completed" rule —
> a revision may briefly be non-terminal in 3b-4).

Export from `index.ts`: add `export * from "./editRequest.js";` and add
`ApiRevisionSchema`, `ApiRevision` to the `apiJob` exports (match the existing export style).

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Typecheck + commit.**
```bash
pnpm --filter @tinker/generation-contract typecheck
git add packages/generation-contract/src/editRequest.ts packages/generation-contract/src/apiJob.ts packages/generation-contract/src/index.ts packages/generation-contract/src/editRequest.test.ts packages/generation-contract/src/apiJob.test.ts
git commit -m "feat(generation-contract): ApiRevision + job revisions/currentRevisionId + edit request schema"
```

---

## Task 2: `jobStore` revision methods + `pendingEdit` (stripped from snapshot)

**Files:** `apps/api/src/jobs/jobStore.ts`; test `apps/api/src/jobs/jobStore.test.ts` (create/extend).

- [ ] **Step 1: Failing test** `jobStore.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createJobStore } from "./jobStore.js";

const REQ = { mode: "ai-url-planning" as const, repoUrl: "https://github.com/a/b", productUrl: "https://a.com", durationCapSeconds: 60, aspectRatio: "16:9" as const, renderer: "hyperframes" as const };
function completed(store: ReturnType<typeof createJobStore>) {
  store.create({ id: "j", request: REQ, outputRoot: "/tmp/j", now: "2026-01-01T00:00:00.000Z" });
  store.complete("j", { artifacts: [] }, "2026-01-01T00:00:01.000Z");
}

describe("jobStore revisions", () => {
  it("setPendingEdit then appendRevision adds a completed revision + sets currentRevisionId, and snapshot stays valid", () => {
    const store = createJobStore();
    completed(store);
    store.setPendingEdit("j", { revId: "rev-1", instruction: "x", context: [] });
    expect(store.getRecord("j")?.pendingEdit?.revId).toBe("rev-1");
    store.appendRevision("j", { id: "rev-1", status: "completed", createdAt: "2026-01-01T00:00:02.000Z", result: { artifacts: [] } }, "2026-01-01T00:00:02.000Z");
    const snap = store.getSnapshot("j")!;
    expect(snap.status).toBe("completed");           // parent stays completed
    expect(snap.currentRevisionId).toBe("rev-1");
    expect(snap.revisions?.[0]?.id).toBe("rev-1");
    expect(store.getRecord("j")?.pendingEdit).toBeUndefined(); // cleared on append
    expect("pendingEdit" in (snap as object)).toBe(false);     // record-only, stripped
  });

  it("failRevision records a failed revision without flipping the parent status", () => {
    const store = createJobStore();
    completed(store);
    store.setPendingEdit("j", { revId: "rev-1", instruction: "x", context: [] });
    store.failRevision("j", "rev-1", { status: "failed", stage: "edit", message: "boom" }, "2026-01-01T00:00:03.000Z");
    const snap = store.getSnapshot("j")!;
    expect(snap.status).toBe("completed");
    expect(snap.revisions?.[0]).toMatchObject({ id: "rev-1", status: "failed" });
  });
});
```

- [ ] **Step 2: Run → FAIL.** `pnpm --filter @tinker/api exec vitest run src/jobs/jobStore.test.ts`

- [ ] **Step 3: Implement.** In `jobStore.ts`:

Extend imports + `JobRecord`:
```ts
import {
  ApiGenerationJobSchema,
  type AiUrlPlanningCreateDemoRequest, type ApiGenerationJob, type ApiGenerationJobStatus,
  type ApiGenerationResult, type ApiRevision, type EditContextRef, type GenerationError,
  type ManualFixtureProgressEvent,
} from "@tinker/generation-contract";

export type PendingEdit = { revId: string; instruction: string; context: EditContextRef[] };

export type JobRecord = Omit<ApiGenerationJob, "request"> & {
  request: AiUrlPlanningCreateDemoRequest & { id: string };
  outputRoot: string;
  pendingEdit?: PendingEdit; // record-only; stripped before snapshot parse
};
```

Strip `pendingEdit` (and `outputRoot`) in BOTH `snapshot` and `hasValidSnapshotDatetime`:
```ts
function snapshot(record: JobRecord): ApiGenerationJob {
  const { outputRoot: _o, pendingEdit: _p, ...job } = record;
  return ApiGenerationJobSchema.parse(job);
}
function hasValidSnapshotDatetime(record: JobRecord, updatedAt: string) {
  const { outputRoot: _o, pendingEdit: _p, ...job } = { ...record, updatedAt };
  return ApiGenerationJobSchema.safeParse(job).success;
}
```

Add three methods to the returned store object:
```ts
    setPendingEdit(id: string, edit: PendingEdit) {
      const record = records.get(id);
      if (record === undefined) return;
      record.pendingEdit = edit;
    },

    appendRevision(id: string, revision: ApiRevision, now: string) {
      const record = records.get(id);
      if (record === undefined) return;
      record.revisions = [...(record.revisions ?? []), revision];
      record.currentRevisionId = revision.id;
      delete record.pendingEdit;
      record.updatedAt = now;
      // parent job status is intentionally left unchanged (stays "completed")
    },

    failRevision(id: string, revId: string, error: GenerationError, now: string) {
      const record = records.get(id);
      if (record === undefined) return;
      const failed: ApiRevision = { id: revId, status: "failed", createdAt: now, error };
      record.revisions = [...(record.revisions ?? []), failed];
      delete record.pendingEdit;
      record.updatedAt = now;
    },
```

- [ ] **Step 4: Run → PASS. Step 5: typecheck + commit.**
```bash
pnpm --filter @tinker/api typecheck
git add apps/api/src/jobs/jobStore.ts apps/api/src/jobs/jobStore.test.ts
git commit -m "feat(api): jobStore revision methods + pendingEdit (stripped from snapshot)"
```

---

## Task 3: edit worker behind a `RunEdit` seam + queue dispatch + `buildServer` option

**Files:** new `apps/api/src/workers/editWorker.ts` + test; `apps/api/src/server.ts`.

The worker is composition-agnostic in 3b-1: given a record with `pendingEdit`, it calls
the injected `runEdit` (which in 3b-4 runs the real agent; here a fake) to produce the
new revision's `ApiArtifact[]`, then `appendRevision`. On throw → `failRevision`.

- [ ] **Step 1: Failing test** `editWorker.test.ts`:

```ts
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
    const runEdit: RunEdit = vi.fn(async () => ({ artifacts: [{ kind: "composition-index", relativePath: "revisions/rev-1/hyperframes/index.html", url: "/api/jobs/j/artifacts/revisions/rev-1/hyperframes/index.html", mediaType: "text/html" }] }));
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
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** `apps/api/src/workers/editWorker.ts`:

```ts
import type { ApiGenerationResult } from "@tinker/generation-contract";
import type { JobRecord, JobStore, PendingEdit } from "../jobs/jobStore.js";

/** Produce the new revision's result (artifacts) for a pending edit. Real impl (3b-4) runs the agent. */
export type RunEdit = (record: JobRecord, edit: PendingEdit) => Promise<ApiGenerationResult>;

export type EditWorkerOptions = { store: JobStore; runEdit: RunEdit; now?: () => string };

export function createEditWorker(options: EditWorkerOptions) {
  const now = options.now ?? (() => new Date().toISOString());
  return async (id: string): Promise<void> => {
    const record = options.store.getRecord(id);
    const edit = record?.pendingEdit;
    if (record === undefined || edit === undefined) return;
    try {
      const result = await options.runEdit(record, edit);
      options.store.appendRevision(id, { id: edit.revId, status: "completed", createdAt: now(), result }, now());
    } catch (err) {
      options.store.failRevision(id, edit.revId, { status: "failed", stage: "edit", message: err instanceof Error ? err.message : String(err) }, now());
    }
  };
}
```

> `JobStore`/`PendingEdit` must be exported from `jobStore.ts` (`JobStore` already is;
> export `PendingEdit` and `JobRecord` — `JobRecord` is already exported).

In `server.ts`, add the seam + dispatch:
```ts
import { createEditWorker, type RunEdit } from "./workers/editWorker.js";
// BuildServerOptions += :
  runEdit?: RunEdit;
// after building store + generation worker:
  const generationWorker = createGenerationWorker({ store, runner: options.runner, now });
  const editWorker = options.runEdit ? createEditWorker({ store, runEdit: options.runEdit, now }) : undefined;
  const runJob = async (id: string) => {
    const record = store.getRecord(id);
    if (record?.pendingEdit && editWorker) return editWorker(id);
    return generationWorker(id);
  };
  const queue = createJobQueue({ maxPendingJobs: options.maxPendingJobs ?? 10, runJob });
```
(Rename the local `worker` → `generationWorker`; pass `runJob` to the queue.)

- [ ] **Step 4: Run → PASS. Step 5: typecheck + commit.**
```bash
git add apps/api/src/workers/editWorker.ts apps/api/src/workers/editWorker.test.ts apps/api/src/server.ts
git commit -m "feat(api): edit worker behind RunEdit seam + queue dispatch by pendingEdit"
```

---

## Task 4: `POST /api/jobs/:id/edits` route

**Files:** `apps/api/src/routes/jobs.ts`; extend `apps/api/src/server.test.ts`.

- [ ] **Step 1: Failing test** — append to `server.test.ts` (it already builds the server with an injected `runner` + uses `server.inject`; add an injected `runEdit` fake):

```ts
  it("POST /api/jobs/:id/edits enqueues an edit and appends a revision", async () => {
    const runEdit = async () => ({ artifacts: [{ kind: "composition-index" as const, relativePath: "revisions/rev/hyperframes/index.html", url: "/api/jobs/x/artifacts/revisions/rev/hyperframes/index.html", mediaType: "text/html" }] });
    const server = await buildServer({ config: testConfig, runner: fakeCompletedRunner, runEdit, now: () => "2026-01-01T00:00:00.000Z", idGenerator: makeSeqIdGen() });
    // create + complete a job first (drive the generation path as existing tests do), then:
    const created = await server.inject({ method: "POST", url: "/api/jobs", payload: { repoUrl: "https://github.com/a/b", productUrl: "https://a.com", durationCapSeconds: 60, aspectRatio: "16:9" } });
    const jobId = created.json().id;
    await flushQueue(); // existing helper / await the worker microtask
    const edit = await server.inject({ method: "POST", url: `/api/jobs/${jobId}/edits`, payload: { instruction: "punch in", context: [] } });
    expect(edit.statusCode).toBe(202);
    await flushQueue();
    const got = await server.inject({ method: "GET", url: `/api/jobs/${jobId}` });
    expect(got.json().revisions?.[0]?.status).toBe("completed");
  });

  it("POST /edits → 404 for unknown job, 422 for bad body", async () => {
    const server = await buildServer({ config: testConfig, runEdit: async () => ({ artifacts: [] }) });
    expect((await server.inject({ method: "POST", url: "/api/jobs/nope/edits", payload: { instruction: "x", context: [] } })).statusCode).toBe(404);
    const created = await server.inject({ method: "POST", url: "/api/jobs", payload: { repoUrl: "https://github.com/a/b", productUrl: "https://a.com", durationCapSeconds: 60, aspectRatio: "16:9" } });
    expect((await server.inject({ method: "POST", url: `/api/jobs/${created.json().id}/edits`, payload: { instruction: "", context: [] } })).statusCode).toBe(422);
  });
```

> Reuse the file's existing `testConfig`, runner fakes, id generator, and queue-flush
> helper. If a completed-job fake runner / flush helper isn't present, add a minimal one
> mirroring the existing generation tests. The edit route does not require the job to be
> `completed` first (it stashes `pendingEdit` regardless); the happy-path test drives a
> completed job for realism.

- [ ] **Step 2: Run → FAIL.** `pnpm --filter @tinker/api exec vitest run src/server.test.ts`

- [ ] **Step 3: Implement** in `routes/jobs.ts`. Add to imports:
`import { EditCompositionRequestBodySchema, type EditContextRef } from "@tinker/generation-contract";`
Add a `revIdGenerator` to `JobsRoutesOptions` (default in `server.ts` to a counter or reuse `idGenerator`), then register:

```ts
  server.post<{ Params: { id: string } }>("/api/jobs/:id/edits", async (request, reply) => {
    const job = options.store.getRecord(request.params.id);
    if (job === undefined) {
      return reply.status(404).send({ message: "Job not found" });
    }
    const parsed = EditCompositionRequestBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send(validationError(formatZodIssues(parsed.error.issues)));
    }
    if (!options.queue.hasCapacity()) {
      return reply.status(429).send({ message: "Generation queue is full" });
    }
    const revId = options.idGenerator();
    options.store.setPendingEdit(request.params.id, {
      revId,
      instruction: parsed.data.instruction,
      context: parsed.data.context as EditContextRef[],
    });
    if (!options.queue.enqueue(request.params.id)) {
      return reply.status(429).send({ message: "Generation queue is full" });
    }
    const snapshot = options.store.getSnapshot(request.params.id);
    return reply.status(202).send(snapshot);
  });
```

(`server.ts` already passes `idGenerator` into `registerJobsRoutes` — reuse it for `revId`.)

- [ ] **Step 4: Run full api suite → PASS.** `pnpm --filter @tinker/api test`
- [ ] **Step 5: typecheck both packages + commit.**
```bash
pnpm --filter @tinker/generation-contract typecheck && pnpm --filter @tinker/api typecheck
git add apps/api/src/routes/jobs.ts apps/api/src/server.ts apps/api/src/server.test.ts
git commit -m "feat(api): POST /api/jobs/:id/edits — enqueue edit, append revision (fake runEdit)"
```

---

## Self-Review (plan author)

**Spec coverage (3b-1):** `revisions`/`currentRevisionId` + `ApiRevision` (Task 1); the
`.strict()` `EditContextRef`/edit body in `generation-contract` so `apps/api` needn't
import `apps/web` (Task 1); `jobStore` revision methods + **`pendingEdit` stripped from
the strict snapshot parse** (Task 2 — the reviewer's `kind`-leak fix, generalized to
`pendingEdit`); parent job **stays `completed`** (Tasks 2–3, asserted); `buildServer`
`runEdit` seam + queue dispatch (Task 3); endpoint 202/404/422/429 mirroring
`routes/jobs.ts` (Task 4). All CI-testable with a fake `runEdit` — no agent, no render.

**Placeholder scan:** none — real code/tests throughout. (Task 4 reuses existing
`server.test.ts` helpers; the one soft spot is "reuse the file's runner fakes / flush
helper" — the implementer must read `server.test.ts` to match them; flagged inline.)

**Type consistency:** `ApiRevision`, `EditContextRef`, `PendingEdit`, `RunEdit`,
`ApiGenerationResult` names/shapes are consistent across Tasks 1→4. `RunEdit` returns
`ApiGenerationResult` (artifacts) — what `appendRevision` stores on the revision.

**Out of scope (later 3b slices):** the fuzzy patch applier + structural lint (3b-2);
symbol map/localization (3b-3); the REAL `runEdit` composing `defaultRunOpencode` +
`buildEditPrompt` + fuzzy apply (3b-4); `classifyArtifact` revision-path support + the
artifacts route serving revision paths (3b-4/3c); `HttpCompositionEditClient` + bounded
replay + Reprompt UI (3b-5); export render-on-demand (3c).
