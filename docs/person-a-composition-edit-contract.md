# Person A Handoff: Composition Edit Endpoint

**From:** Person B (editor / AI-edit UX)
**To:** Person A (generation pipeline, `apps/api` + `@tinker/demo-assembly`)
**Related design:** `docs/superpowers/specs/2026-06-13-composition-ai-edit-design.md`
**Status:** Person B is **building** this endpoint by composing your
`@tinker/demo-assembly` public exports in `apps/api`. This doc is for your
**review** — the edit prompt, the schema change, and the clip scene-lint — not a
build request. Flag anything you'd rather own or change.

## Why

Person B is building conversational editing on top of your Hyperframes output: the
user watches the live composition, selects a time range or clip, and asks an AI
assistant to edit it. The assistant must **rewrite the existing composition and
re-render** — the same kind of agent + lint/render loop you already run for
generation, but applied to an existing composition with a scoped instruction.

Your API currently has **no edit/iteration endpoint** (explicitly deferred in the
generation-api-server design). Rather than wait, Person B implements it in
`apps/api` by **composing your existing exports** —
`createOpencodeHyperframesRepairer` (the repair = edit-an-existing-composition
primitive) + `runHyperframesRender` (re-render) — without editing
`@tinker/demo-assembly` internals. This document records the shape so you can
review the seam and the three items below.

## What Person B is building (please review)

### 1. `POST /api/jobs/:id/edits`

Person B's `apps/api` route runs the composition-editing agent on job `:id`'s
existing composition and produces a new revision, by composing
`createOpencodeHyperframesRepairer` + `runHyperframesRender`.

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

## Review checklist (for Person A)

- **Edit prompt:** the user-instruction variant of `buildRepairPrompt` scopes edits
  to the given range/clip and respects the composition contract
  (`window.__timelines`, forbidden files, `output.mp4`).
- **Schema:** the `revisions` / `currentRevisionId` addition to the job shape — OK
  as a small joint PR?
- **Reuse:** composing `createOpencodeHyperframesRepairer` + `runHyperframesRender`
  from `apps/api` is an acceptable use of the public API (no internal edits)?
- **Scene-lint (Phase 4):** prefer to own the generator change that makes each
  scene a named nested timeline, or review a small Person-B PR for it?
- **Anything here you'd rather build or shape yourself** — say so and Person B
  adjusts.
