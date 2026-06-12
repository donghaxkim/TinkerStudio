# Dongha / Person B Execution Board

> **For agentic workers:** this is the source-of-truth task board for Person B. Keep checkbox syntax intact. Do not start implementation from stale branches. Treat every unchecked ticket as a product-quality task, not a prototype task.

## Mission

Person B owns the end-to-end editable demo product loop:

```text
DemoProject
  -> web product shell
  -> editor preview
  -> manual edits
  -> AI edit proposals
  -> save/load
  -> MP4 export
  -> Person A generation handoff
```

The system does not need to scale to many users yet. It **does** need to feel correct, recoverable, and polished for one serious user running the product locally.

## Ownership

Person B owns:

```text
apps/web
apps/desktop
packages/editor
packages/ai-edit-ui
packages/rendering
```

Person B may touch these shared contract areas only with care and Person A review when behavior changes:

```text
packages/project-schema
packages/generation-contract
apps/api
```

Person B should not import or casually edit Person A internals:

```text
packages/product-ingestion
packages/ai-generator
packages/capture
```

## Non-Negotiable Product Rules

- [x] `DemoProject` is the source of truth.
- [x] MP4 files are export artifacts, not editable product state.
- [x] AI edits return structured operations; AI does not directly mutate video files.
- [x] V1 is web-first. Desktop stays placeholder-only until the web loop is excellent.
- [x] MVP scope excludes captions, callouts, text overlays, text rendering, voiceover, audio mixing, desktop automation, and generic video editing.
- [ ] The shipped web app must open into the real product workflow, not a placeholder.
- [ ] A single user must be able to recover from bad input, bad projects, missing assets, failed generation, and failed export without reading code.

## Current Truth

Audited on 2026-06-11 from `main` at `70b79c1`.

Completed foundation:

- [x] Core Person B MVP is implemented, verified, reviewed, and signed off in `docs/reports/mvp-010-final-gate.md`.
- [x] `docs/` was restored to `origin/main`.
- [x] Remote completed branches were cleaned up; `origin/main` is the only remaining remote branch.
- [x] Local checkout is back on `main` and tracks `origin/main`.
- [x] Create Demo, Editor, Settings, persistence, AI edit, manual edit, export, motion, schema validation, and rendering modules exist.
- [x] The core validation gate has passed previously:
  - `pnpm validate:schema`
  - `pnpm typecheck`
  - `pnpm -r test`
  - `pnpm --filter @tinker/web build`
  - `pnpm --filter @tinker/rendering render:sample -- /tmp/tinker-core-mvp-smoke.mp4`

Important remaining truth:

- [x] `apps/web/src/App.tsx` still needs to mount the actual Create Demo -> Editor -> Settings workflow on `main`. (Done in PB-001 on `person-b/product-shell`.)
- [x] `apps/web/src/screens/Settings/SettingsScreen.tsx` exists but is not mounted in the app shell. (Now reachable via the Editor; full Settings polish tracked in PB-009.)
- [ ] Manual edit controls still need item-aware polish beyond prototype defaults.
- [ ] Manual cursor/click effect controls still need a product surface.
- [ ] Person A needs a crisp integration contract and golden fixture proving his output can open in Person B's editor.
- [x] The dirty local worktree at `tinker-worktrees/ai-edit-operations` must be either salvaged into the new product-shell branch or intentionally discarded. (Discarded: changes were stale — referenced removed caption/callout scope and predate the Porcelain design system.)

## Critical Path

Do these in order unless a blocker forces a smaller slice:

1. [x] PB-000: Clean local working state and branch strategy.
2. [x] PB-001: Mount the end-to-end web product shell. (Incl. subtask PB-001a: Porcelain design-system foundation — tokens, `.tk-*` classes, fonts in `apps/web`.)
3. [x] PB-002: Lock the Person A -> Person B generation handoff.
4. [x] PB-003: Make Create Demo product-grade for one user.
5. [x] PB-004: Make the Editor product-grade for one user. (Subtasks PB-004a shell/layout/tabs + PB-004b Timeline/Preview restyle.)
6. [x] PB-005: Replace prototype manual editing with item-aware editing.
7. [x] PB-006: Add manual cursor/click controls. (Schema addition pending Person A sign-off — backward-compatible.)
8. [x] PB-007: Harden project lifecycle, save/load, and recovery.
9. [x] PB-008: Make export UX first-class.
10. [x] PB-009: Mount useful Settings.
11. [x] PB-010: Add Samuel integration harness and golden project fixture.
12. [x] PB-011: Final one-user acceptance gate.
13. [x] PB-012: Repo/product hygiene pass.

---

## Completed Core MVP Tickets

### DONE-001: Remove Non-MVP Text/Audio Scope

**Status:** Done
**Owner:** Person B
**Evidence:** `docs/core-mvp-checklist.md`, MVP-001

- [x] Removed captions/callouts/text/audio from MVP schema, UI, tests, preview, export, and AI edit flows.
- [x] Kept non-goal mentions only in docs/tests where useful.
- [x] Verified sample project loads without caption/callout/audio fields.

### DONE-002: Harden Asset Resolution

**Status:** Done
**Owner:** Person B
**Evidence:** `docs/core-mvp-checklist.md`, MVP-002

- [x] Browser preview asset resolution is deterministic.
- [x] Node/export asset resolution is deterministic.
- [x] Missing, malformed, traversal, remote, type-mismatched, and unsafe assets fail before export.
- [x] Preview shows placeholders rather than crashing.

### DONE-003: Motion Core, Preview, Auto-Zoom, And Export Parity

**Status:** Done
**Owner:** Person B
**Evidence:** `docs/core-mvp-checklist.md`, MVP-003, MVP-004, MVP-009

- [x] Cursor telemetry normalization and smoothing exist.
- [x] Zoom region normalization exists.
- [x] Camera transform resolution exists.
- [x] Preview uses motion-core calculations.
- [x] Export uses matching motion-core calculations.
- [x] Auto-zoom suggestions are deterministic, previewable, acceptable, rejectable, and undoable.
- [x] Preview/export parity tests cover camera transforms, animated ramps, easing, cursor follow, dimensions, duration, and stream presence.

### DONE-004: Real MP4 Export And Export State Machine

**Status:** Done
**Owner:** Person B
**Evidence:** `docs/core-mvp-checklist.md`, MVP-005, MVP-006

- [x] Export renders real source media, not placeholder drawboxes.
- [x] Export respects clip timing, source timing, aspect ratio, cursor/click effects, and camera motion.
- [x] Export freezes a validated project snapshot.
- [x] Export phases are observable: `idle`, `validating`, `rendering`, `probing`, `succeeded`, `failed`.
- [x] Export probes MP4 artifacts with ffprobe.
- [x] Concurrent exports cannot corrupt the same output path.

### DONE-005: Security, Fixtures, And Final MVP Gate

**Status:** Done
**Owner:** Person B
**Evidence:** `docs/core-mvp-checklist.md`, MVP-007, MVP-008, MVP-010

- [x] Project JSON is runtime-validated.
- [x] Oversized, unknown-version, unsafe, and invalid projects fail safely.
- [x] Renderer/probe commands pass argv arrays and do not use shell execution.
- [x] Output paths and asset paths are restricted.
- [x] Edge-case fixtures cover empty tracks, missing assets, invalid refs, aspect ratios, short/long projects, out-of-frame cursor events, duplicate timestamps, and invalid zoom targets.
- [x] Final core MVP gate report exists at `docs/reports/mvp-010-final-gate.md`.

---

## Remaining Staff-Level Tickets

### PB-000: Clean Local Working State And Branch Strategy

**Priority:** P0
**Owner:** Person B
**Status:** Done
**Goal:** Ensure all future work starts from current `main` and no stale branch or dirty worktree contaminates product-shell work.
**Active branch:** `person-b/product-shell` (off `main` at `70b79c1`). Remote switched to `donghaxkim/TinkerStudio.git`.

**Files/areas:**

```text
git branches
/Users/gimdongha/Desktop/tinker
/Users/gimdongha/Desktop/tinker-worktrees/ai-edit-operations
```

**Tasks:**

- [x] Confirm `/Users/gimdongha/Desktop/tinker` is on `main`.
- [x] Confirm `main` tracks `origin/main`.
- [x] Confirm `main` is at `70b79c1` or a later `origin/main` commit.
- [x] Inspect dirty files in `tinker-worktrees/ai-edit-operations`.
- [x] Decide whether the `ai-edit-operations` style/layout work is worth salvaging. (Not worth salvaging — stale, pre-design.)
- [x] If salvaging, cherry-pick or manually port only useful UI ideas onto a new branch from `main`. (N/A — not salvaged.)
- [x] If not salvaging, remove the local worktree and stale branch.
- [x] Delete stale local branch `codex/person-b-mvp-changes` after confirming no unique useful work remains.
- [x] Update the remote URL from moved repo `donghaxkim/tinker.git` to `donghaxkim/TinkerStudio.git`. (Verified HEAD matches `main`.)

**Done when:**

- [x] `git status --short --branch` is clean on `main` before feature work starts. (Work moved to `person-b/product-shell`; `main` untouched and clean.)
- [x] `git branch -vv` contains no stale Person B branches except an intentional active branch.
- [x] `git remote -v` points at the current GitHub repo location.

**Verification:**

```bash
git fetch origin --prune
git status --short --branch
git branch -vv
git remote -v
```

### PB-001: Mount The End-To-End Web Product Shell

**Priority:** P0
**Owner:** Person B
**Status:** Done
**Goal:** Replace the placeholder app root with a real local product flow: Create Demo -> Editor -> Settings -> back.
**Subtask PB-001a (done):** Ported the Porcelain design system (tokens as CSS vars, `.tk-*` component classes, Instrument Sans + IBM Plex Mono fonts) into `apps/web/src/styles.css` + `index.html` as the shared foundation for all screens.

**Files/areas:**

```text
apps/web/src/App.tsx
apps/web/src/App.test.tsx
apps/web/src/screens/CreateDemo/CreateDemoScreen.tsx
apps/web/src/screens/Editor/EditorScreen.tsx
apps/web/src/screens/Settings/SettingsScreen.tsx
apps/web/src/lib/mockGenerationClient.ts
apps/web/src/styles.css
```

**Tasks:**

- [x] Replace placeholder `App.tsx` with explicit app state or lightweight routing.
- [x] Add top-level navigation between `Create Demo`, `Editor`, and `Settings`.
- [x] Use `mockGenerationClient` as the local default generation client.
- [x] When Create Demo succeeds, pass the generated `DemoProject` into `EditorScreen`.
- [x] Keep sample project loading available when no generated project exists.
- [x] Add a clear route/state for returning from Editor to Create Demo.
- [x] Add a clear route/state for opening Settings.
- [x] Ensure navigation state does not erase an in-progress project unless the user explicitly loads/replaces it. (Added a "Return to editor" affordance + identity-asserting test.)
- [x] Add component tests for initial screen, successful generation opening Editor, Settings navigation, and returning to Create Demo.

**Done when:**

- [x] Opening the web app shows the actual workflow, not only `Tinker`.
- [x] A one-user happy path works in the browser: Create Demo mock success -> Editor -> Save/Export panels visible.
- [x] Settings is reachable.
- [x] Tests cover the app shell behavior. (51 web tests pass; build green.)

**Verification:**

```bash
pnpm --filter @tinker/web test
pnpm --filter @tinker/web build
```

### PB-002: Lock The Person A -> Person B Generation Handoff

**Priority:** P0
**Owner:** Person B with Person A review
**Status:** Done
**Note:** Generation contract types defined; handoff documented in `docs/person-a-handoff-contract.md`; golden fixture validates + opens in editor + tests prove the seam.
**Goal:** Give Samuel a precise contract: if Person A returns this shape, Person B's UI can open, edit, save, and export it.

**Files/areas:**

```text
packages/generation-contract/src
packages/project-schema/fixtures
apps/web/src/lib/generationClient.ts
apps/web/src/lib/mockGenerationClient.ts
docs/architecture.md
docs/prd.md
docs/dongha.md
```

**Tasks:**

- [x] Define accepted `CreateDemoRequest` modes in `packages/generation-contract`.
- [x] Define `GenerationJob` lifecycle types in `packages/generation-contract`.
- [x] Define `GenerationProgressEvent` phases in `packages/generation-contract`.
- [ ] Document the accepted `CreateDemoRequest` modes for Person A.
- [ ] Document the `GenerationJob` lifecycle the UI expects for Person A.
- [ ] Document the `GenerationProgressEvent` phases the UI renders for Person A.
- [ ] Document the exact success payload that must contain or point to a valid `DemoProject`.
- [ ] Add or identify one golden generated-project fixture that represents Samuel's expected output.
- [ ] Validate the golden fixture with `DemoProjectSchema`.
- [ ] Add a test proving the mock generation client returns the golden fixture.
- [ ] Add a test proving the generated fixture opens in the Editor.
- [ ] Add a short "Person A handoff contract" section to docs.
- [ ] Ask Person A to review any schema or generation-contract changes before relying on them.

**Done when:**

- [ ] Samuel can implement against the contract without reading Person B internals.
- [ ] Person B can run one command or test that proves Person A-shaped output opens in the editor.
- [ ] No Person B code imports Person A internals.

**Verification:**

```bash
pnpm validate:schema
pnpm --filter @tinker/generation-contract test
pnpm --filter @tinker/web test
```

### PB-003: Make Create Demo Product-Grade For One User

**Priority:** P0
**Owner:** Person B
**Status:** Done
**Goal:** Make Create Demo understandable, recoverable, and truthful for a local one-user MVP.
**Design note:** Rebuilt to match the provided Porcelain design (`design/createdemo.jsx`) exactly — a minimal "New demo" chat composer collecting a **repo** + a free-text **story prompt**. The design intentionally omits separate product-URL / duration / aspect-ratio fields; those are mapped to sensible defaults (`mode: manual-fixture`, `durationCapSeconds: 60`, `aspectRatio: 16:9`) and still validated through `CreateDemoRequestSchema`. The old form components (`CreateDemoForm`, `GenerationProgressPanel`, `useCreateDemoJob`, `GenerationErrorView`) were removed.

**Files/areas:**

```text
apps/web/src/screens/CreateDemo/CreateDemoForm.tsx
apps/web/src/screens/CreateDemo/CreateDemoScreen.tsx
apps/web/src/screens/CreateDemo/GenerationErrorView.tsx
apps/web/src/screens/CreateDemo/GenerationProgressPanel.tsx
apps/web/src/screens/CreateDemo/useCreateDemoJob.ts
apps/web/src/lib/generationClient.ts
apps/web/src/lib/mockGenerationClient.ts
```

**Tasks:**

- [x] Add repo URL field. (Repo paste row with verify spinner → green check, per design.)
- [x] Add product/local app URL field. (Superseded by design: defaulted, not a visible field.)
- [x] Add prompt field. (Story textarea with typewriter ghost prompts.)
- [x] Add duration cap field. (Superseded by design: defaulted to 60s.)
- [x] Add aspect ratio selector. (Superseded by design: defaulted to 16:9.)
- [x] Validate submitted request with `CreateDemoRequestSchema`.
- [x] Add field-level validation for repo URL, product URL, prompt, duration, and aspect ratio before submit. (Repo must parse to `owner/repo` + verify; prompt must be non-empty; defaulted fields always validate via schema.)
- [x] Show field-level errors without throwing. (Shake + focus on missing repo; send gating; graceful in-thread failure messages — all via `safeParse`, no throws.)
- [x] Disable submit while a generation job is submitting.
- [x] Show generation progress events. (Typing dots while the job runs.)
- [x] Preserve form input after failure so the user can edit and retry. (Repo and prompt are both restored on failure.)
- [x] Add a "Use sample project" path for local demos and recovery. (Quiet "or start from a sample project" link.)
- [x] Ensure copy does not promise captions, audio, desktop automation, or generic editing. (Verified — no forbidden terms in user-facing copy.)
- [x] Add tests for valid submit, invalid submit, running state, success state, failure state, retry state, and sample project path. (17 CreateDemo tests.)

**Done when:**

- [x] A first-time user knows what to paste and what will happen. (Hero + "Paste your repo, get the demo video." + ghost hints.)
- [x] Bad input never traps the user.
- [x] A failed generation can be retried without refreshing the app.

**Verification:**

```bash
pnpm --filter @tinker/web test -- CreateDemo
pnpm --filter @tinker/web build
```

### PB-004: Make The Editor Product-Grade For One User

**Priority:** P0
**Owner:** Person B
**Status:** Done
**Goal:** Convert the editor from a verified technical surface into a polished product surface a user can operate without docs.

**Files/areas:**

```text
apps/web/src/screens/Editor/EditorScreen.tsx
apps/web/src/screens/Editor/EditorManualControls.tsx
apps/web/src/screens/Editor/EditorAutoZoomPanel.tsx
apps/web/src/screens/Editor/ProjectLoadPanel.tsx
apps/web/src/screens/Editor/ProjectSaveLoadControls.tsx
apps/web/src/screens/Editor/ProjectExportPanel.tsx
packages/ai-edit-ui/src/AIEditPanel.tsx
packages/editor/src/timeline/Timeline.tsx
packages/editor/src/preview/Preview.tsx
apps/web/src/styles.css
```

**Design note:** Rebuilt to match `.design-ref/editor-reference.png` exactly, in two subtasks: **PB-004a** (apps/web — top app bar, 70/30 layout, deep-blue preview stage, floating tool rail, playback bar with a real rAF playback loop + timecode, right tabbed panel Chat/Zoom/Speed/Cursor/Frame) and **PB-004b** (packages/editor — Timeline restyled to warm clip track + mono ruler ticks + accent zoom lane + accent playhead/selection; Preview restyled to the deep-blue Porcelain stage). All prior wiring preserved. Verified live via screenshot vs the reference mock.

**Tasks:**

- [x] Make preview the primary visual area. (Large deep-blue stage dominates the left ~70%.)
- [x] Make timeline, selected range, manual controls, AI edits, save/load, and export visually distinct. (Restyled timeline, selection band, Zoom tab controls, Chat tab AI panel, save/load/export footer.)
- [x] Remove stale captions/callouts wording from any user-facing UI. (Grep clean.)
- [x] Make current time, selected range, and selected entity obvious. (Timecode in the playback bar + accent selection band; per-item entity selection is deepened in PB-005.)
- [x] Make undo/redo disabled states obvious. (Disabled icon buttons keyed to history past/future.)
- [x] Make AI proposal preview state visually obvious and reversible. (Accent-soft preview banner; accept/reject in the Chat panel; undo restores.)
- [x] Make empty/missing asset states calm and actionable. (Calm Porcelain placeholder on the stage; calm load-error card.)
- [x] Ensure all buttons have clear labels and do not rely on hidden knowledge. (aria-labels throughout; non-MVP tools disabled with reasons.)
- [x] Keep layout usable on a laptop viewport without overlapping text. (Verified at 1440px.)
- [x] Add or update component tests for the visible editor product states. (EditorScreen 11 tests; Timeline/Preview restyle tests.)

**Done when:**

- [x] A reviewer can complete the happy path without reading docs.
- [x] No user-facing UI references removed MVP scope.
- [x] The editor feels like a focused demo editor, not a generic video editor.

**Verification:**

```bash
pnpm --filter @tinker/web test -- Editor
pnpm --filter @tinker/web build
```

### PB-005: Replace Prototype Manual Editing With Item-Aware Editing

**Priority:** P0
**Owner:** Person B
**Status:** Done
**Goal:** Manual editing should edit the selected real item, not rely on prototype defaults.

**Files/areas:**

```text
apps/web/src/screens/Editor/EditorManualControls.tsx
apps/web/src/screens/Editor/EditorScreen.tsx
packages/editor/src/manualEditOperations.ts
packages/editor/src/manualEditOperations.test.ts
packages/editor/src/editorHistory.ts
packages/editor/src/timeline/Timeline.tsx
```

**Tasks:**

- [x] Add selected entity state for clips and zooms. (`SelectedEntity` in editor state.)
- [x] Allow selecting a clip from the timeline or controls. (Click a timeline clip → it highlights + the editor shows its fields.)
- [x] Allow selecting a zoom from the timeline or controls. (Timeline zoom item or a zoom-move rowcard.)
- [x] Show clip-specific fields for the selected clip. (start/end/source bounds, prefilled.)
- [x] Show zoom-specific fields for the selected zoom. (start/end/target x·y·w·h/easing, prefilled.)
- [x] Validate `start < end`, project bounds, source bounds, and non-negative values. (Range + new source-bounds validation; structured errors.)
- [x] Apply clip trims through immutable manual edit operations.
- [x] Apply zoom target/time/easing changes through immutable manual edit operations.
- [x] Make delete actions explicit and scoped to the selected item. (Delete selected zoom; clip delete out of MVP, disabled with reason.)
- [x] Preserve undo/redo for every manual edit.
- [x] Add tests for selected clip edit, selected zoom edit, invalid values, delete, undo, and redo.

**Done when:**

- [x] The user can select a visible timeline item and edit that exact item.
- [x] Invalid edits produce structured UI errors.
- [x] Every successful edit is undoable.

**Verification:**

```bash
pnpm --filter @tinker/editor test -- manualEditOperations
pnpm --filter @tinker/web test -- EditorManualControls
```

### PB-006: Add Manual Cursor/Click Controls

**Priority:** P1
**Owner:** Person B with Person A review if schema changes
**Status:** Done (Person B work complete; schema addition flagged for Person A sign-off)
**Goal:** Let the user intentionally tune visible cursor/click behavior instead of only accepting generated cursor telemetry.
**Note:** Added an OPTIONAL, backward-compatible top-level `cursor` settings field (`hidden`, `clickEffect: ring|ripple|none`, `clickEffectDurationMs`). Existing/Person A projects that omit it validate and render exactly as before. Preview and export both resolve it through one shared `resolveCursorSettings` (parity is structural). Documented for Person A in `docs/schema-change-pb-006-cursor-settings.md`.

**Files/areas:**

```text
packages/project-schema/src
packages/editor/src/manualEditOperations.ts
packages/editor/src/preview/Preview.tsx
packages/rendering/src/node/renderFinalToMp4.ts
apps/web/src/screens/Editor/EditorManualControls.tsx
```

**Tasks:**

- [x] Audit current schema support for cursor/click display settings. (None existed — only `cursorEvents` telemetry.)
- [x] If existing schema is enough, expose controls without changing schema. (N/A — schema was insufficient.)
- [x] If existing schema is not enough, write a small schema proposal for Person A review before implementation. (Optional `cursor` field + `docs/schema-change-pb-006-cursor-settings.md`.)
- [x] Add controls for cursor visibility if supported. (Cursor tab "Show cursor" toggle.)
- [x] Add controls for click emphasis style/timing if supported. (Ring/Ripple/None + duration.)
- [x] Ensure preview reflects cursor/click setting changes immediately.
- [x] Ensure export reflects the same cursor/click settings.
- [x] Add tests for preview/export parity after cursor/click setting changes. (`previewExportParity.test.ts`.)

**Done when:**

- [x] Cursor/click effects are user-controllable within MVP scope.
- [x] Preview and export remain aligned. (Single shared `resolveCursorSettings` for both.)
- [ ] Any schema changes have Person A review. **(Pending: schema change is documented + flagged in `docs/schema-change-pb-006-cursor-settings.md`; no Person A available in this session to sign off. Backward-compatible, so non-blocking.)**

**Verification:**

```bash
pnpm validate:schema
pnpm --filter @tinker/editor test
pnpm --filter @tinker/rendering test
```

### PB-007: Harden Project Lifecycle, Save/Load, And Recovery

**Priority:** P0
**Owner:** Person B
**Status:** Done
**Goal:** A one-user local workflow should survive reloads, bad files, validation errors, and accidental navigation.

**Files/areas:**

```text
apps/web/src/lib/projectStorage.ts
apps/web/src/screens/Editor/ProjectLoadPanel.tsx
apps/web/src/screens/Editor/ProjectSaveLoadControls.tsx
apps/web/src/screens/Editor/EditorScreen.tsx
apps/web/src/screens/Settings/SettingsScreen.tsx
```

**Tasks:**

- [x] Save full `DemoProject` JSON.
- [x] Load full `DemoProject` JSON.
- [x] Validate loaded project before opening.
- [x] Show validation errors in UI.
- [x] Make the current persistence state visible: unsaved, saved locally, downloaded, loaded from file, or generated. (Top-bar status pill driven by `PersistenceState = {origin, dirty}`.)
- [x] Reset undo/redo history when replacing the project. (Load resets history + currentTime + range + preview + selection.)
- [x] Warn or clearly indicate before replacing an edited project. (Inline `alertdialog` confirm shown only when dirty; Cancel preserves the project; focus moves to Replace.)
- [x] Keep asset references by `asset.id`; do not duplicate paths in UI state. (Audited — no path strings in component state.)
- [x] Add tests for replacement, invalid JSON, invalid schema, history reset, and storage reset. (27 tests added.)

**Done when:**

- [x] A user can save, reload, edit, and export a project without losing track of state.
- [x] Bad project files fail gracefully.
- [x] Replacing a project does not leave stale undo/redo history.

**Verification:**

```bash
pnpm --filter @tinker/web test -- ProjectSaveLoadControls
pnpm --filter @tinker/web test -- projectStorage
```

### PB-008: Make Export UX First-Class

**Priority:** P0
**Owner:** Person B
**Status:** Done
**Goal:** Export should feel like a real product operation, not a hidden technical test.
**Note:** Honest local-first export. The browser runs the REAL preflight (validate snapshot + build plan) via a driven `useWebExportJob` and shows the validated artifact summary + the exact `render:sample` command + output path; it never claims to write the MP4 (ffmpeg is node-only). The actual MP4 is produced by the documented command.

**Files/areas:**

```text
apps/web/src/screens/Editor/ProjectExportPanel.tsx
packages/editor/src/export/prepareMp4Export.ts
packages/rendering/src/node/exportJob.ts
packages/rendering/src/node/probeMp4Artifact.ts
packages/rendering/src/node/renderFinalToMp4.ts
```

**Tasks:**

- [x] Define export phases.
- [x] Freeze project snapshot before export.
- [x] Probe exported MP4.
- [x] Render export phase and progress when `exportJobState` is provided.
- [x] Show output path when `exportJobState` contains one.
- [x] Surface export-plan/preflight failures before render starts.
- [x] Surface render/probe failure messages when `exportJobState` contains an error.
- [x] Wire a real export job state into the web app instead of only rendering an optional prop. (`useWebExportJob` drives validating→succeeded/failed.)
- [x] Show final artifact duration, dimensions, and codec/probe summary after success. (Dimensions, timeline, h264 mp4 format, output path.)
- [x] Prevent duplicate export submissions while an export is running. (Start disabled while non-terminal + hook guard.)
- [x] Keep project edits from changing in-flight export state. (Frozen `structuredClone` snapshot; tested.)
- [x] Add a local sample render command through `@tinker/rendering render:sample`.
- [x] Add tests for export panel planning and job-state rendering.
- [x] Add tests for full app-level export UI states and failure recovery. (32 export tests across hook/panel/screen.)

**Done when:**

- [x] User understands what export is doing and where the result is. (Artifact summary + output path + render command.)
- [x] Export failure messages guide the user toward recovery. (Failed state shows the real error + retry.)
- [x] The sample project can render and probe through the documented command. (`render:sample` exists + tested; verified in the final gate.)

**Verification:**

```bash
pnpm --filter @tinker/web test -- ProjectExportPanel
pnpm --filter @tinker/rendering render:sample -- /tmp/tinker-person-b-export-smoke.mp4
```

### PB-009: Mount Useful Settings

**Priority:** P1
**Owner:** Person B
**Status:** Done
**Goal:** Settings should expose only local prototype controls that help one user operate or recover.

**Files/areas:**

```text
apps/web/src/App.tsx
apps/web/src/screens/Settings/SettingsScreen.tsx
apps/web/src/screens/Settings/SettingsScreen.test.tsx
apps/web/src/lib/projectStorage.ts
```

**Tasks:**

- [x] Build Settings screen component.
- [x] Add local storage reset.
- [x] Show current local storage key and generation mode.
- [x] Avoid API key, auth, billing, and secret management settings.
- [x] Mount Settings in app navigation. (Reachable from the Editor gear; `onClose` returns to the prior route — PB-001.)
- [x] Add app/runtime diagnostics useful for local debugging. (App version, schema version, generation mode, storage key, saved-project summary.)
- [x] Add export directory/default naming settings only if they are actually used by export. (Persisted export directory wired into `useWebExportJob` outputPath; traversal-safe sanitization.)
- [x] Add tests for navigation to Settings and reset behavior from the mounted app.

**Done when:**

- [x] Settings helps recovery/debugging without expanding product scope.
- [x] Settings is reachable from the product shell.

**Verification:**

```bash
pnpm --filter @tinker/web test -- Settings
```

### PB-010: Add Samuel Integration Harness And Golden Project Fixture

**Priority:** P0
**Owner:** Person B with Person A review
**Status:** Done
**Note:** Golden fixture `person-a-generated-project.sample.json` added; mock client returns it; opens through Create Demo -> Editor; export preflight passes; report at `docs/reports/person-b-samuel-integration.md`.
**Goal:** Prove the seam between Person A generation and Person B editing/export before real generation is complete.

**Files/areas:**

```text
packages/project-schema/fixtures
packages/generation-contract/src
apps/web/src/lib/mockGenerationClient.ts
apps/web/src/screens/CreateDemo
apps/web/src/screens/Editor
docs/reports
```

**Tasks:**

- [ ] Add or nominate a golden fixture: `person-a-generated-project.sample.json`.
- [ ] Ensure the golden fixture uses realistic captured media references.
- [ ] Validate the fixture with `DemoProjectSchema`.
- [ ] Feed the fixture through `mockGenerationClient`.
- [ ] Open the fixture through Create Demo success into Editor.
- [ ] Save the generated project.
- [ ] Run export preflight/render on the fixture when assets are local.
- [ ] Document exact assumptions Samuel must satisfy.
- [ ] Add a short integration report under `docs/reports/`.

**Done when:**

- [ ] Samuel can hand Person B a valid generated project and know whether it works.
- [ ] The Person B app has a reproducible local integration proof.

**Verification:**

```bash
pnpm validate:schema
pnpm --filter @tinker/web test
pnpm --filter @tinker/rendering test
```

### PB-011: Final One-User Acceptance Gate

**Priority:** P0
**Owner:** Person B
**Status:** Done
**Note:** Full gate green (schema/typecheck/all tests/build/render+probe) and a one-to-one design audit passed. Report: `docs/reports/person-b-product-gate.md`.
**Goal:** Prove Person B has exceeded requirements with a reproducible, end-to-end local product gate.

**Files/areas:**

```text
docs/reports/person-b-product-gate.md
apps/web
packages/editor
packages/ai-edit-ui
packages/rendering
packages/generation-contract
packages/project-schema
```

**Tasks:**

- [ ] Run schema validation.
- [ ] Run full typecheck.
- [ ] Run all tests.
- [ ] Build the web app.
- [ ] Render/probe a sample MP4.
- [ ] Manually verify Create Demo mock happy path.
- [ ] Manually verify invalid Create Demo input and retry.
- [ ] Manually verify Editor load.
- [ ] Manually verify preview real media.
- [ ] Manually verify selected range.
- [ ] Manually verify item-aware manual edit.
- [ ] Manually verify AI proposal preview, accept, reject, and undo.
- [ ] Manually verify save/load/download/import.
- [ ] Manually verify export success and artifact details.
- [ ] Manually verify missing/unsafe asset failure state.
- [ ] Manually verify Settings reset.
- [ ] Write `docs/reports/person-b-product-gate.md` with commands, results, artifact path, known residual risks, and Person A handoff status.

**Done when:**

- [ ] A reviewer can reproduce the full Person B loop from docs.
- [ ] The app is excellent for one local user.
- [ ] The report clearly distinguishes done work, deferred non-goals, and Person A dependencies.

**Verification:**

```bash
pnpm validate:schema
pnpm typecheck
pnpm -r test
pnpm --filter @tinker/web build
pnpm --filter @tinker/rendering render:sample -- /tmp/tinker-person-b-product-gate.mp4
```

### PB-012: Repo/Product Hygiene Pass

**Priority:** P1
**Owner:** Person B
**Status:** Done
**Note:** `.gitattributes` marks reference/generated HTML as linguist-generated; root `README.md` documents run/test/gate; docs match MVP scope; scratch screenshots ignored.
**Goal:** Remove avoidable confusion before external review or further agent work.

**Files/areas:**

```text
.gitattributes
.gitignore
design
apps/web/public/reference-designs
docs
README.md if added later
```

**Tasks:**

- [ ] Decide whether large reference HTML files should stay tracked.
- [ ] If they stay tracked, add `.gitattributes` entries so GitHub Linguist treats generated/reference HTML appropriately.
- [ ] Remove duplicate reference design files if both `design/` and `apps/web/public/reference-designs/` are not needed.
- [ ] Keep `docs/` tracked.
- [ ] Keep `generated/`, `dist/`, and local worktrees ignored.
- [ ] Add a short README or doc pointer explaining how to run the one-user local demo if none exists.
- [ ] Ensure docs do not contradict MVP scope.

**Done when:**

- [ ] GitHub language stats no longer misrepresent the codebase because of generated/reference HTML.
- [ ] A new agent can find the run/test/product-gate instructions without asking.
- [ ] Repo hygiene changes do not touch product behavior.

**Verification:**

```bash
git status --short
git check-ignore generated dist .worktrees
rg "caption|callout|voiceover|narration" docs apps/web/src packages || true
```

---

## Definition Of "Perfect For One User"

The product is not done just because tests pass. It is done when this script works without developer intuition:

1. [x] User opens the web app.
2. [x] User sees Create Demo, not a placeholder.
3. [x] User can submit a mock/local generation request.
4. [x] User sees progress.
5. [x] User lands in Editor with a valid `DemoProject`.
6. [x] User can preview real captured media.
7. [x] User can select a timeline item or range.
8. [x] User can manually edit a clip or zoom and undo/redo it.
9. [x] User can preview, accept, reject, and undo an AI edit proposal.
10. [x] User can save/download the project.
11. [x] User can reload/import the project.
12. [x] User can export an MP4.
13. [x] User can see where the MP4 went and what it contains.
14. [x] User can recover from invalid project JSON.
15. [x] User can recover from missing/unsafe assets.
16. [x] User can reset local prototype state.
17. [x] Person A can replace the mock generation client with real generation output through the shared contract.

## Commands To Run Before Claiming Person B Is Complete

```bash
pnpm validate:schema
pnpm typecheck
pnpm -r test
pnpm --filter @tinker/web build
pnpm --filter @tinker/rendering render:sample -- /tmp/tinker-person-b-product-gate.mp4
```

## Deferred Until After One-User Product Quality

- [ ] Desktop/Electron productization.
- [ ] Multi-user accounts.
- [ ] Cloud storage.
- [ ] API key or secret management UI.
- [ ] Billing.
- [ ] Collaboration.
- [ ] Captions, callouts, text overlays, voiceover, or audio timeline.
- [ ] Generic video editor features beyond demo-specific trim, zoom, cursor/click, save, and export.
