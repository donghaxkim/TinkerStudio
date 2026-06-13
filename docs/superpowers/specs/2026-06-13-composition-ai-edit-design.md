# Composition AI Editing (Cursor-for-composition)

## Status

Draft design, approved for implementation planning. Person B owned.

This spec describes the editor-side experience for editing an AI-generated demo
**after** generation: a live composition preview, a real timeline read from the
composition itself, range/clip selection that attaches scoped context to a chat
panel, and an AI edit loop that rewrites the composition and re-renders.

It supersedes the `DemoProject`-operations editing model for this product
direction. See **Product Decision Recorded** below.

## Background

Person A's generation pipeline (`apps/api` + `@tinker/demo-assembly`) produces a
**Hyperframes composition**, not a `DemoProject` timeline. A completed job emits:

- `hyperframes/index.html` — the editable GSAP composition source (`composition-index` artifact)
- `hyperframes/output.mp4` — the rendered video (`output-video` artifact)
- `hyperframes/generation-manifest.json` — `durationCapSeconds`, `aspectRatio`, `productUrl`, `sourceRepoUrl`, `outputVideoPath`
- `hyperframes/asset-manifest.json` — flat asset list
- analysis / lint / render logs

Every composition is **required by Person A's lint** to:

- mark its root element with `data-composition-id`, `data-width`, `data-height`, `data-start="0"`
- register its GSAP master timeline at `window.__timelines[compositionId]`

A job cannot complete unless `window.__timelines[compositionId]` exists. This is
the load-bearing guarantee this design relies on: **the composition exposes a
live, introspectable GSAP timeline.**

## Product Decision Recorded

The earlier `docs/architecture.md` model treated the editable artifact as a
`DemoProject` timeline edited via structured operations (`add_zoom`, …). That
model is **retired for this product**:

- **Editable artifact = the composition source (`index.html`).** The
  `DemoProject` JSON remains only as a temporary placeholder/fixture and is not
  the source of truth.
- **AI editing is conversational.** The user prompts an agent that rewrites the
  composition source and re-renders. There are no structured timeline operations.
- **Every video output is HTML-rendered** (Hyperframes). The Playwright/real-video
  capture path stays internal/CLI-only and is not part of this product surface.

`docs/architecture.md` should be revised to reflect this; that revision is a
separate, joint Person A + Person B change and is not part of this slice.

## Goal

Let a single local user, after generation:

1. Watch the generated demo as a **live, scrubbable composition** (not just the mp4).
2. See a **real timeline** derived from the composition (accurate duration,
   playhead, and — where structure exists — named clips).
3. **Select a time range or a clip** and add it to a chat composer as scoped context.
4. Ask an AI assistant for an edit; **preview the rewritten composition**; and
   **Accept / Reject / Undo** it.
5. **Export** the final mp4 only on demand.

## Non-Goals

- No `DemoProject`-operations editing (`add_zoom`, `remove_entity`, …). Retired.
- No multi-user, accounts, cloud storage, or collaboration.
- No captions/callouts/voiceover/audio mixing (still out of MVP scope).
- No new generation modes; generation already exists in `apps/api`.
- **Person B builds the real AI edit endpoint** by *composing* Person A's existing
  `@tinker/demo-assembly` public exports (`createOpencodeHyperframesRepairer` +
  `runHyperframesRender`) inside `apps/api` — **not** by reimplementing or editing
  the generation pipeline internals. The `MockCompositionEditClient` is retained as
  the fast, deterministic dev/test double (real edits spawn the agent CLI and can
  take many minutes). Person A reviews the edit prompt, the `revisions` schema
  change, and the scene-structure lint per
  `docs/person-a-composition-edit-contract.md`.
- No structured per-tween editing or GSAP-code diffing. Edits are whole-composition
  revisions.

## Architecture Overview

```text
live composition preview (sandboxed iframe over index.html)
        │  reads structure from window.__timelines[compositionId]
        ▼
CompositionTimeline  ──drag range OR click clip──►  "+ Add to chat"
        │
        ▼
chat composer: instruction + ChatContextRef[] (start/end, clipId?, label?, thumbnail?)
        │
        ▼
compositionEditClient.editComposition(jobId, { instruction, context })
        │   (stub now → POST /api/jobs/:id/edits later)
        ▼
new composition revision (new index.html + output.mp4)
        │
        ▼
preview hot-reloads to the revision → Accept (push) / Reject (pop) → Export mp4
```

The timeline reads the composition as a **live source of truth** rather than a
duplicated model. After an edit re-renders, the timeline re-reads
`window.__timelines` and reflects the change automatically — no separate timeline
state to keep in sync.

## Components

All new/changed code is in Person B territory: `apps/web`, `packages/editor`,
`packages/ai-edit-ui`, and one new package `packages/composition`.

### 1. Generation wiring (Phase 0 — decision-independent)

- **Vite proxy**: `apps/web/vite.config.ts` adds `server.proxy = { "/api": "http://127.0.0.1:4500" }`.
- **`HttpGenerationClient`** (`apps/web/src/lib/httpGenerationClient.ts`): implements
  the existing `GenerationClient` interface against `POST /api/jobs` and polls
  `GET /api/jobs/:id` every 1–2 s. Maps the runner-dialect progress events and the
  `ApiGenerationJob.artifacts` list (consume by `kind`).
- **Create Demo request shape**: the form currently submits the *assisted* request
  (no `mode`). It must submit the **`ai-url-planning`** shape
  (`{ mode, repoUrl, productUrl, prompt?, durationCapSeconds, aspectRatio }`).
- **Long-job UX**: planning + render can take minutes. Progress is coarse; show a
  cancelable "generating…" state with honest expectations.
- Result: a real generated composition (`index.html` + `output.mp4` + manifests)
  is reachable in the app by artifact `kind`.

### 2. `packages/composition` — preview adapter (new package)

- **`CompositionPreview`**: a React component that loads the `composition-index`
  artifact URL into a **sandboxed iframe** and runs it on the loopback origin.
- **`CompositionTimelineAdapter`**: a thin wrapper over the iframe's
  `contentWindow.__timelines[compositionId]` exposing:
  - `getDuration(): number`
  - `getLabels(): { name: string; time: number }[]`
  - `getClips(): { id: string; label?: string; start: number; end: number }[]`
    (top-level child timelines via `getChildren(false, false, true)`)
  - `seek(t: number): void`, `play(): void`, `pause(): void`
  - `captureThumbnail(t: number): Promise<string | undefined>` — **best-effort**.
    DOM→image capture of a live composition is unreliable (html2canvas-style
    approximation; cross-origin only works because artifacts are same-origin via
    the Vite proxy). If capture fails, return `undefined` and the context chip
    degrades to text-only (`⏱ 4.2s–7.8s`). Thumbnails are polish, not required.
- **Graceful degrade**: if `window.__timelines[compositionId]` is absent
  (should not happen — lint-enforced), fall back to a plain `<video>` over
  `output-video` with **range-only** selection and a quiet diagnostic.

### 3. `packages/editor` — `CompositionTimeline`

- Renders a scrubber from `getDuration()`, a playhead synced to the preview, and
  ticks/labels from `getLabels()`/`getClips()`.
- **Range selection**: drag to select `[start, end]`; render a selection band.
- **Clip selection**: click a clip segment to select it. When the composition is
  flat (no clip structure), clip selection is unavailable and the UI is range-only.
- Emits a `Selection` (`{ kind: "range" | "clip", start, end, clipId?, label? }`).

### 4. `packages/ai-edit-ui` — context chips + chat rework

- **`ChatContextRef`**: `{ id, kind: "range" | "clip", start, end, clipId?, label?, thumbnail? }`.
  Built from a `Selection` via "+ Add to chat"; `thumbnail` from
  `captureThumbnail(midpoint)`.
- **Context chips**: removable chips in the composer (Cursor-style @-mentions);
  multiple refs allowed.
- **`useCompositionEditFlow`** (replaces `useAIEditFlow`): sends
  `{ jobId, instruction, context }`, receives a new **revision**, drives the
  preview to it, and exposes Accept / Reject.
- **`AIEditPanel`** is reworked: composer + chips + send are reused; the
  `DemoProject`-operations preview (`OperationPreviewList`, `mockAIEditClient`,
  the old `useAIEditFlow`) is **retired**.

### 5. `compositionEditClient` — the seam

- **`HttpCompositionEditClient`**: `POST /api/jobs/:id/edits`, then poll the job.
- **`MockCompositionEditClient`**: deterministic local stub that returns a new
  revision (reusing the current artifacts with a new revision id) so the full loop
  runs fast without spawning the agent. Mirrors the `generationClient` /
  `mockGenerationClient` split, and remains the dev/test double after the real
  endpoint exists.

### 6. Edit endpoint in `apps/api` (built by Person B over Person A's exports)

`POST /api/jobs/:id/edits` — Person B implements this by **orchestrating Person A's
public exports**, not by editing `@tinker/demo-assembly`:

1. Copy the job's current composition into a new revision directory
   (`generated/local-job/<jobId>/revisions/<revId>/hyperframes/`).
2. Run `createOpencodeHyperframesRepairer(...)` with the user's `instruction` +
   scoped `context` (range/clip) as the repair input.
3. Re-run `runHyperframesRender(...)` (lint + render repair loop) on the revision.
4. Validate with `validateHyperframesArtifacts`; index artifacts by `kind`.
5. Append the revision to the job; return the updated snapshot.

**Runtime prerequisites:** the agent CLI (`claude` or `opencode`, via
`TINKER_HYPERFRAMES_AGENT`) must be installed with model access — the same
requirement generation already has. Edits are heavyweight (default agent timeout
1,800,000 ms / 30 min), so the UI treats them like long jobs and the mock double
covers fast iteration.

**Ownership:** this code lives in `apps/api` (shared, Person-A-review area) and
imports only `@tinker/demo-assembly`'s public API. The edit prompt (a
user-instruction variant of the repair prompt), the `revisions` schema change, and
the clip scene-lint are flagged for Person A review.

## Revision Model

Edits produce **whole-composition revisions**, not operations, because the AI
rewrites `index.html`. Accept / Reject / Undo operate on a client-managed stack:

```text
rev0 (generated) ──edit──► rev1 (preview)
   ▲                          │ Accept → rev1 becomes current; push onto undo stack
   └──────────────────────────┘ Reject → discard rev1; stay on rev0
Undo → pop the stack back to the previous current revision
```

- The **same job** holds all revisions (decision §3a). No child jobs in v1.
- The **server retains every revision's artifacts**; Accept/Reject/Undo are a
  **client-side pointer** over them. This keeps Person A's API surface minimal
  (one POST + the existing GET returning revisions). Reject does not require a
  server delete — the artifacts are cheap local files.
- The undo stack **is** the user's undo button.

## Selection Granularity

- **Always available (no Person A dependency):** range selection over the live
  timeline. Works against any composition because only the master timeline +
  duration are guaranteed.
- **Available once scenes are structured:** clip selection, where a clip is a
  **named nested timeline**. This requires one addition to the lint Person A
  already runs (each scene = a nested timeline with an id/label registered on the
  master). No second artifact; see the handoff contract.

## Preview / Export Parity

Parity is **structural**, not best-effort:

- Both the preview and `hyperframes render` render the **same `index.html`** in a
  **browser engine**; the render is deterministic and frame-by-frame
  (`--docker` available for cross-machine determinism).
- The only documented difference is **smoothness**: real-time preview may stutter
  on heavy compositions; the rendered mp4 is always frame-perfect. A given frame
  at time `t` is identical in both.
- The classic HTML→video divergence (embedded captured `<video>` decoded
  frame-by-frame) **does not apply**: these compositions are animated DOM/CSS/SVG
  + product screenshots, not embedded footage.
- **Guardrail (recommended):** a parity test that renders the sample to mp4,
  grabs frame `t`, screenshots the preview seeked to `t`, and pixel-diffs within a
  tolerance. Same discipline as PB-006.

To maximize fidelity: render the preview iframe at the composition's **native
`data-width` × `data-height`** (scale the container with CSS `transform`), wait
for fonts/assets before enabling scrub, and drive the preview **only** via
`window.__timelines` seek.

## Data Flow

1. Create Demo → `HttpGenerationClient` → job completes → app holds
   `{ jobId, artifacts }`.
2. `CompositionPreview` loads `composition-index`; adapter reads
   `window.__timelines`.
3. `CompositionTimeline` renders; user selects a range/clip.
4. "+ Add to chat" → `ChatContextRef` (with thumbnail) added to composer.
5. Send → `editComposition(jobId, { instruction, context })` → new revision.
6. Preview hot-reloads to the revision; user Accept / Reject / Undo.
7. Export uses the current revision's `output-video`.

## Error Handling

- **Job / edit failure**: surfaced in chat with the real error + retry (reuse
  existing patterns).
- **Missing `window.__timelines`**: degrade to `<video>` + range-only; quiet
  diagnostic.
- **Long re-render**: cancelable "drafting / rendering…" state with expectations;
  matches the generation long-job UX.
- **Iframe load / security error**: calm placeholder, retry.
- **Reject / Undo**: always restores a prior good revision; never lose the user's
  current composition.

## Security

- The generated `index.html` is AI-generated code. It runs only on the **loopback
  origin** for the user who generated it, and Person A's `validateHyperframesArtifacts`
  enforces forbidden-file rules before a job completes (existing posture).
- The preview iframe is sandboxed to the minimum required to run GSAP (scripts
  allowed; isolated from the parent app's storage/origin). It is never given the
  parent app's privileges.
- Artifact URLs are served by Person A's path-traversal-hardened artifacts route.

## Testing

- **Adapter**: against a fixture `index.html` exposing `window.__timelines`
  (clips, labels, duration) — `getDuration/getLabels/getClips/seek/captureThumbnail`.
- **Timeline**: range selection, clip selection, flat-fallback.
- **Context chips**: ref creation from selection, removal, thumbnail presence.
- **Edit flow (stub)**: revision applied, Accept keeps, Reject reverts, Undo pops.
- **Graceful degrade**: missing `window.__timelines` → video fallback.
- **Parity guardrail (recommended)**: render sample, diff a frame vs preview seek.

## Phasing / Milestones

| Phase | Deliverable | Person A dependency |
|-------|-------------|---------------------|
| **0** | Generation wiring: Vite proxy, `HttpGenerationClient`, `ai-url-planning` request, long-job UX → a real composition opens | none |
| **1** | `CompositionPreview` + adapter + `CompositionTimeline` (scrubber, playhead, range select) | none |
| **2** | Context chips + chat rework + `MockCompositionEditClient` → full loop on fake edits | none |
| **3** | **Build the real `/edits` endpoint** in `apps/api` (compose `createOpencodeHyperframesRepairer` + `runHyperframesRender`) + `revisions` schema + `HttpCompositionEditClient` | Person A **review** (not build) |
| **4** | Clip selection via scene-structure lint (each scene = a named nested timeline) | Person A **generator change** — small joint PR |

Each phase is independently demoable. Phases 0–3 are Person B build; Phase 4
touches Person A's generator (a small reviewed change). Range selection works
without Phase 4; clips light up once it lands. The agent CLI must be configured for
Phase 3 edits to run for real — the mock double covers everything before that.

## Person A (Samuel) Review Items

Person B builds the edit endpoint by composing Person A's exports, so the handoff
is now **review**, not build. See `docs/person-a-composition-edit-contract.md`:

1. **Edit prompt** — Person B adds a user-instruction variant of the repair prompt
   (`buildRepairPrompt`). Person A reviews that it scopes edits sensibly to the
   given range/clip and respects the composition contract (`window.__timelines`,
   forbidden files).
2. **`revisions` / `currentRevisionId` schema change** to the job shape — a small
   isolated PR, reviewed by both per the repo's schema-change workflow.
3. **Scene-structure lint (Phase 4)** — each scene = a named nested timeline so
   clips are discoverable. This touches Person A's generator prompt + lint, so it
   is either Person A's change or a small Person-B PR he reviews. Not required for
   Phases 0–3.

## Licensing

- **Hyperframes** (`heygen-com/hyperframes`) — **Apache-2.0** (verified from the
  repo license file, © 2026 HeyGen Inc.). Use/modify/embed/redistribute allowed,
  including commercially. Obligations: include LICENSE + NOTICE on distribution;
  note modified files; retain notices.
- **GSAP `3.15.0`** (bundled inside every composition) — **Standard "no charge"
  license**. Free for commercial use, including formerly-paid plugins; AI-generated
  GSAP code is explicitly permitted.
  - ⚠️ Caveat: the license forbids using GSAP to build a **no-code visual
    animation builder that competes with Webflow**. Tinker's output is video and
    GSAP is an internal renderer detail, so this is very likely fine — but because
    Tinker lets users edit animations without code, get a one-line confirmation
    from GreenSock before any commercial launch. Add this to the
    `architecture.md` commercial-safe OSS policy.

## Risks & Tradeoffs

- **Edits need the agent CLI + are slow (~minutes, 30-min timeout).** Mitigation:
  the mock double covers fast iteration; the UI treats real edits as long jobs with
  honest progress + cancel.
- **Phase 3/4 touch shared + Person A areas.** Mitigation: the endpoint only
  consumes `@tinker/demo-assembly` public exports (no internal edits); the prompt,
  schema change, and scene-lint are explicitly flagged for Person A review.
- **Clip structure not guaranteed today.** Mitigation: range-only works without
  it; clips degrade gracefully until the lint rule lands.
- **Heavy-composition preview stutter.** Mitigation: seek instead of real-time
  play for previews; the export is always smooth.
- **Re-render latency per edit.** Mitigation: honest progress UX; the live preview
  hot-reloads as soon as the revision is ready.

## Success Criteria

- A generated demo opens as a live, scrubbable composition with an accurate timeline.
- A user can select a range (and a clip, once structured) and add it to chat.
- A user can ask for an edit, preview the rewritten composition, and Accept / Reject / Undo.
- Export produces the current revision's mp4.
- Swapping the stub for the real endpoint requires no UI changes.
