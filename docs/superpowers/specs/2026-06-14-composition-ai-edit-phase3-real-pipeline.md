# Composition AI Editing — Phase 3: Real pipeline (generate · edit · export)

## Status

Draft design, in autonomous build (review-subagent gated). Person B owned; the
`apps/api` route, the `@tinker/generation-contract` schema change, the
`buildEditPrompt`, and the scene-structure prerequisite are **flagged for Samuel's
review** (shared / Person-A territory). Builds on Phases 0–2 (merged to `main`,
PR #22). Parent design: `docs/superpowers/specs/2026-06-13-composition-ai-edit-design.md`.

## Background — where we are

- **Samuel's full generation pipeline is on `main` and wired**: `apps/api`'s
  `generationWorker` runs `runLocalGenerationJob` → `runAiUrlDemo` (repo analysis →
  Hyperframes generation → validate → render). The API is live on `:4500`.
- **The web app still talks to in-browser mocks** (`App.tsx`:
  `createMockGenerationClient`, `createMockCompositionGenerationClient`,
  `createMockCompositionEditClient`). The real `HttpCompositionGenerationClient`
  exists (Phase 0) but is **not wired in**.
- **The agent CLI is available here** (`claude` on `PATH`), so real generate/edit
  runs are possible (slow: minutes, 30-min agent timeout).
- Phase 2 shipped the composition editor + the AI chat-edit **UI** running on a mock
  edit client. The client interface (`CompositionEditClient`,
  `CompositionRevision`, `CompositionEditRequest`) and the Accept/Reject/Undo
  revision stack already exist client-side — swapping the mock for a real HTTP
  client requires **no UI change**.

## Goal

Turn the mock-driven prototype into the **real, polished product**: paste a repo →
real generated composition → edit it conversationally with a Cursor-like
Accept / Decline / Reprompt loop that replays the changed part → export the mp4.

## Slices (each independently shippable; built in order)

| Slice | Deliverable | Touches Samuel's area? |
|-------|-------------|------------------------|
| **3a** | Connect real generation: web uses `HttpCompositionGenerationClient`; real generate opens in the editor | No (web wiring only) |
| **3b** | Real `POST /api/jobs/:id/edits` + the **diff-based edit method** + `revisions` schema + `HttpCompositionEditClient` | **Yes** — route, schema, compose his exports, edit prompt (review) |
| **3c** | Real export: Export button serves/downloads the current revision's `output-video` | Minor (artifact route already exists) |

## 3a — Connect real generation

- **`App.tsx`**: construct `createHttpCompositionGenerationClient()` (Phase 0's
  `httpCompositionGenerationClient.ts`) and pass it to `CompositionDemoScreen` for
  the composition route, replacing `createMockCompositionGenerationClient()`. Keep
  the mock importable for tests/Storybook.
- **Dev proxy already exists** (`vite.config.ts` `/api` → `127.0.0.1:4500`).
- **Smoke test (manual, gated on agent CLI)**: with `apps/api` running, paste a real
  repo, confirm a real composition opens in the editor and scrubs.
- **No code in `apps/api` changes.** The legacy `createMockGenerationClient` (the
  `DemoProject` path) is untouched.

*Demoable:* real "paste repo → generated composition → editor".

## 3b — Real edit endpoint + the diff-based edit method

### The editing method (research-backed — see Risks for evidence strength)

A **Cursor-style loop**: **Localize → Propose (search/replace diff) → Apply (fuzzy)
+ lint guardrail → Preview live → Accept / Decline / Reprompt**, with the full mp4
render **deferred to Accept/export** so the preview is fast.

1. **Localize (symbol-grounded, not text/embedding search).** Build a *scene/timeline
   symbol map* from the composition: scene ids, named nested GSAP timeline labels
   (`window.__timelines`), tween targets, and clip `start`/`end`. The selected
   clip/range from the UI scopes the agent to one scene/tween. (Agentless 3-step
   localization collapses to "pick the scene → patch its tween" for a single file.)
2. **Propose (search/replace edit format).** Run the agent with
   `buildEditPrompt(instruction, scopedContext, symbolMap, targetSnippet)`; the agent
   returns **search/replace blocks** (`<<<<<<< SEARCH / ======= / >>>>>>> REPLACE`),
   **not** a whole-file rewrite and **not** line-numbered diffs.
3. **Apply (fuzzy).** Apply the blocks to the revision's `index.html` with
   **flexible/whitespace-tolerant matching, no line numbers** — the single biggest
   reliability lever (Aider: 9× apply errors without it). This is our own small,
   well-tested patch applier.
4. **Lint guardrail BEFORE render.** Validate the patched composition structure
   (the `window.__timelines` contract, forbidden files, HTML parses) — gate the
   revision on it. If invalid → one self-repair retry (feed the lint error back) →
   else fail the revision with the error. (SWE-agent: edit-linting alone moved
   resolve rate 3%→15%.)
5. **Preview live (decoupled from render).** The revision's `index.html` loads in the
   existing live preview iframe; the editor **auto-seeks to the edited clip's
   `[start,end]` and plays that range on loop** — "here's the changed part." This
   needs **no segment mp4 render** (it runs the GSAP composition live), sidestepping
   the unproven segment-render question.
6. **Accept / Decline / Reprompt** (Phase 2b UI already does this). Accept promotes
   the revision (and triggers/keeps the full render for export); Decline discards it;
   **Reprompt** feeds the user's follow-up back as a critique **scoped to the same
   clip/tween** (Reflexion-style) so it refines without drifting.

### The agent integration (compose Samuel's public exports — no edits to his package)

- Run the agent via his **public** `defaultRunOpencode(prompt, { hyperframesDir,
  repoCheckoutDirectory })` (`hyperframesPlanning.ts:277`) with **our own**
  `buildEditPrompt` — we do not need his private `buildRepairPrompt`.
- **Repo checkout**: the edit worker **re-checkouts the repo** (the job record has
  `repoUrl`) into a scratch dir, since generation discards its checkout. (Optional
  later optimization owned by Samuel: persist the checkout.)
- **Render for export**: `runHyperframesRender({ hyperframesDir, outputVideoPath })`
  — run on Accept / first export, not on every draft.

### The endpoint (`apps/api`, Fastify — mirrors `routes/jobs.ts`)

- **`POST /api/jobs/:id/edits`** — body `{ instruction: string, context:
  ChatContextRef[] }` (validated by a `.strict()` zod schema). 404 if no job, 429 if
  queue full, **202** + job snapshot. Enqueues an **edit job**.
- **Edit worker** (new; the queue's `runJob` branches on job kind, or a second
  worker): read record → new revision dir
  `generated/local-job/<id>/revisions/<revId>/hyperframes/` (copy current
  composition) → re-checkout repo → **localize → agent(search/replace) → apply(fuzzy)
  → lint** → append the revision (status `completed`, artifacts indexed by `kind`).
  Render is deferred (a later `render` step or on export).
- **Seam:** the worker takes an injected `runEdit` (real = `defaultRunOpencode`
  composition; fake in tests returns a canned patched `index.html`). The fuzzy
  patch-apply + lint are pure and unit-tested without the agent.

### Revisions schema (the `@tinker/generation-contract` change — Samuel review)

- Add `ApiRevision = { id, status, createdAt, result?: { artifacts: ApiArtifact[] },
  error? }` and `revisions?: ApiRevision[]` + `currentRevisionId?: string` to
  `ApiGenerationJobSchema` (extend its `.strict()` shape + the status/result
  `superRefine`). `jobStore` gains `appendRevision`/`failRevision`/`setCurrentRevision`
  (today `complete()` overwrites `result` wholesale).
- A revision points at its own artifact set under `revisions/<revId>/hyperframes/...`;
  **every revision's artifacts are retained** — Accept/Reject/Undo stays a client-side
  pointer (Phase 2b), no server delete.

### `HttpCompositionEditClient` (`apps/web` — swap the mock, zero UI change)

- `POST /api/jobs/:id/edits` then poll `GET /api/jobs/:id`; map the **new revision's**
  artifacts → the `CompositionRevision { id, compositionIndexUrl, outputVideoUrl }`
  the Phase 2b UI already consumes. Wire it in `App.tsx` behind the same prop the mock
  uses.

*Demoable:* type an instruction → real `claude` edit → the changed clip replays live →
Accept / Decline / Reprompt.

## 3c — Real export

- The Export button (currently a stub) downloads/opens the **current revision's
  `output-video`** artifact URL (served by the existing artifacts route). If the
  revision hasn't been rendered yet (render deferred), trigger the render then offer
  the download (honest progress).

## Samuel review / coordination items

1. **`buildEditPrompt`** — our user-instruction edit prompt run through his
   `defaultRunOpencode`. Review that it scopes edits to the given clip + respects the
   composition contract (`window.__timelines`, forbidden files, `output.mp4`).
2. **`revisions`/`currentRevisionId` schema change** to `ApiGenerationJob` — small
   isolated change, co-signed.
3. **Composing `defaultRunOpencode` + `runHyperframesRender` +
   `validateHyperframesArtifacts`** from `apps/api` — confirm acceptable use of the
   public API.
4. **Scene-structure prerequisite (promoted from Phase 4):** each scene = a **named
   nested GSAP timeline with a stable id** so localization (target a clip) and
   live segment-replay (seek a clip's range) work. This is a generator/lint change in
   his area. **Degrade gracefully:** if scenes aren't individually addressable, the
   edit falls back to **whole-composition scope** (less precise, but functional) and
   replay seeks the selected range anyway.

## Data flow

1. Create → `HttpCompositionGenerationClient` → real job → editor holds
   `{ jobId, artifacts }` (3a).
2. Edit: instruction + context → `POST /edits` → edit worker (localize → agent
   search/replace → fuzzy apply → lint) → new revision (3b).
3. Editor previews the revision live, seek-plays the edited clip; Accept / Decline /
   Reprompt.
4. Export: render (if needed) → download the current revision's `output-video` (3c).

## Error handling

- **Agent failure / non-applying patch / lint failure**: one self-repair retry
  (feed the error back); else the revision fails with the real error surfaced in chat
  (Phase 2b error state) + Reprompt.
- **Long agent run**: the UI already treats edits as long jobs (drafting state +
  cancel); the endpoint emits coarse progress.
- **Repo re-checkout failure** (private repo / network): fail with a clear message.
- **Missing scene structure**: degrade to whole-composition scope (above).
- **Generation failure (3a)**: the existing job `failed` path + chat surfacing.

## Testing

- **Patch applier (fuzzy)**: search/replace blocks apply against whitespace/indent
  drift; non-matching block → clear error. Pure unit tests.
- **Symbol map / localization**: build the scene/timeline map from a fixture
  composition; scoping selects the right tween region.
- **Edit worker (seam)**: injected fake `runEdit` returns a canned patched
  composition → revision appended, artifacts indexed, lint gate enforced, self-repair
  retry on lint failure. No agent spawned in CI.
- **Endpoint**: 202 + snapshot; 404/429/422 paths (mirror `routes/jobs.ts` tests).
- **Schema**: `revisions`/`currentRevisionId` round-trip through the `.strict()`
  schema + `superRefine`; `jobStore` revision methods.
- **`HttpCompositionEditClient`**: maps a revision job snapshot → `CompositionRevision`
  (fetch mocked, like `httpCompositionGenerationClient.test.ts`).
- **Live smoke (manual, gated on agent CLI)**: real generate → real edit → replay →
  accept → export.

## Non-goals (v1)

- **No whole-composition rewrite as the primary path** (it's the fallback only).
- **No segment mp4 rendering** — replay is live in the iframe; mp4 is for export.
- **No blocking VLM verify gate** — a VLM "frame matches instruction?" check is
  **advisory** at most in v1 (research gap; see Risks).
- **No persisted repo checkout** (re-checkout per edit; Samuel optimization later).
- **No retire of the legacy `DemoProject`/`EditorScreen` path** (separate joint
  cleanup).
- **No multi-file / multi-clip simultaneous edits** in one instruction.

## Risks & evidence strength

- **Diff format / fuzzy apply / lint guardrail / symbol localization** are
  **evidence-backed** (Aider edit-format + 9× fuzzy-apply finding; SWE-agent
  edit-linting 3%→15%; Agentless/AutoCodeRover/Aider repo-map localization). *Caveat:*
  format superiority is **model-dependent** ("search-replace always best for big
  models" was **refuted**) — so we **A/B the edit format on our actual model**
  (`claude-fable-5`) early, treating search/replace as the default, not gospel.
- **Live segment replay, the verify gate, and animation-specific LLM editing** had
  **zero verified research support** — they are sound engineering inference. Mitigation:
  replay uses the *already-working* live preview (low risk); the verify gate is
  lint+render success (advisory VLM optional); we validate empirically.
- **Agent latency + cost** (minutes/edit): mitigated by deferring render, live
  preview, the existing long-job UX, and the test seam for CI.
- **Scene structure not guaranteed today**: graceful degrade to whole-composition
  scope; the named-timeline prerequisite is Samuel's quality lever, not a blocker.

## Success criteria

- Paste a real repo → a real generated composition opens and scrubs (3a).
- Type an instruction → a real `claude` edit produces a revision via search/replace +
  fuzzy apply + lint gate; the changed clip **replays live**; Accept / Decline /
  Reprompt work; swapping the mock for `HttpCompositionEditClient` needed no UI change
  (3b).
- Export downloads the current revision's rendered mp4 (3c).
- All shared-surface changes (`apps/api` route, `generation-contract` schema, the edit
  prompt) are isolated and reviewable by Samuel; nothing merged to `main` unilaterally.
