# Composition AI Editing — Phase 3: Real pipeline (generate · edit · export)

## Status

Draft design, in autonomous build (review-subagent gated; rev 2 after spec review).
Person B owned; the `apps/api` route, the `@tinker/generation-contract` schema
change, and `buildEditPrompt` are **flagged for Samuel's review** (shared /
Person-A territory). Builds on Phases 0–2 (merged to `main`, PR #22). Parent design:
`docs/superpowers/specs/2026-06-13-composition-ai-edit-design.md`.

## Background — where we are

- **Samuel's full generation pipeline is on `main` and wired**: `apps/api`'s
  `generationWorker` runs `runLocalGenerationJob` → `runAiUrlDemo`. API live on `:4500`.
- **The web app still talks to in-browser mocks** (`App.tsx`). The real
  `HttpCompositionGenerationClient` exists (Phase 0) but is not wired in.
- **The agent CLI is available here** (`claude` on `PATH`, `--model claude-fable-5
  --effort max` by default), so real runs are possible (slow: minutes).
- **Phase 2 shipped the editor UI** on a mock edit client. The client interface
  (`CompositionEditClient`/`CompositionRevision`/`CompositionEditRequest`) and the
  **Accept / Reject / Undo** revision stack exist client-side. Swapping the mock for
  a real HTTP client needs **no UI change** — but **Reprompt and live segment-replay
  are NEW UI** added in 3b (Phase 2b has no Reprompt and the playback hook only plays
  to full duration).

## Goal

Turn the mock-driven prototype into the **real product**: paste a repo → real
generated composition → edit it with a Cursor-like **Accept / Reject / Reprompt**
loop that replays the changed clip live → export the mp4.

## Slices (built in order; each independently shippable)

| Slice | Deliverable | Samuel's area? |
|-------|-------------|----------------|
| **3a** | Connect real generation: web uses `HttpCompositionGenerationClient` | No (web wiring) |
| **3b-1** | `revisions` schema + `jobStore` revision methods + `POST /edits` skeleton (fake `runEdit`, no agent) | **Schema review** |
| **3b-2** | Pure fuzzy search/replace patch applier + structural lint (`window.__timelines` contract) | No |
| **3b-3** | Scene/timeline symbol map + localization (scope to selected clip) | No |
| **3b-4** | Real edit worker: compose `defaultRunOpencode` + `buildEditPrompt` (agent-gated) | **Prompt review** |
| **3b-5** | `HttpCompositionEditClient` swap + bounded-range live replay + Reprompt UI | No |
| **3c** | Real export: render-if-needed → download current revision's `output-video` | Minor |

## 3a — Connect real generation

- **`App.tsx`**: construct `createHttpCompositionGenerationClient()`
  (`httpCompositionGenerationClient.ts`, defaults `renderer: "hyperframes"`) and pass
  it to `CompositionDemoScreen` for the composition route, replacing the mock. Keep
  the mock importable for tests.
- Dev proxy already exists (`vite.config.ts` `/api` → `127.0.0.1:4500`).
- **Smoke test (manual, agent-gated):** real repo → confirm the completed job has a
  **`composition-index` artifact** (a `playwright` job produces none and hits
  `CompositionDemoScreen.tsx`'s "completed but produced no composition" branch — so
  assert the artifact, not just completion) → composition opens and scrubs.
- No `apps/api` change; the legacy `DemoProject` path is untouched.

*Demoable:* real "paste repo → generated composition → editor".

## 3b — Real edit endpoint + the diff-based edit method

### The editing method (research-backed; see Risks for evidence strength)

**Localize → Propose (search/replace) → Apply (fuzzy) + lint guardrail → Preview
live → Accept / Reject / Reprompt**, with the full mp4 render **deferred to
Accept/export** so the preview is fast.

1. **Localize (symbol-grounded).** Build a *scene/timeline symbol map* (scene ids,
   named nested GSAP timeline labels from `window.__timelines`, tween targets, clip
   `start`/`end`); the selected clip scopes the agent to one scene/tween. *Degrade:*
   if scenes aren't individually addressable, fall back to whole-composition scope.
2. **Propose (search/replace).** Agent returns **search/replace blocks**
   (`<<<<<<< SEARCH/=======/>>>>>>> REPLACE`) — not whole-file, not line-numbered.
3. **Apply (fuzzy).** Apply with **whitespace-tolerant matching, no line numbers**
   (Aider: 9× apply errors without it). Our own small, unit-tested applier (3b-2).
4. **Lint guardrail BEFORE render.** Gate the revision on **two checks, neither of
   which requires `output.mp4`**: (a) `validateHyperframesArtifacts` (existing —
   `index.html` access, both manifests, forbidden-file rules; it checks the
   `outputVideoPath` *string* equals `"output.mp4"`, NOT that the file exists, so it
   is safe pre-render); plus (b) a **NEW Person-B structural lint** (HTML parses +
   the `window.__timelines` contract is present) — this is new code, not reuse;
   `runHyperframesRender` runs lint+render together with no separable lint export.
   On failure → one self-repair retry (feed the error back) → else fail the revision.
5. **Preview live (decoupled from render).** The revision's `index.html` loads in the
   live preview iframe; the editor **seek-plays the edited clip's `[start,end]` on
   loop** — "here's the changed part." No segment mp4 render. *(Bounded-range loop is
   NEW — see 3b-5.)*
6. **Accept / Reject / Reprompt.** Accept promotes the revision (triggers/keeps the
   render for export); Reject discards it; **Reprompt** (new) feeds the follow-up back
   as a critique **scoped to the same clip/tween** so it refines without drifting.

### Agent integration (compose Samuel's PUBLIC exports — no edits to his package)

- Run the agent via **public** `defaultRunOpencode(prompt, { cwd, logDir,
  repoCheckoutDirectory? })` (`hyperframesPlanning.ts:277`). The agent runs in a
  **sandbox copy** (`cwd`) and writes output back to `logDir`, so the patched
  `index.html` must land in `logDir` (the revision dir). `buildEditPrompt` is **ours**
  (greenfield — NOT a variant of the private `buildRepairPrompt`).
- **No repo checkout in v1.** `repoCheckoutDirectory` is **optional** on
  `defaultRunOpencode`, and editing an existing composition does not need the source
  repo (the product context is already baked into the composition). *(Future: repo-
  aware edits need Samuel to export a checkout-only primitive — `defaultFetchRepo` is
  private and `analyzeRepo` couples clone + a full agent analysis; deferred.)*
- **Render for export only:** `runHyperframesRender({ hyperframesDir, outputVideoPath })`
  on Accept / first export — not per draft.

### The endpoint (`apps/api`, Fastify — mirrors `routes/jobs.ts`)

- **`POST /api/jobs/:id/edits`** — body `{ instruction: string, context:
  ChatContextRef[] }` (`.strict()` zod). 404 if no job, 429 if queue full, **202** +
  job snapshot. Enqueues an **edit job**.
- **Queue branching:** add `kind: "generation" | "edit"` to `JobRecord`; keep the one
  concurrency-1 queue, and `runJob(id)` looks up the record and dispatches to the
  generation worker or the new **edit worker** by `kind`. (Concurrency-1 means an edit
  blocks new generations and vice-versa — acceptable for local single-user.)
- **Edit worker** (3b-4): copy the current composition → new revision dir
  `generated/local-job/<id>/revisions/<revId>/hyperframes/` → **localize → agent
  (search/replace, `cwd`=sandbox, output→`logDir`=revision dir) → fuzzy apply →
  validate + structural lint** → append the revision (status `completed`; render
  deferred). Edit progress lives on the **revision**, not the parent job's
  `progressEvents`.
- **Seam:** the worker takes an injected `runEdit` (real = `defaultRunOpencode`
  composition; fake in tests returns a canned patched `index.html`). Endpoint +
  worker tests use the fake (mirrors `server.test.ts`'s injected `runner`); the fuzzy
  applier + structural lint are pure unit tests. No agent in CI.

### Revisions schema (`@tinker/generation-contract` — Samuel review)

- Add `ApiRevisionSchema = { id, status, createdAt, result?: { artifacts:
  ApiArtifact[] }, error? }` with its **own** `superRefine` (mirror the job's
  `completed⇒result` / `failed⇒error` rules per revision), and
  `revisions?: ApiRevision[]` + `currentRevisionId?: string` on `ApiGenerationJobSchema`
  (still `.strict()`).
- **The parent job stays `status: "completed"` throughout an edit** — edit
  state/progress lives on the new revision. This is load-bearing:
  `apps/api/src/routes/artifacts.ts` serves a file only when
  `record.status === "completed"`, so flipping the parent to `running` would make the
  **base composition unservable** and break the live preview mid-edit.
- **Touch points (exhaustive):** `JobRecord` (+`revisions`, `currentRevisionId`,
  `kind`); `jobStore` gains `appendRevision` / `failRevision` / `setCurrentRevision`
  (keep every `snapshot()` valid — it re-`parse`s through `.strict()` on each read);
  `hasValidSnapshotDatetime`; existing `server.test.ts` snapshot assertions (new
  optional fields).

### Serving revision artifacts (fixes the classification + route gap)

- **`artifactIndex.ts` `classifyArtifact`** is extended to recognize
  `revisions/<revId>/hyperframes/index.html` → `composition-index`,
  `.../output.mp4` → `output-video`, manifests/logs/assets likewise (today an exact
  non-revision path match yields `"other"`).
- Each revision's artifacts are indexed onto `revision.result.artifacts` with URLs
  `/api/jobs/<jobId>/artifacts/<encodedRevisionPath>`. **The artifacts route is
  extended to serve a path that is registered on `record.result.artifacts` OR any
  `record.revisions[].result.artifacts`** (parent stays `completed`, so the gate
  passes).

### `HttpCompositionEditClient` (3b-5 — swap the mock, no client-interface change)

- `POST /api/jobs/:id/edits` then poll `GET /api/jobs/:id`; read the **new revision's**
  `result.artifacts` → map `composition-index`/`output-video` → the
  `CompositionRevision { id, compositionIndexUrl, outputVideoUrl }` the Phase-2 UI
  consumes. Wire in `App.tsx` behind the same prop the mock uses.
- **New UI in 3b-5:** (a) bounded-range loop in `useCompositionPlayback` (accept
  `[start,end]`, loop `next >= end → start`) driven on revision-preview; (b) a
  **Reprompt** affordance (new `useCompositionEditFlow` method + a panel control +
  tests) that re-submits scoped to the same clip.

## 3c — Real export

- The Export button downloads the **current revision's `output-video`**. Because
  render is deferred, the current revision usually has **no `output-video` yet** — so
  export **triggers `runHyperframesRender` first** (honest progress), then offers the
  download. (Render also runs on Accept so the common case is already rendered.)

## Samuel review / coordination items

1. **`buildEditPrompt`** — our greenfield instruction+clip-scoped edit prompt run
   through his `defaultRunOpencode`. Review it scopes to the clip + respects the
   composition contract (`window.__timelines`, forbidden files, `output.mp4`).
2. **`revisions`/`currentRevisionId` schema change** to `ApiGenerationJob` — co-signed.
3. **Composing `defaultRunOpencode` + `runHyperframesRender` +
   `validateHyperframesArtifacts`** from `apps/api` — confirm acceptable public-API use.
4. **Scene-structure prerequisite (promoted from Phase 4):** each scene = a named
   nested GSAP timeline with a stable id (enables precise localization + clip replay).
   Degrade to whole-composition scope if absent — quality lever, not a blocker.
5. **(Future, optional) checkout-only primitive** — export `fetchRepo`/persist the
   generation checkout for repo-aware edits. Not needed for v1.

## Data flow

1. Create → `HttpCompositionGenerationClient` → real job → editor holds
   `{ jobId, artifacts }` (3a).
2. Edit: instruction + context → `POST /edits` → edit worker (localize → agent
   search/replace → fuzzy apply → validate+lint) → new revision; parent stays
   `completed` (3b).
3. Editor previews the revision live, seek-loops the edited clip; Accept / Reject /
   Reprompt.
4. Export: render-if-needed → download the current revision's `output-video` (3c).

## Error handling

- **Agent failure / non-applying patch / lint failure:** one self-repair retry (feed
  the error back); else the revision is marked `failed` with the real error surfaced
  in chat (Phase 2b error state) + Reprompt.
- **Long agent run:** the UI treats edits as long jobs (drafting + cancel); the
  worker emits coarse revision-scoped progress.
- **Missing scene structure:** degrade to whole-composition scope.
- **Generation failure (3a):** existing job `failed` path + chat surfacing.

## Testing

- **Fuzzy patch applier (3b-2):** search/replace applies against whitespace/indent
  drift; non-matching block → clear error. Pure unit tests.
- **Structural lint (3b-2):** rejects HTML missing the `window.__timelines` contract;
  accepts a valid fixture.
- **Symbol map / localization (3b-3):** build the map from a fixture composition;
  scoping selects the right tween region; flat-composition fallback.
- **Edit worker (3b-4, seam):** injected fake `runEdit` → revision appended, artifacts
  indexed onto the revision, validate+lint enforced, self-repair retry on lint fail,
  **parent stays `completed`**. No agent in CI.
- **Endpoint (3b-1):** 202 + snapshot; 404/429/422 (mirror `server.test.ts` +
  injected fake).
- **Schema (3b-1):** `revisions`/`currentRevisionId` round-trip through `.strict()` +
  per-revision `superRefine`; `jobStore` revision methods; `classifyArtifact` revision
  paths; artifacts route serves a revision path while parent is `completed`.
- **`HttpCompositionEditClient` (3b-5):** revision job snapshot → `CompositionRevision`
  (fetch mocked, like `httpCompositionGenerationClient.test.ts`).
- **Bounded replay (3b-5):** playback loops within `[start,end]`; resets at `end`.
- **Live smoke (manual, agent-gated):** real generate → real edit → replay → accept →
  export.

## Non-goals (v1)

- No whole-composition rewrite as the primary path (fallback only).
- No segment mp4 rendering (replay is live; mp4 is for export).
- No blocking VLM verify gate (advisory at most; research gap).
- No repo checkout per edit (composition-only; repo-aware edits deferred).
- No retire of the legacy `DemoProject`/`EditorScreen` path.
- No multi-clip simultaneous edits in one instruction.

## Risks & evidence strength

- **Diff format / fuzzy apply / lint guardrail / symbol localization** are
  **evidence-backed** (Aider edit-format + 9× fuzzy-apply; SWE-agent edit-linting
  3%→15%; Agentless/AutoCodeRover/Aider repo-map localization). *Caveat:* format
  superiority is **model-dependent** ("search-replace always best" was **refuted**),
  so we **A/B the edit format on `claude-fable-5`** early; search/replace is the
  default, not gospel.
- **Live bounded-range replay, the verify gate, animation-specific LLM editing** had
  **zero verified research support** — engineering inference. The bounded-range loop is
  **new code** (the playback hook doesn't support it yet) — modest, well-tested, but
  not "free reuse."
- **Agent latency/cost** (minutes/edit): mitigated by deferred render, live preview,
  the long-job UX, and the CI test seam.
- **Schema/serving blast radius**: the parent job must stay `completed` and revision
  artifacts must be classified + served — both specified above; the edit endpoint +
  store are the riskiest API surface and are sub-sliced (3b-1) and Samuel-reviewed.

## Success criteria

- Paste a real repo → a real composition opens and scrubs; the completed job exposes a
  `composition-index` artifact (3a).
- Type an instruction → a real `claude` edit produces a revision via search/replace +
  fuzzy apply + validate+lint; the changed clip **replays live on loop**;
  Accept / Reject / Reprompt work; the parent job stays `completed` so the preview
  never breaks mid-edit; swapping the mock for `HttpCompositionEditClient` needed no
  client-interface change (3b).
- Export renders-if-needed and downloads the current revision's mp4 (3c).
- All shared-surface changes (`apps/api` route, `generation-contract` schema, edit
  prompt) are isolated and reviewable by Samuel; nothing merged to `main` unilaterally.
