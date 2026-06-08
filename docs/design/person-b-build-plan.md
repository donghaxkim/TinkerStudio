# Person B Build Design

Source of truth: `docs/vision.md`, `docs/architecture.md`, `docs/prd.md`, `docs/dongha.md`, and `packages/project-schema/README.md`.

Status: planning branch document for Person B. Do not treat this as a replacement for `docs/architecture.md`; it is the execution design for Person B's side of that architecture.

## Non-negotiable architecture rules

- V1 is web apps only. Electron/desktop shell waits until the local web loop works.
- `DemoProject` is the source of truth.
- MP4 is an export artifact, never the primary product state.
- AI edit requests return structured operations. They do not mutate video files directly.
- Person B owns app shell, editor, AI edit UX, and export:
  - `apps/web`
  - `apps/desktop`
  - `packages/editor`
  - `packages/ai-edit-ui`
  - `packages/rendering`
- Person B integrates with generation only through shared contracts:
  - `packages/project-schema`
  - `packages/generation-contract`
  - thin `apps/api` routes/jobs when needed
- Person B must not import Person A internals from:
  - `packages/product-ingestion`
  - `packages/ai-generator`
  - `packages/capture`
- Schema changes are isolated and reviewed by both people.
- Keep the editor demo-specific. Do not build a general CapCut clone.

## Branch/worktree policy

Each large feature gets its own local branch. Do not push until the user confirms.

Suggested branches:

```text
person-b/planning-docs
person-b/web-editor-shell
person-b/ai-edit-operations
person-b/generation-contract-create-demo
person-b/project-persistence
person-b/rendering-export-v0
```

Use git worktrees when running multiple implementation agents in parallel.

## Big Task 1: Web app shell + DemoProject loader + timeline/preview v0

### Design

Build the first local web editor loop:

```text
apps/web
  -> load packages/project-schema/fixtures/demo-project.sample.json
  -> validate with DemoProjectSchema
  -> render project metadata
  -> render timeline rows
  -> render preview overlays
```

This task proves the editable project model. It does not implement Create Demo, AI chat, manual edit controls, persistence, export, or Electron.

### Package boundaries

```text
apps/web
  React/Vite app shell, routing/screen composition, sample project loading.

packages/editor
  Reusable editor primitives: timeline model, preview selectors/components, editor state helpers.

packages/project-schema
  Runtime validation and shared types. Browser imports must not pull Node-only code.
```

### Likely browser-safety issue

`packages/project-schema/src/index.ts` currently exports `sampleProject` from `sampleProject.ts`, and `sampleProject.ts` imports `node:fs`. Browser code importing `@tinker/project-schema` may accidentally include a Node-only module.

Preferred fix if Vite fails:

```text
packages/project-schema/src/index.ts      # browser-safe exports only
packages/project-schema/src/node.ts       # Node-only sampleProject export
packages/project-schema/package.json      # add ./node export
```

Make that as a small isolated schema PR/branch if needed.

### Main files

```text
pnpm-workspace.yaml
apps/web/package.json
apps/web/index.html
apps/web/tsconfig.json
apps/web/vite.config.ts
apps/web/src/main.tsx
apps/web/src/App.tsx
apps/web/src/screens/Editor/EditorScreen.tsx
apps/web/src/screens/Editor/ProjectLoadPanel.tsx
apps/web/src/fixtures/loadSampleProject.ts
packages/editor/package.json
packages/editor/tsconfig.json
packages/editor/src/index.ts
packages/editor/src/state/editorState.ts
packages/editor/src/timeline/timelineModel.ts
packages/editor/src/timeline/timeScale.ts
packages/editor/src/timeline/Timeline.tsx
packages/editor/src/preview/activeOverlays.ts
packages/editor/src/preview/Preview.tsx
packages/editor/src/project/assetResolver.ts
```

### Key interfaces

```ts
type EditorUiState = {
  currentTime: number;
  isPlaying: boolean;
  selectedRange?: { start: number; end: number };
  selectedEntityId?: string;
};
```

```ts
type TimelineItem = {
  id: string;
  kind: "clip" | "caption" | "zoom" | "callout";
  label: string;
  start: number;
  end: number;
  rowId: string;
};

type TimelineRow = {
  id: string;
  kind: "track" | "captions" | "zooms" | "callouts";
  label: string;
  items: TimelineItem[];
};
```

```ts
function buildTimelineRows(project: DemoProject): TimelineRow[];
function getActivePreviewOverlays(project: DemoProject, time: number): ActivePreviewOverlays;
```

### Acceptance criteria

- App opens locally and loads the sample fixture.
- Invalid projects produce readable validation errors.
- Metadata displays title, duration, fps, aspect ratio, asset count, and track count.
- Timeline displays video/audio tracks plus captions/zooms/callouts rows.
- Click-to-seek updates current time.
- Active caption is visible at `3s`.
- Active zoom/callout are visible at `14s`.
- Missing sample assets show placeholders, not crashes.
- `pnpm validate:schema`, package tests, typecheck, and web build pass.

## Big Task 2: AI edit operation applier + AI edit UX

### Design

Build the structured AI edit loop:

```text
selected timeline range
  -> project slice for AI context
  -> AI returns operation proposal
  -> validate proposal
  -> preview operation result
  -> accept/reject
  -> accepted edits immutably update DemoProject
```

The pure operation applier comes before the UI.

### Package boundaries

```text
packages/editor
  Pure operation application, project slice selection, editor undo/redo history.

packages/ai-edit-ui
  React side panel and mock AI edit flow.

apps/web
  Integrates side panel with editor state after Big Task 1 exists.
```

### Main files

```text
packages/editor/src/applyEditOperations.ts
packages/editor/src/applyEditOperations.test.ts
packages/editor/src/selectProjectSlice.ts
packages/editor/src/selectProjectSlice.test.ts
packages/editor/src/editorHistory.ts
packages/editor/src/editorHistory.test.ts
packages/ai-edit-ui/package.json
packages/ai-edit-ui/tsconfig.json
packages/ai-edit-ui/src/AIEditPanel.tsx
packages/ai-edit-ui/src/OperationPreviewList.tsx
packages/ai-edit-ui/src/useAIEditFlow.ts
packages/ai-edit-ui/src/mockAIEditClient.ts
packages/ai-edit-ui/src/index.ts
```

### Operation semantics

Supported V1 operations already exist in schema:

- `add_zoom`
- `add_callout`
- `add_caption`
- `remove_entity`

Rules:

- Validate input project first.
- Validate proposal and each operation.
- Enforce operation ranges within project duration.
- Enforce operations within selected `targetRange` by default.
- `remove_entity` must reference an existing entity.
- Removing clips removes timeline references only; it does not delete assets.
- Validate the resulting project with `DemoProjectSchema`.
- Return typed errors instead of producing invalid projects.
- Do not mutate the input project.

### Undo model

Use editor-level command snapshots for V1:

```ts
type EditorCommand = {
  type: "ai-edit" | "manual-edit";
  id: string;
  label: string;
  beforeProject: DemoProject;
  afterProject: DemoProject;
};
```

Do not add inverse-operation schema until the basic flow proves itself.

### Acceptance criteria

- Unit tests cover every operation type.
- Invalid ranges fail.
- Unknown removal IDs fail.
- Preview mode does not append accepted history.
- Accept mode updates `updatedAt` and appends accepted `AIEdit`.
- Original project object is unchanged.
- Undo restores exact prior project.
- AI edit panel can mock-generate, preview, accept, and reject operations.

## Big Task 3: Generation contract + Create Demo UI + progress states

### Design

Build the Person B boundary to Person A generation:

```text
Create Demo form
  -> CreateDemoRequest
  -> generation client/API contract
  -> GenerationJob/progress
  -> GenerationResult.project
  -> validate DemoProject
  -> open editor
```

The web app must depend on `packages/generation-contract`, not Person A packages.

### Package boundaries

```text
packages/generation-contract
  Shared request/job/progress/result/error types and validators.

apps/web
  Create Demo form, progress UI, generated project loading.

apps/api
  Thin route/job boundary later. No core generation logic here.
```

### Main files

```text
packages/generation-contract/package.json
packages/generation-contract/tsconfig.json
packages/generation-contract/src/index.ts
packages/generation-contract/src/createDemoRequest.ts
packages/generation-contract/src/generationJob.ts
packages/generation-contract/src/generationResult.ts
packages/generation-contract/src/progress.ts
packages/generation-contract/src/errors.ts
packages/generation-contract/src/validators.ts
apps/web/src/lib/generationClient.ts
apps/web/src/screens/CreateDemo/CreateDemoScreen.tsx
apps/web/src/screens/CreateDemo/CreateDemoForm.tsx
apps/web/src/screens/CreateDemo/GenerationProgressPanel.tsx
apps/web/src/screens/CreateDemo/GenerationErrorView.tsx
apps/web/src/screens/CreateDemo/useCreateDemoJob.ts
```

### Contract types

```ts
type CreateDemoRequest = {
  repoUrl: string;
  productUrl: string;
  prompt: string;
  durationCapSeconds: number;
  aspectRatio: "16:9" | "9:16" | "1:1";
  narration?: {
    enabled?: boolean;
    style?: string;
    voiceId?: string;
  };
};
```

```ts
type GenerationStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

type GenerationPhase =
  | "queued"
  | "analyzing_product"
  | "creating_storyboard"
  | "planning_capture"
  | "capturing"
  | "compiling_project"
  | "validating_project"
  | "complete";
```

```ts
type GenerationResult = {
  project: DemoProject;
  artifacts?: {
    storyboardAssetId?: string;
    captureTraceAssetId?: string;
    previewVideoAssetId?: string;
  };
  warnings?: string[];
};
```

### Acceptance criteria

- Contract package exports types and Zod validators.
- Request validator accepts localhost product URLs.
- Generation result validator validates nested `DemoProject`.
- Create Demo form renders all V1 fields.
- Form validates before submit.
- UI uses a `GenerationClient` interface.
- Progress states render all phases.
- Succeeded job validates the project before opening editor.
- Failed/invalid result does not open editor.

## Big Task 4: Project persistence

### Design

Persist the full `DemoProject` JSON and reload through the same validator path used for sample/generated projects.

V1 can start with browser local storage or file import/export, but should keep a clean interface so a local API/file-system backend can replace it later.

### Main files

```text
packages/editor/src/project/projectPersistence.ts
packages/editor/src/project/projectPersistence.test.ts
apps/web/src/lib/projectStorage.ts
apps/web/src/screens/Editor/ProjectSaveLoadControls.tsx
```

### Rules

- Save the full `DemoProject` object.
- Validate on load before rendering.
- Keep assets referenced by `asset.id`.
- Do not duplicate asset paths across the project model.
- Show validation errors instead of opening invalid project state.

### Acceptance criteria

- Save current project.
- Load saved project.
- Invalid JSON and invalid project schema show errors.
- Reloaded project matches saved project.

## Big Task 5: Rendering/export v0

### Design

Export the current `DemoProject` state to MP4 while preserving editor semantics. Rendering/export belongs to Person B because export correctness depends on editor state.

Keep first export boring. Prefer the simplest license-safe path that proves the loop.

Candidate approaches:

- `ffmpeg` for composition if assets are real and overlays can be rendered as inputs.
- canvas capture for browser-side preview/export prototype.
- HyperFrames later if it stays license-safe and fits the project model.

### Main files

```text
packages/rendering/package.json
packages/rendering/tsconfig.json
packages/rendering/src/renderPreview.ts
packages/rendering/src/renderFinal.ts
packages/editor/src/export/exportProject.ts
apps/web/src/screens/Editor/ExportPanel.tsx
```

### Rules

- Export uses `DemoProject` as input.
- AI never directly mutates video files.
- Export reflects tracks, clips, trims, captions, zooms, callouts, cursor/click effects, and aspect ratio.
- MP4 is an artifact, not project state.

### Acceptance criteria

- Export can run on a valid project with resolvable assets.
- Export errors clearly when assets are missing.
- Exported MP4 plays.
- At least one accepted edit is visible in exported output.

## Global verification before done

Run from repo root before saying a feature is complete:

```bash
pnpm install
pnpm validate:schema
pnpm typecheck
pnpm -r test
pnpm --filter @tinker/web build
```

If a package does not yet have tests, add them as part of the feature branch or document why no test target exists.

## Current tool blocker

Codex CLI was installed locally, but standalone Codex auth is not currently usable in this Hermes profile. `codex doctor` reports the copied Hermes OpenAI Codex auth is missing the `id_token` field expected by standalone Codex CLI. Until `codex login` or an API key is configured for standalone Codex, implementation agents must use Hermes subagents or another available coding agent.
