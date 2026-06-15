# Composition AI Editing — Phase 2: Editor shell + AI chat-edit loop

## Status

Draft design, approved for implementation planning. Person B owned.

This is the **Phase 2** slice of the parent design
`docs/superpowers/specs/2026-06-13-composition-ai-edit-design.md`. Phases 0–1e
(generation client, composition preview, timeline read, scrub) are merged to
`main` (PRs #18–#21). This spec covers the next slice: dressing the composition
editor in the proven porcelain shell and adding the conversational edit loop on a
**mock** edit client — no Person A dependency.

## Background — why the editor looks unfinished today

Two editors exist in the app and share **no layout code**:

- **Legacy `EditorScreen`** (`apps/web/src/screens/Editor/EditorScreen.tsx`, ~1,140
  lines) — the fully-designed porcelain editor that matches the `videoeditor.png` /
  `design/porcelainnew.html` reference: top app bar, floating tool-rail, dark
  preview stage, playback bar, right-side tabbed panel (Chat/Zoom/Cursor/Frame),
  export bottom-sheet. **Every panel is bound to the `DemoProject` operations model**
  (`add_zoom`, `remove_entity`, cursor settings) and to `@tinker/ai-edit-ui`.
- **`CompositionEditorScreen`** (`apps/web/src/screens/CompositionEditor/`, ~56
  lines) — a deliberately minimal Phase 1 surface: only `CompositionPreview` (live
  iframe) + `CompositionTimeline` (clips, playhead). No shell, no chat, no playback
  bar.

The composition editor inherited the porcelain **design tokens** but **not the
layout shell**, because that shell was welded to the legacy `DemoProject` model.
Phase 1 intentionally built only the new, risky mechanics (reading a live GSAP
timeline out of a sandboxed iframe and scrubbing it). Phase 2 fills the rest.

## Goal

Make the composition editor look like the `videoeditor.png` reference **and** carry
the AI chat-edit loop:

1. Rebuild `CompositionEditorScreen` inside the legacy porcelain shell — app bar,
   preview stage, working playback bar, bottom timeline, right-side panel.
2. The right panel is the **AI chat only**: composer ("Ask Tinker to edit the
   demo…") + context chips + Accept/Reject/Undo.
3. Select a **range** (drag) or a **clip** (click) and add it to chat as a chip.
4. Send instruction + chips → a new composition **revision** (mock) → preview
   hot-reloads → Accept / Reject / Undo over a client-side revision stack.

## Non-Goals

- **No Zoom/Cursor/Frame tabs, no tool-rail.** The composition model retired
  structured per-entity editing; the right panel is Chat-only. (Decision: "Chat-only
  panel".)
- **No deletion of the legacy editor.** `EditorScreen`, `@tinker/ai-edit-ui`,
  `DemoProject`, and `@tinker/demo-assembly` stay untouched — the legacy editor is
  our visual reference, and Playwright jobs still use `DemoProject` as their
  canonical editable state.
- **No routing change yet.** "Generate" still routes to the legacy editor; the
  composition editor stays on its own ("beta") route. Promoting composition to the
  primary flow is a tiny follow-up after Phase 2 reaches parity.
- **No real edit endpoint.** Phase 2 runs on `MockCompositionEditClient`. The real
  `POST /api/jobs/:id/edits` (composing Person A's exports) is Phase 3.
- **No thumbnails on chips** (text-only chips for now); **no Export wiring** (the
  app-bar Export button is a stub/placeholder in 2a).
- No clip-structure lint dependency (Phase 4). Range selection works regardless;
  clips already light up from Phase 1.

## Approach — reuse the shell, refill the slots

The legacy shell's **layout is model-agnostic** (`grid: 52px / [1fr 284px]`, with the
left column split stage / playback / timeline). Only the *panels inside it* were
`DemoProject`-bound. Phase 2 lifts the porcelain chrome and re-fills the slots with
composition-aware components. The legacy `EditorScreen` is copied from, never
imported or mutated.

## Slicing — 2a then 2b (each independently demoable)

### Phase 2a — Shell + selection (the "look like videoeditor.png" half)

Rebuild `CompositionEditorScreen` in the porcelain shell, **no AI yet**:

- **App bar** — Tinker Studio wordmark · (Preview) · Export (stub). Back/exit.
- **Preview stage** — dark rounded stage housing `CompositionPreview` (existing).
- **Playback bar** — play/pause + scrub via a `requestAnimationFrame` loop that
  advances `currentTime` **state**, which `CompositionPreview` seeks to (declarative,
  via its existing `currentTime`-keyed effect — there is no imperative `preview.seek`
  drive path; identical to the legacy `Preview`). prev/next jump between
  `model.clips` boundaries; **for a flat composition (zero clips) prev/next disable
  or fall back to 0 / duration**. Timecode `m:ss.s / m:ss.s`. Reuse `formatTimecode`
  by **extracting it to a shared util** (e.g. `packages/editor/src/timeline/`) rather
  than copying the private one in `EditorScreen.tsx`.
- **Timeline** — existing `CompositionTimeline` (click-clip, click-seek) **plus
  drag-to-select a range** (deferred from Phase 1c): a drag paints a selection band
  and emits a range `Selection`. **Click/drag disambiguation:** replace the current
  `onClick` seek (`CompositionTimeline.tsx` `handleTrackClick`) with
  pointer/mouse down→move→up handlers — sub-threshold movement = a click (seek), a
  supra-threshold drag = a range selection — so a drag does not spuriously seek to
  the mouseup point. The existing click-seek and click-clip tests must stay green
  under the new handler.
- **Right Chat panel frame** — composer + chips area + (disabled) send. Selecting a
  range/clip and pressing **"+ Add to chat"** creates a removable **context chip**.
  No send/edit yet.

*Demo:* looks like `videoeditor.png`; play/scrub works; select a range or clip;
stage chips in the composer.

### Phase 2b — The mock edit loop (the AI half)

- **`MockCompositionEditClient`** — deterministic dev/test double mirroring the
  existing `mockCompositionGenerationClient` split. `editComposition(jobId, {
  instruction, context })` returns a new **revision** (reuses current artifacts with
  a new `revisionId`), emitting a non-terminal update before the terminal one.
- **`useCompositionEditFlow`** — sends `{ jobId, instruction, context }`, receives a
  revision, drives the preview to it, and exposes **Accept / Reject / Undo** over a
  **client-side revision stack** (the parent spec's revision model).
- **Chat panel becomes live** — send instruction + chips; show a "drafting…" state;
  on completion, the preview hot-reloads to the revision and the panel offers
  Accept / Reject; Undo pops the stack to the prior revision.

*Demo:* the full conversational edit loop on deterministic fake edits.

## Components & data shapes

**Type homes (resolves where each type is defined/exported):**

- **`Selection`** = `{ kind: "range"; start; end }` | `{ kind: "clip"; clipId;
  label?; start; end }`. **Defined in and exported from `packages/editor`** (added to
  `packages/editor/src/index.ts`, alongside `CompositionClip`), because
  `CompositionTimeline` emits it.
- **`ChatContextRef`** = `{ id; kind: "range" | "clip"; start; end; clipId?;
  label? }` — built from a `Selection` on "+ Add to chat". Multiple allowed.
  **Defined in `apps/web/src/lib/`** (NOT `@tinker/ai-edit-ui`).
- **`CompositionEditRequest`** = `{ jobId; instruction; context: ChatContextRef[] }`
  (an empty `context` means "edit the whole composition") — matches the body in
  `docs/person-a-composition-edit-contract.md`. **Defined in `apps/web/src/lib/`.**
- **`Revision`** = a **new client-side type** in `apps/web/src/lib/`, e.g.
  `{ id: string; artifacts: ApiArtifact[] }` (or the resolved
  `compositionIndexUrl` / `outputVideoUrl`). It is **NOT** an extension of
  `ApiGenerationJob` — that schema is `.strict()` (`packages/generation-contract`)
  and its `revisions` / `currentRevisionId` fields are the Phase-3,
  Person-A-reviewed change. **Phase 2 does not modify `@tinker/generation-contract`.**
- **Revision stack** — client-managed: `revisions: Revision[]`, `currentIndex`.
  Accept pushes; Reject discards the previewed revision; Undo decrements. The server
  (later) retains every revision's artifacts; Accept/Reject/Undo is a client-side
  pointer.

> **Note (resolves a parent-spec divergence):** the parent design placed
> `ChatContextRef` / `useCompositionEditFlow` in `packages/ai-edit-ui`. This slice
> deliberately does **not** touch `@tinker/ai-edit-ui` (it is legacy,
> `DemoProject`-bound). The composition-edit types and hook live in
> `apps/web/src/lib/` instead, with `Selection` in `packages/editor`.

## Data flow

1. Composition editor holds `{ jobId, artifacts }` from generation (Phase 1e).
2. `CompositionPreview` loads `composition-index`; the timeline reads
   `window.__timelines`; playback bar scrubs it.
3. User drag-selects a range or clicks a clip → `Selection`.
4. "+ Add to chat" → `ChatContextRef` chip in the composer.
5. Send → `editComposition(jobId, { instruction, context })` → new revision (mock).
6. Preview hot-reloads to the revision; user Accept / Reject / Undo.

## Packaging (non-destructive)

- **Components** (shell pieces, chat panel, chips, timeline drag-select) live with
  the rest of the composition code: `packages/editor/src/composition/` and
  `apps/web/src/screens/CompositionEditor/`.
- **Mock edit client + flow hook + the `ChatContextRef`/`CompositionEditRequest`/
  `Revision` types** live in `apps/web/src/lib/`, mirroring where Phase 0/1 put
  `mockCompositionGenerationClient` and `useCompositionGenerationJob`.
- **`Selection`** is exported from `@tinker/editor` (`packages/editor/src/index.ts`);
  new screen components are imported directly (no `CompositionEditor/` barrel, as
  today).
- **`@tinker/ai-edit-ui`, `EditorScreen`, `DemoProject`, `@tinker/demo-assembly` are
  not imported, edited, or deleted.** Legacy tests stay green untouched.

## Error handling

- **Edit failure** — surfaced in chat with the real error + retry (reuse Phase 1e
  patterns).
- **Long draft/render** — cancelable "drafting…" state with honest expectations
  (matches generation long-job UX); mock resolves fast.
- **Reject / Undo** — always restore a prior good revision; never lose the current
  composition.
- **Missing `window.__timelines`** — already handled in Phase 1 (video fallback,
  range-only); unchanged here.

## Testing

- **Timeline drag-select** — a drag emits the right `[start, end]`; band renders;
  click-clip and click-seek still work.
- **Context chips** — ref creation from a range and from a clip; removal; multiple.
- **Playback** — rAF advances `currentTime` and seeks the preview; pause stops;
  prev/next snap to clip boundaries; cleanup on unmount.
- **Mock edit flow** — revision applied; Accept keeps; Reject reverts; Undo pops;
  abort/cancel mid-draft.
- **Non-destructive** — legacy `EditorScreen` / `ai-edit-ui` tests unchanged and
  green.

## Seam-readiness

Swapping `MockCompositionEditClient` for the real `HttpCompositionEditClient`
(Phase 3, `POST /api/jobs/:id/edits`, needs Person A review) requires **no UI
change** — the editor talks only to the client interface + the flow hook.

## Success criteria

- The composition editor visually matches the `videoeditor.png` porcelain shell
  (app bar, preview stage, playback bar, timeline, right Chat panel).
- Play/scrub the live composition; select a range or clip; add it to chat as a chip.
- Ask for an edit, preview the (mock) rewritten composition, Accept / Reject / Undo.
- The legacy editor and all `DemoProject` code remain untouched and green.
