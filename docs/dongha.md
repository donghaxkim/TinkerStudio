# Dongha Checklist

Person B checklist for building the editor, AI edit UX, and export side of **Tinker / Screen Studio for agents**.

## Current status

Person B core MVP is implemented, verified, reviewed, and signed off on the integration branch.

Working now:

- web app scaffold with Create Demo and Editor screens
- sample `DemoProject` load/validation
- timeline, preview, selected range, and AI edit mock flow
- project save/load/download for validated `DemoProject` JSON
- export planning plus Node ffmpeg MP4 renderer for real source media, cursor/click effects, static camera transforms, ffprobe verification, and observable export job state
- deterministic browser/export asset resolution with local export preflight
- MVP security hardening for project JSON size/schema validation, export output roots, argv-only renderer execution, user-facing path redaction, and generated-string injection safety
- edge-case regression fixtures for schema validation, render planning, and structured export-preflight failures
- generation contract and mock Create Demo integration
- MVP manual controls for zooms and clip trims
- backend motion logic core for cursor telemetry, auto-zoom suggestions, and camera transforms
- unit/component tests across editor, motion, AI edit UI, rendering, persistence, generation contract, and web app

Next step:

- Use `docs/core-mvp-checklist.md` as the current Linear-style MVP execution checklist.
- MVP-010 final signoff is complete; all P0 Person B core MVP checklist items are done.
- Keep Create Demo UI polish separate from backend export/state/security work to avoid merge conflicts.
- Post-core focus is Settings/navigation cleanup, manual editing polish, and the schema review checkpoint.

## Role

You are **Person B**.

You own:

```text
DemoProject -> editor -> manual edits -> AI edit operations -> export
```

Owned areas:

```text
/apps/web
/apps/desktop
/packages/editor
/packages/ai-edit-ui
/packages/rendering
```

Do not casually edit Person A's generation/capture internals:

```text
/packages/product-ingestion
/packages/ai-generator
/packages/capture
```

Shared contract areas require coordination/review:

```text
/packages/project-schema
/packages/generation-contract
/apps/api
```

---

## 0. Local setup

- [x] Install/use Node from `.node-version`:
  - required: `22.22.3`
- [x] Enable/install pnpm declared in `package.json`:
  - required: `pnpm@10.33.0`
- [x] Run install:
  - `pnpm install`
- [x] Verify schema package works:
  - `pnpm validate:schema`
  - `pnpm typecheck`
- [x] Confirm `main` stays runnable before starting feature work.
- [x] Create your working branch:
  - `person-b/web-editor`

---

## 1. Understand the source of truth

- [x] Read `docs/vision.md`.
- [x] Read `docs/architecture.md`.
- [x] Read `packages/project-schema/README.md`.
- [x] Read `packages/project-schema/src/validators.ts`.
- [x] Read `packages/project-schema/fixtures/demo-project.sample.json`.
- [x] Internalize the core rule:
  - `DemoProject` is the product state.
  - MP4 is only an export artifact.
- [x] Do not build a generic video editor.
- [x] Keep V1 demo-specific:
  - trim
  - zooms
  - cursor/click effects
  - backgrounds
  - aspect ratio
  - export
- [x] Remove captions, callouts, text rendering, and audio/voiceover timeline from MVP scope.

---

## 2. Shared schema sanity checks

- [x] Confirm `DemoProject` has everything the editor needs for Milestone 1.
- [x] Confirm `Asset`, `Track`, and `Clip` are enough for timeline rendering.
- [x] Confirm clips, zooms, and cursor events can be previewed from the sample fixture.
- [x] Check if editor needs extra fields before adding them.
- [ ] If schema changes are needed:
  - [x] Make a small isolated PR.
  - [x] Update validators.
  - [x] Update TS types.
  - [x] Update sample fixture.
  - [x] Run `pnpm validate:schema`.
  - [x] Run `pnpm typecheck`.
  - [ ] Ask Person A to review.

---

## 3. Workspace/app scaffolding

- [x] Add apps to `pnpm-workspace.yaml` if app package manifests are added:

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

- [x] Create `apps/web/package.json`.
- [x] Pick a boring web stack for V1:
  - React
  - Vite
  - TypeScript
- [x] Add `apps/web/src` app entrypoint files.
- [x] Add scripts:
  - `dev`
  - `build`
  - `typecheck`
- [x] Make root `pnpm -r typecheck` include the web app.
- [x] Keep Electron untouched until the web/editor loop works.

---

## 4. Milestone 1: Manual project to editor/export

Goal:

> Load a hand-written `DemoProject`, show it in an editor, support basic edits, and export.

Use this fixture first:

```text
packages/project-schema/fixtures/demo-project.sample.json
```

### Project loading

- [x] Load the sample `DemoProject` in the web app.
- [x] Validate it with `DemoProjectSchema` before rendering.
- [x] Display project metadata:
  - title
  - duration
  - fps
  - aspect ratio
  - asset count
  - track count
- [x] Show validation errors clearly if the project is invalid.

### Timeline v0

- [x] Create a timeline package/module under `packages/editor/src/timeline`.
- [x] Render tracks from `project.tracks`.
- [x] Render clips as time-based bars.
- [x] Render zooms as overlay rows.
- [x] Remove caption/callout rows from MVP timeline model and tests.
- [x] Add current-time playhead state.
- [x] Add click-to-seek.
- [x] Add selected range state:
  - start time
  - end time
- [x] Make range selection visible.

### Preview v0

- [x] Create preview module under `packages/editor/src/preview`.
- [x] Render video assets where possible.
- [x] Show current time.
- [x] Apply active zoom metadata visually enough to prove the model.
- [x] Show cursor/click events if present.
- [x] Remove caption/callout/text overlay preview code and tests.

### Manual edits v0

- [x] Add zoom create/edit/delete.
- [x] Add clip trim editing if practical for V1.
- [x] Validate the whole project after each edit.
- [x] Keep edits immutable: return a new `DemoProject`, do not mutate in place.
- [x] Push manual edit commands into editor undo/redo history.
- [x] Remove caption/callout manual edit operations and controls from MVP.
- [ ] Replace prototype manual-control defaults with item-aware property editing.
- [ ] Add manual controls for cursor/click effect settings after motion integration.

---

## 5. AI edit operation applier

Primary file:

```text
packages/editor/src/applyEditOperations.ts
```

- [x] Implement legacy operation application for:
  - `add_zoom`
  - `remove_entity`
- [x] Remove `add_caption`, `add_callout`, and caption/callout removal from AI edit operations.
- [x] Generate stable IDs for inserted entities.
- [x] Preserve existing project fields.
- [x] Update `updatedAt` after accepted edits.
- [x] Append accepted edits to `aiEditHistory`.
- [x] Validate result with `DemoProjectSchema`.
- [x] Return errors instead of silently producing invalid projects.
- [x] Add tests for each operation type.
- [x] Add tests for invalid ranges.
- [x] Add tests for removing unknown IDs.
- [x] Add tests that operations cannot create invalid project duration ranges.

---

## 6. AI edit UX

Goal:

> Cursor-for-video over selected timeline ranges.

- [x] Add selected timeline range context to the editor state.
- [x] Add AI chat side panel.
- [x] Pass selected range, clips, zooms, cursor events, and project slice into the chat request.
- [x] Remove caption/callout context from AI edit prompts and previews.
- [x] For first version, allow hardcoded/mock operation responses.
- [x] Show proposed operations before applying.
- [x] Let user accept/reject proposed operations.
- [x] On accept:
  - apply operations
  - validate project
  - append `aiEditHistory`
- [x] On reject:
  - preserve project unchanged
  - mark proposal rejected if stored
- [x] Make all AI edits undoable or at least reversible from history.

---

## 7. Generation contract integration

Shared package:

```text
/packages/generation-contract
```

Needed by Create Demo UI and progress UI.

- [x] Define/check `CreateDemoRequest`.
- [x] Define/check `GenerationJob`.
- [x] Define/check `GenerationStatus`.
- [x] Define/check `GenerationResult`.
- [x] Define progress event types.
- [x] Build Create Demo screen fields:
  - GitHub repo URL
  - product URL/local app URL
  - prompt
  - duration cap
  - aspect ratio
- [x] Remove optional narration style from MVP Create Demo UI and generation request copy.
- [x] Submit create-demo request through the contract, not Person A internals.
- [x] Render generation progress states.
- [x] Load generated `DemoProject` into editor when the job completes.

---

## 8. Project persistence

- [x] Add project save/load behavior.
- [x] Decide where local web prototype stores projects:
  - local file picker
  - browser local storage only for temporary prototype
- [x] Save full `DemoProject` JSON.
- [x] Validate loaded project before opening.
- [x] Show validation errors in UI.
- [x] Keep asset references by `asset.id`, not duplicated paths.

---

## 9. Rendering/export

Owned packages:

```text
/packages/rendering
/packages/editor/src/export
```

- [x] Implement `renderPreview.ts` for editor preview composition.
- [x] Implement `renderFinal.ts` for final export composition.
- [x] Decide early export approach:
  - ffmpeg
  - canvas capture
  - HyperFrames
  - another license-safe renderer
- [x] Preserve schema semantics in export:
  - tracks
  - clips
  - trims
  - zooms
  - cursor/click effects
  - aspect ratio
- [x] Export MP4 from the current `DemoProject` state.
- [x] Verify exported MP4 probes as playable MP4 with a video stream.
- [x] Verify edits affect the export plan/filter graph.
- [x] Preflight export source video assets against an explicit project root before invoking ffmpeg.
- [x] Reject missing, remote, malformed, traversal, type-mismatched, and MIME-mismatched export assets with structured errors.
- [x] Replace placeholder ffmpeg drawbox output with real media/cursor/camera rendering.
- [x] Use motion-core camera transforms in export.
- [x] Use source media assets in export.
- [x] Remove caption/callout/text render layers from MVP export.
- [x] Do not make AI directly mutate video files.

---

## 10. App screens

### Create Demo

Path:

```text
apps/web/src/screens/CreateDemo
```

- [x] Form for repo URL.
- [x] Form for product/local app URL.
- [x] Prompt field.
- [x] Duration field.
- [x] Aspect ratio selector.
- [x] Remove optional narration style field from MVP UI.
- [x] Submit button.
- [x] Progress display.
- [x] Open editor when generation returns a project.

### Editor

Path:

```text
apps/web/src/screens/Editor
```

- [x] Project loader.
- [x] Timeline.
- [x] Preview.
- [x] Properties panel for selected item/range.
- [x] AI chat side panel.
- [x] Export button.
- [x] Save button.

### Settings

Path:

```text
apps/web/src/screens/Settings
```

- [x] Keep minimal for V1.
- [x] Add local prototype storage reset.
- [ ] Mount settings in app navigation once the redesigned shell is settled.
- [ ] Add API/local worker configuration only when the real worker exists.

---

## 11. Testing checklist

- [x] Add unit tests for `applyEditOperations.ts`.
- [x] Add validation tests around `DemoProjectSchema` if schema changes.
- [x] Add component tests for timeline rendering if test stack exists.
- [x] Add component tests for preview overlays if test stack exists.
- [x] Add smoke test for loading `demo-project.sample.json`.
- [x] Add smoke test for accepting an AI edit operation.
- [x] Add smoke test for export once export exists.
- [x] Add tests for manual edit controls.
- [x] Add tests for settings reset.
- [x] Add tests for MP4 artifact probing.
- [x] Add tests for motion-core cursor telemetry, auto-zoom suggestions, and camera transforms.
- [x] Always run before claiming done:
  - `pnpm validate:schema`
  - `pnpm typecheck`
  - relevant package tests
  - relevant app build

---

## 12. Git workflow

- [x] Work on branch:
  - `person-b/web-editor`
- [x] Keep `main` runnable.
- [x] Make small PRs.
- [x] Commit after coherent chunks.
- [x] Keep schema PRs isolated.
- [x] Do not mix schema changes with large editor changes.
- [ ] Ask Person A to review schema/contract changes.
- [ ] Review Person A schema changes before relying on them.

Suggested PR sequence:

- [x] PR 1: web app scaffold + workspace config.
- [x] PR 2: load/validate sample project.
- [x] PR 3: timeline v0.
- [x] PR 4: preview v0.
- [x] PR 5: edit operation applier + tests.
- [x] PR 6: AI edit side panel mock flow.
- [x] PR 7: save/load project.
- [x] PR 8: export v0.
- [x] PR 9: generation-contract Create Demo integration.
- [x] PR 10: manual edit controls, settings, fixtures, export verification, app metadata.
- [x] PR 11: motion logic core utilities and tests.
- [x] PR 12: motion-core preview integration.
- [x] PR 13: real render/export pipeline.

---

## 13. Licensing/commercial safety

Safe references/foundations mentioned in architecture:

- [x] `microsoft/playwright` — Apache-2.0
- [x] `browserbase/stagehand` — MIT
- [x] `vercel-labs/webreel` — Apache-2.0
- [x] `heygen-com/hyperframes` — Apache-2.0
- [x] `walterlow/freecut` — MIT
- [x] `farzaa/clicky` / `jasonkneen/openclicky` — MIT

Use as inspiration only unless license is clarified:

- [x] `CristianOlivera1/openvid` — PolyForm Noncommercial; do not fork/copy for commercial product.
- [x] `designcombo/react-video-editor` — no detected license.
- [x] `heygen-com/website-to-hyperframes-demo` — no detected license.
- [x] `remotion-dev/remotion` — commercial-license considerations.

---

## 14. Definition of done for Person B MVP

- [x] A valid `DemoProject` can be loaded.
- [x] The project can be viewed in an editor.
- [x] Timeline displays tracks/clips/overlays.
- [x] Preview reflects zooms and cursor events at v0 level.
- [x] User can make at least one manual edit.
- [x] AI edit operations can be previewed and accepted/rejected.
- [x] Accepted AI edits mutate `DemoProject`, not video files.
- [x] Edited project can be saved.
- [x] Current project can be exported to MP4.
- [x] Export reflects editor state at v0 smoke-test/filter-graph level.
- [x] Export faithfully renders source media, cursor, click effects, and camera motion at MVP-005 static-camera fidelity.
- [x] Typecheck passes.
- [x] Relevant tests pass.

---

## 15. Current repo gaps to remember

Resolved old gaps:

- [x] `packages/editor/src/applyEditOperations.ts` is implemented.
- [x] `packages/rendering/src/renderPreview.ts` is implemented.
- [x] `packages/rendering/src/renderFinal.ts` is implemented.
- [x] `packages/generation-contract/src/*.ts` are implemented.
- [x] `/packages/ai-edit-ui` exists.
- [x] `/apps/web` has real Create Demo and Editor screens.

Recently resolved fixture/doc gaps:

- [x] `docs/prd.md` is filled with the MVP product requirements.
- [x] `packages/project-schema/fixtures/storyboard.sample.json` is filled.
- [x] `packages/project-schema/fixtures/capture-result.sample.json` is filled.
- [x] `packages/editor/src/manualEditOperations.ts` exists and is wired to the editor.
- [x] `packages/editor/src/motion/*` exists with pure motion utilities and tests.
- [x] `packages/rendering/src/node/probeMp4Artifact.ts` exists and is used by the sample render CLI.
- [x] The ffmpeg export renderer now renders real source media, cursor effects, and MVP-005 static camera motion.
- [x] `packages/rendering/src/node/exportJob.ts` exists with observable export phases, snapshot safety, validation/render/probe failure state, and same-output concurrency guards.

Remaining gaps:

- [x] MVP-009 animated/cursor-follow export parity is implemented, verified, and reviewed.
- [ ] Timeline UI polish, manual cursor/click controls, and AI edit suggestion polish still need work after core MVP signoff.
- [ ] `apps/web/src/screens/Settings/SettingsScreen.tsx` exists but is not mounted in `App`.
- [ ] `/apps/desktop` is placeholder-only and should wait until the web loop works.

---

## 16. Motion logic core

Goal:

> Replace scratch-built cursor/zoom math with proven, pure backend logic before wiring it into UI/export.

Source design:

```text
docs/superpowers/specs/2026-06-10-motion-logic-core-design.md
```

- [x] Keep `DemoProject` schema stable for the first motion slice.
- [x] Add `packages/editor/src/motion/cursorTelemetry.ts`.
- [x] Normalize cursor events into sorted, clamped frame-relative telemetry.
- [x] Add deterministic cursor interpolation and smoothing.
- [x] Add `packages/editor/src/motion/autoZoomSuggestions.ts`.
- [x] Detect sustained cursor dwell candidates.
- [x] Generate deterministic auto-zoom suggestions that avoid existing zoom windows.
- [x] Add `packages/editor/src/motion/cameraTransform.ts`.
- [x] Normalize zoom keyframes into camera regions.
- [x] Resolve deterministic camera transforms by timestamp.
- [x] Add cursor-follow focus behavior with safe-zone recentering.
- [x] Freeze cursor-follow focus during zoom-out.
- [x] Export motion utilities from `@tinker/editor`.
- [x] Add unit tests for motion-core behavior.
- [x] Wire auto-zoom suggestions into the editor as proposed manual/AI operations.
- [x] Wire camera transforms into preview rendering.
- [x] Wire camera transforms into final MP4 export.
- [ ] Decide whether motion data needs first-class schema fields after preview/export integration proves the model.

---

## 17. Most optimal next steps for Person B

Work in this order unless a branch conflict forces a smaller slice:

1. [x] **Motion preview integration**: make `Preview` consume `normalizeCursorTelemetry`, `smoothCursorTelemetry`, `normalizeZoomRegions`, and `resolveCameraTransformWithCursorFollow`. This makes the new backend logic visible without changing schema.
2. [x] **Auto-zoom suggestion flow**: add a controlled action that proposes zooms from cursor dwell and applies them through existing manual edit/history paths.
3. [x] **Real export renderer plan/spec**: choose the next renderer architecture before coding.
4. [x] **Export render fidelity v1**: render real source media, cursor effects, and motion-core camera transforms.
5. [x] **Export job state machine**: make export phases observable, snapshot-safe, and error-specific.
6. [x] **Security audit pass**: lock down project loading, asset roots, argv-only ffmpeg/probe execution, output paths, and user-facing error redaction.
7. [x] **Edge-case regression fixture suite**: cover ugly project states before users hit them.
8. [x] **Preview/export parity checks**: add frame-sampled animated ramp/easing parity and cursor-follow export parity.
9. [ ] **Settings/navigation cleanup**: mount the Settings screen once the Create Demo/editor shell redesign settles.
10. [ ] **Manual editing polish**: replace prototype controls with item-aware properties, direct selected-item editing, and safer trim UX.
11. [ ] **Schema review checkpoint**: after preview/export use motion-core successfully, decide with Person A whether to promote richer motion data into `packages/project-schema`.
