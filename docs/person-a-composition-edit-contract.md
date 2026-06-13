# Person A Handoff: Composition Edit Endpoint

**From:** Person B (editor / AI-edit UX)
**To:** Person A (generation pipeline, `apps/api` + `@tinker/demo-assembly`)
**Related design:** `docs/superpowers/specs/2026-06-13-composition-ai-edit-design.md`
**Status:** Proposal — please review before implementing. Person B is building the
full front-end against a local stub and will swap to this endpoint when it lands.

## Why

Person B is building conversational editing on top of your Hyperframes output: the
user watches the live composition, selects a time range or clip, and asks an AI
assistant to edit it. The assistant must **rewrite the existing composition and
re-render** — the same kind of agent + lint/render loop you already run for
generation, but applied to an existing composition with a scoped instruction.

Your API currently has **no edit/iteration endpoint** (explicitly deferred in the
generation-api-server design). This document specifies exactly what Person B needs
so the swap from stub to real is zero-UI-change.

## What Person B needs

### 1. `POST /api/jobs/:id/edits`

Run the composition-editing agent on job `:id`'s existing composition and produce
a new revision.

**Request body:**

```jsonc
{
  "instruction": "string",          // the user's edit prompt, e.g. "punch in on the modal"
  "context": [                       // 0..n scoped references the edit applies to
    { "kind": "range", "start": 4.2, "end": 7.8 },
    { "kind": "clip", "clipId": "scene-feature", "label": "feature", "start": 4.2, "end": 7.8 }
  ]
}
```

- `kind: "range"` → a time window in seconds.
- `kind: "clip"` → a named nested timeline (see §2); `start`/`end` included for convenience.
- An empty `context` means "edit the whole composition."

**Behavior:**

- Treat it like a job: validate, enqueue, return `202` with a job snapshot whose
  status moves `queued → running → completed | failed`.
- Run the agent (opencode/claude) **on the existing composition directory** with
  the instruction + scoped context, then re-run the **same lint/render repair
  loop** you use for generation. Produce a new `index.html` + `output.mp4`.
- The agent should be told which `clipId`s / time range the edit targets so it can
  scope its rewrite (it can also read `window.__timelines` itself).

**Result — a new revision on the same job (decision: same-job revisions, not child jobs):**

Suggested shape (a small, joint schema change to `ApiGenerationJob`):

```jsonc
{
  "id": "job-abc",
  "status": "completed",
  "currentRevisionId": "rev-2",
  "revisions": [
    { "id": "rev-1", "status": "completed", "createdAt": "...", "result": { "artifacts": [ /* ApiArtifact[] */ ] } },
    { "id": "rev-2", "status": "completed", "createdAt": "...", "result": { "artifacts": [ /* ApiArtifact[] */ ] } }
  ]
}
```

- Each revision points to its own artifact set (e.g. under
  `generated/local-job/<jobId>/revisions/<revId>/hyperframes/...`). **Retain every
  revision's artifacts** — Person B's Accept/Reject/Undo is a client-side pointer
  over them, so no delete endpoint is required.
- `GET /api/jobs/:id` returns the job with its `revisions` and `currentRevisionId`.
- Reuse the existing artifact `kind` classification (`composition-index`,
  `output-video`, manifests, …) per revision.

**Progress / errors:** reuse the runner progress dialect (`status` + `message` +
`time`) and `GenerationError`. Re-rendering can take minutes — coarse progress is
fine; just emit events so the UI can show a live state.

### 2. One lint rule: make scenes discoverable as clips

Today the lint guarantees `window.__timelines[compositionId]` (the master
timeline). To enable **clip selection** ("click a clip → add to chat"), add one
rule to the lint you already run:

- **Each scene is a named nested GSAP timeline** (with an `id` or label) added to
  the master timeline, so Person B can enumerate clips via
  `master.getChildren(false, false, true)` and read each child's
  `startTime()` / `duration()` / `id`.

No second artifact and no separate `scenes.json` — the structure lives in the
timeline that already exists, enforced the same way `window.__timelines` is.

Until this lands, Person B's timeline works in **range-only** mode and degrades
gracefully, so this is not a blocker for shipping Phases 0–2.

## What Person B does meanwhile

- Builds the entire front-end (preview, timeline, selection, chat, Accept/Reject/Undo)
  against a deterministic `MockCompositionEditClient` that returns a fake revision.
- Wires Create Demo to the existing `ai-url-planning` request shape and consumes
  artifacts by `kind` (separate Phase 0 work; no Person A change needed).
- Swaps the stub for `HttpCompositionEditClient` when this endpoint exists — no UI
  changes.

## Joint / review items

- The `revisions` / `currentRevisionId` addition to the job shape is a **schema
  change** — small isolated PR, reviewed by both per the repo workflow.
- `docs/architecture.md` still describes the retired `DemoProject`-operations
  editing model. Revising it to the composition-source model is a **joint** change,
  tracked separately (not part of Person B's slice).

## Acceptance (for Person A)

- `POST /api/jobs/:id/edits` accepts the request above, runs the agent on the
  existing composition, re-renders, and returns a new completed revision with valid
  artifacts.
- `GET /api/jobs/:id` returns the job with `revisions` + `currentRevisionId`.
- Failed edits return a `GenerationError` and leave prior revisions intact.
- (When ready) generated compositions expose named nested-timeline scenes
  discoverable via `getChildren`.
