# Person B Implementation Plan

> **For Hermes:** Use `subagent-driven-development` or Codex CLI agents to implement this plan big-task-by-big-task. Each big task gets its own branch, design review, implementation, spec review, quality review, and verification. Do not push until the user confirms.

**Goal:** Build Person B's side of Tinker: local web editor, AI edit UX, generation-contract integration, persistence, and export.

**Architecture:** `DemoProject` is the source of truth. The web app and editor consume/modify `DemoProject`; export generates MP4 artifacts from that state. Person B integrates with generation only through `generation-contract`.

**Tech Stack:** TypeScript, pnpm workspaces, React, Vite, Zod, Vitest, `@tinker/project-schema`, eventually ffmpeg/HyperFrames/canvas capture for export.

---

## Global rules

- Always read `docs/` before starting a branch.
- Treat `docs/architecture.md` as the architecture source of truth.
- Treat `docs/prd.md` as product requirements source of truth when it has content; today it is empty, so do not invent PRD requirements.
- Treat `docs/dongha.md` as Person B checklist source of truth.
- Keep `main` runnable.
- Make small local commits.
- Do not push without user confirmation.
- Use a new branch/worktree per big feature.
- Use TDD for production code.
- Run verification before reporting done.
- Do not import Person A internals from `product-ingestion`, `ai-generator`, or `capture`.

## `/superpowers` workflow

Apply this workflow to each **big task branch**, not to every tiny checklist item:

```text
read docs source of truth
  -> write/review design doc for the big task
  -> write/review implementation plan for the big task
  -> implement with TDD
  -> spec-compliance review
  -> code-quality review
  -> verification commands
  -> local commit
  -> stop before push unless user confirms
```

Small implementation steps inside a big task should follow TDD and verification, but they do not each need separate design documents.

## Codex CLI status

Codex CLI is installed locally, but standalone Codex auth is currently blocked in this Hermes profile: `codex doctor` reports the copied Hermes OpenAI Codex auth lacks the `id_token` field expected by the standalone Codex CLI. Until the user runs `codex login` or provides a supported API-key auth path, use Hermes subagents or another available coding agent as the implementation fallback. Do not pretend Codex CLI work ran if it did not.

## Pre-flight for every branch

```bash
git status --short --branch
pnpm install
pnpm validate:schema
pnpm typecheck
```

If baseline fails, capture the failure before editing and avoid introducing new failures.

## Required verification before each big task is done

Every big task branch must run this gate before it can be called done:

```bash
pnpm validate:schema
pnpm typecheck
pnpm -r test
```

If a package has no `test` script yet, either add one as part of the branch or document why the branch's relevant package-specific tests replace `pnpm -r test`. App branches must also run the relevant build command, usually:

```bash
pnpm --filter @tinker/web build
```

Task-specific commands below are additional focused checks, not replacements for this global gate.

---

## Big Task 1: Web editor shell, project loader, timeline v0, preview v0

**Branch:** `person-b/web-editor-shell`

**Objective:** Create the local web app and read-only editor loop that loads the sample `DemoProject`, renders timeline/preview, and proves the project model.

**Design doc:** `docs/design/person-b-build-plan.md#big-task-1-web-app-shell-demoproject-loader-timelinepreview-v0`

### Step 1: Scaffold workspace/app/package boundaries

**Files:**

- Modify: `pnpm-workspace.yaml`
- Create: `apps/web/package.json`
- Create: `apps/web/index.html`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/styles.css`
- Create: `packages/editor/package.json`
- Create: `packages/editor/tsconfig.json`
- Create: `packages/editor/src/index.ts`

**TDD/verification:**

```bash
pnpm install
pnpm --filter @tinker/editor typecheck
pnpm --filter @tinker/web typecheck
pnpm --filter @tinker/web build
```

**Expected:** web app compiles with a placeholder screen.

### Step 2: Add project loader

**Files:**

- Create: `apps/web/src/fixtures/loadSampleProject.ts`
- Create: `apps/web/src/fixtures/loadSampleProject.test.ts`
- Create: `apps/web/src/screens/Editor/EditorScreen.tsx`
- Create: `apps/web/src/screens/Editor/ProjectLoadPanel.tsx`

**Test first:**

- valid sample fixture returns `{ ok: true }`
- invalid fixture returns `{ ok: false, error.issues }`
- metadata matches sample fixture

**Commands:**

```bash
pnpm --filter @tinker/web test -- loadSampleProject
pnpm --filter @tinker/web typecheck
```

### Step 3: Add editor state and timeline model

**Files:**

- Create: `packages/editor/src/state/editorState.ts`
- Create: `packages/editor/src/timeline/timelineModel.ts`
- Create: `packages/editor/src/timeline/timeScale.ts`
- Create: `packages/editor/src/timeline/timelineModel.test.ts`
- Create: `packages/editor/src/timeline/timeScale.test.ts`

**Test first:**

- sample project creates rows for tracks/captions/zooms/callouts
- items preserve start/end ranges
- time scale converts seconds/pixels and clamps seeks

**Commands:**

```bash
pnpm --filter @tinker/editor test -- timeline
pnpm --filter @tinker/editor typecheck
```

### Step 4: Add timeline component

**Files:**

- Create: `packages/editor/src/timeline/Timeline.tsx`
- Create: `packages/editor/src/timeline/Timeline.css`
- Create: `packages/editor/src/timeline/Timeline.test.tsx`

**Test first:**

- renders track names
- renders clip/caption/zoom/callout labels
- click calls `onSeek`
- selected range is visible

**Commands:**

```bash
pnpm --filter @tinker/editor test -- Timeline
pnpm --filter @tinker/editor typecheck
```

### Step 5: Add preview selectors/component

**Files:**

- Create: `packages/editor/src/preview/activeOverlays.ts`
- Create: `packages/editor/src/preview/activeOverlays.test.ts`
- Create: `packages/editor/src/preview/Preview.tsx`
- Create: `packages/editor/src/preview/Preview.css`
- Create: `packages/editor/src/project/assetResolver.ts`

**Test first:**

- caption active at `3s`
- zoom/callout active at `14s`
- missing assets render placeholder
- cursor click event appears near its timestamp

**Commands:**

```bash
pnpm --filter @tinker/editor test -- activeOverlays
pnpm --filter @tinker/editor test -- Preview
pnpm --filter @tinker/editor typecheck
```

### Step 6: Integrate web editor screen

**Files:**

- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/screens/Editor/EditorScreen.tsx`

**Verification:**

```bash
pnpm validate:schema
pnpm --filter @tinker/editor test
pnpm --filter @tinker/web test
pnpm --filter @tinker/web build
pnpm typecheck
```

**Done when:** sample project loads, metadata displays, timeline seek updates preview, and overlays appear at expected times.

---

## Big Task 2: AI edit operation applier + AI edit UX

**Branch:** `person-b/ai-edit-operations`

**Objective:** Implement pure structured operation application first, then a mock AI side panel that can preview/accept/reject edits.

**Design doc:** `docs/design/person-b-build-plan.md#big-task-2-ai-edit-operation-applier-ai-edit-ux`

### Step 1: Implement pure operation applier

**Files:**

- Modify: `packages/editor/src/applyEditOperations.ts`
- Create: `packages/editor/src/applyEditOperations.test.ts`

**Test first:**

- `add_zoom` adds zoom with stable ID
- `add_callout` adds callout
- `add_caption` adds caption
- `remove_entity` removes caption/zoom/callout/clip
- unknown remove ID fails
- invalid ranges fail
- operation outside duration fails
- original project object is not mutated
- preview mode does not append accepted history
- accept mode updates `updatedAt` and appends accepted `AIEdit`

**Commands:**

```bash
pnpm --filter @tinker/editor test -- applyEditOperations
pnpm --filter @tinker/editor typecheck
```

### Step 2: Add project slice selector

**Files:**

- Create: `packages/editor/src/selectProjectSlice.ts`
- Create: `packages/editor/src/selectProjectSlice.test.ts`

**Test first:**

- selected range includes overlapping clips/captions/zooms/callouts/cursor events
- excludes entities outside range
- handles empty ranges safely

### Step 3: Add editor history

**Files:**

- Create: `packages/editor/src/editorHistory.ts`
- Create: `packages/editor/src/editorHistory.test.ts`

**Test first:**

- push command adds undo entry
- undo restores exact previous project
- redo reapplies after project
- new command clears redo stack

### Step 4: Create AI edit UI package

**Files:**

- Create: `packages/ai-edit-ui/package.json`
- Create: `packages/ai-edit-ui/tsconfig.json`
- Create: `packages/ai-edit-ui/src/index.ts`
- Create: `packages/ai-edit-ui/src/AIEditPanel.tsx`
- Create: `packages/ai-edit-ui/src/OperationPreviewList.tsx`
- Create: `packages/ai-edit-ui/src/useAIEditFlow.ts`
- Create: `packages/ai-edit-ui/src/mockAIEditClient.ts`

**Test first:**

- disabled without selected range
- mock prompt returns operation proposal
- preview validates proposal
- accept returns updated project
- reject preserves original project

### Step 5: Integrate with web editor

**Files:**

- Modify: `apps/web/src/screens/Editor/EditorScreen.tsx`

**Verification:**

```bash
pnpm validate:schema
pnpm --filter @tinker/editor test
pnpm --filter @tinker/ai-edit-ui test
pnpm --filter @tinker/web test
pnpm --filter @tinker/web build
pnpm typecheck
```

**Done when:** mock AI operations can be previewed, accepted, rejected, and undone without mutating video files.

---

## Big Task 3: Generation contract + Create Demo UI + progress states

**Branch:** `person-b/generation-contract-create-demo`

**Objective:** Define the shared request/job/result boundary and build the Create Demo/progress UI against that contract.

**Design doc:** `docs/design/person-b-build-plan.md#big-task-3-generation-contract-create-demo-ui-progress-states`

### Step 1: Define generation-contract package

**Files:**

- Create/modify: `packages/generation-contract/package.json`
- Create/modify: `packages/generation-contract/tsconfig.json`
- Modify: `packages/generation-contract/src/createDemoRequest.ts`
- Modify: `packages/generation-contract/src/generationJob.ts`
- Modify: `packages/generation-contract/src/generationResult.ts`
- Create: `packages/generation-contract/src/progress.ts`
- Create: `packages/generation-contract/src/errors.ts`
- Create: `packages/generation-contract/src/validators.ts`
- Create: `packages/generation-contract/src/index.ts`
- Create: `packages/generation-contract/src/validators.test.ts`

**Test first:**

- valid request parses
- empty prompt fails
- localhost product URL passes
- invalid aspect ratio fails
- generation result validates nested `DemoProject`
- invalid result fails

### Step 2: Add generation client interface

**Files:**

- Create: `apps/web/src/lib/generationClient.ts`
- Create: `apps/web/src/lib/mockGenerationClient.ts`

**Test first:**

- mock client creates queued job
- mock client emits progress phases
- mock client returns sample project result

### Step 3: Build Create Demo form

**Files:**

- Create: `apps/web/src/screens/CreateDemo/CreateDemoScreen.tsx`
- Create: `apps/web/src/screens/CreateDemo/CreateDemoForm.tsx`
- Create: `apps/web/src/screens/CreateDemo/useCreateDemoJob.ts`

**Test first:**

- renders all fields
- invalid values show errors
- valid submit calls `generationClient.createDemo`

### Step 4: Build progress/error UI

**Files:**

- Create: `apps/web/src/screens/CreateDemo/GenerationProgressPanel.tsx`
- Create: `apps/web/src/screens/CreateDemo/GenerationErrorView.tsx`

**Test first:**

- renders every phase label
- failed job shows error
- succeeded job validates project and opens editor
- invalid returned project does not open editor

**Verification:**

```bash
pnpm validate:schema
pnpm --filter @tinker/generation-contract test
pnpm --filter @tinker/web test
pnpm --filter @tinker/web build
pnpm typecheck
```

---

## Big Task 4: Project persistence

**Branch:** `person-b/project-persistence`

**Design doc:** `docs/design/project-persistence.md`

**Objective:** Save/load full `DemoProject` JSON through a validated persistence interface.

**Files:**

- Create: `packages/editor/src/project/projectPersistence.ts`
- Create: `packages/editor/src/project/projectPersistence.test.ts`
- Create: `apps/web/src/lib/projectStorage.ts`
- Create: `apps/web/src/screens/Editor/ProjectSaveLoadControls.tsx`

**Test first:**

- serialize valid project
- deserialize valid project
- invalid JSON fails
- invalid schema fails
- loaded project equals saved project

**Verification:**

```bash
pnpm --filter @tinker/editor test -- projectPersistence
pnpm --filter @tinker/web test
pnpm --filter @tinker/web build
pnpm typecheck
```

---

## Big Task 5: Rendering/export v0

**Branch:** `person-b/rendering-export-v0`

**Objective:** Export the current `DemoProject` state to a playable MP4 artifact, or produce a clearly validated export failure when required assets are missing.

**Files:**

- Create/modify: `packages/rendering/package.json`
- Create/modify: `packages/rendering/tsconfig.json`
- Modify: `packages/rendering/src/renderPreview.ts`
- Modify: `packages/rendering/src/renderFinal.ts`
- Create: `packages/editor/src/export/exportProject.ts`
- Create: `apps/web/src/screens/Editor/ExportPanel.tsx`

**Test first:**

- missing asset returns typed export error
- valid render plan preserves aspect ratio
- captions/zooms/callouts are included in render plan
- export result returns artifact metadata

**Verification:**

```bash
pnpm --filter @tinker/rendering test
pnpm --filter @tinker/editor test -- exportProject
pnpm --filter @tinker/web build
pnpm typecheck
```

Manual verification once real assets exist:

- exported MP4 plays
- accepted caption/callout/zoom edit appears in output

---

## Final integration gate

After all big branches are ready and reviewed locally:

```bash
git checkout main
git merge --no-ff person-b/web-editor-shell
pnpm validate:schema && pnpm typecheck && pnpm -r test

git merge --no-ff person-b/ai-edit-operations
pnpm validate:schema && pnpm typecheck && pnpm -r test

git merge --no-ff person-b/generation-contract-create-demo
pnpm validate:schema && pnpm typecheck && pnpm -r test

git merge --no-ff person-b/project-persistence
pnpm validate:schema && pnpm typecheck && pnpm -r test

git merge --no-ff person-b/rendering-export-v0
pnpm validate:schema && pnpm typecheck && pnpm -r test
```

Do not push until user confirms.
