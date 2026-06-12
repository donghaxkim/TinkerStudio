# Architecture

## Status

Draft architecture for the first version of the product.

This document defines the product shape, system boundaries, ownership split, and core data contract. It is intentionally not an implementation task list.

## Product Shape

The product is **Screen Studio for agents**: a local-first app that can turn a software product into an editable, polished demo video.

The earliest prototype should be a local web app plus local API/CLI worker. Electron is a good packaging target later, once the core generation, editing, and export loop is proven.

The user flow should feel like:

```text
Launch app
  -> Create Demo
  -> enter GitHub repo URL, product URL/local app URL, prompt, duration, aspect ratio
  -> AI analyzes product
  -> AI proposes storyboard
  -> AI captures/generates footage
  -> AI assembles first editable project
  -> user lands in demo-specific editor
  -> user edits manually or chats with AI over selected timeline ranges
  -> export polished demo video
```

## Core Architecture Decision

The generated output must not be only an MP4.

The system should generate an **editable project timeline** as the source of truth:

```ts
type DemoProject = {
  id: string;
  title: string;
  duration: number;
  fps: number;
  aspectRatio: "16:9" | "9:16" | "1:1";
  assets: Asset[];
  tracks: Track[];
  zooms: ZoomKeyframe[];
  cursorEvents: CursorEvent[];
  aiEditHistory: AIEdit[];
};
```

Both the visual editor and AI chat modify this project model. The MP4 is an export artifact, not the primary product state.

## V1 Scope

V1 should focus on **web apps only**.

Web apps provide reliable automation primitives:

- Playwright browser control
- DOM inspection
- selectors
- screenshots
- traces
- deterministic replay
- browser video capture

Desktop app automation should remain future scope. It introduces accessibility APIs, OS permissions, app-specific UI trees, fragile mouse control, and harder recording constraints.

## Non-Goals

V1 should not try to build:

- a full CapCut clone
- a general-purpose video editor
- desktop app automation
- arbitrary OS-level computer use recording
- direct AI mutation of video files
- final-only MP4 generation with no editable timeline
- commercial code reuse from noncommercial or unclear-license repos

The editor should be demo-specific: trim, zoom/camera motion, cursor/click effects, backgrounds, aspect ratio, and export.

Captions, callouts, text overlays, text rendering, audio/voiceover tracks, and audio mixing are out of MVP scope. They can be reconsidered after the captured-video plus motion/export spine works reliably.

## System Pipeline

The clean product pipeline is:

```text
Product Input
  -> ProductAnalysis

ProductAnalysis + UserPrompt
  -> Storyboard

Storyboard
  -> CapturePlan

CapturePlan
  -> CaptureResult

ProductAnalysis + Storyboard + CaptureResult
  -> DemoProject

DemoProject
  -> Editor
  -> AI Edit Operations
  -> Exported MP4
```

### 1. Product Input

User provides:

- GitHub repo URL
- product URL or local app URL
- prompt: what features to show
- duration cap
- target aspect ratio/platform

For V1, the safest path is to analyze repositories as source material and automate already-running web apps through URLs. Automatically installing dependencies or executing arbitrary cloned repositories should remain future scope behind an explicit sandbox/security design.

### 2. ProductAnalysis

The system analyzes the product and extracts:

```ts
type ProductAnalysis = {
  productName: string;
  summary: string;
  features: string[];
  brand?: {
    colors?: string[];
    logoAssetId?: string;
  };
  routes?: ProductRoute[];
  screenshots?: Asset[];
  setupNotes?: string[];
  docsLinks?: string[];
  techStack?: string[];
};
```

Sources may include README, docs, product URL, screenshots, app routes, and visible UI state.

### 3. Storyboard

The storyboard defines the narrative before recording:

```ts
type Storyboard = {
  title: string;
  durationCapSeconds: number;
  aspectRatio: "16:9" | "9:16" | "1:1";
  beats: StoryboardBeat[];
};

type StoryboardBeat = {
  id: string;
  startHint?: number;
  endHint?: number;
  type: "hook" | "screen_capture" | "feature" | "proof" | "cta";
  goal: string;
  requiredUiState?: string;
};
```

The storyboard should be understandable and optionally reviewable before capture.

### 4. CapturePlan

The capture plan converts storyboard intent into deterministic browser actions:

```ts
type CapturePlan = {
  targetUrl: string;
  viewport: { width: number; height: number };
  steps: CaptureStep[];
  expectedCheckpoints: Checkpoint[];
};

type CaptureStep =
  | { type: "goto"; url: string }
  | { type: "click"; selector?: string; text?: string; label?: string }
  | { type: "type"; selector: string; text: string }
  | { type: "scroll"; x?: number; y?: number; selector?: string }
  | { type: "hover"; selector?: string; text?: string }
  | { type: "waitForSelector"; selector: string; timeoutMs?: number }
  | { type: "pause"; ms: number };
```

The LLM may create and repair this plan, but it should not improvise during the final recording take.

### 5. CaptureResult

The capture layer executes the verified capture plan and records structured footage plus events:

```ts
type CaptureResult = {
  clips: Asset[];
  screenshots: Asset[];
  events: CaptureEvent[];
  tracePath?: string;
  checkpoints: CheckpointResult[];
};

type CaptureEvent =
  | { time: number; type: "click"; x: number; y: number; label?: string }
  | { time: number; type: "cursor"; x: number; y: number }
  | { time: number; type: "scroll"; x: number; y: number }
  | { time: number; type: "zoomTarget"; x: number; y: number; width: number; height: number; label?: string };
```

Structured events matter because they let the editor add Screen Studio-style zooms, click effects, cursor paths, and camera motion after recording.

### 6. DemoProject

The compiler turns analysis, storyboard, capture output, cursor/click events, zoom suggestions, and assets into the initial editable project.

The editor consumes this project directly. AI edits also operate on this same model.

### Asset Contract

Assets are central to the project model, so the first schema pass should define them concretely:

```ts
type Asset = {
  id: string;
  type: "video" | "audio" | "image" | "svg" | "json" | "trace";
  uri: string;
  source: "local" | "remote" | "generated" | "captured";
  mimeType?: string;
  duration?: number;
  width?: number;
  height?: number;
  sizeBytes?: number;
  metadata?: Record<string, unknown>;
};
```

The editor, renderer, and capture pipeline should reference assets by `id`, not by duplicating paths throughout the project.

## AI Editing Contract

AI editing should work like Cursor for a selected timeline range.

Flow:

```text
User selects 50s-56s on timeline
  -> selection, thumbnails, motion metadata, and project slice are attached to chat
  -> user asks for an edit
  -> AI returns structured edit operations
  -> editor previews changes
  -> user accepts/rejects
  -> accepted operations mutate DemoProject
```

AI must output operations, not directly modify video files.

Example:

```json
{
  "targetRange": { "start": 50, "end": 56 },
  "operations": [
    {
      "type": "add_zoom",
      "start": 50.2,
      "end": 55.5,
      "target": { "x": 720, "y": 420, "width": 480, "height": 240 },
      "easing": "easeInOut"
    },
    { "type": "remove_entity", "entityType": "zoom", "id": "zoom_003" }
  ]
}
```

All AI edit operations should be validated before application and should be undoable.

## Two-Person Ownership Split

### Shared First: Project Schema

Create and stabilize the shared schema early:

```text
/packages/project-schema
```

This package defines:

- `DemoProject`
- `Asset`
- `Track`
- `Clip`
- `Caption`
- `ZoomKeyframe`
- `CursorEvent`
- `Callout`
- `AIEditOperation`
- validators and versioning

It should also include shared fixtures:

```text
/packages/project-schema/fixtures/demo-project.sample.json
/packages/project-schema/fixtures/storyboard.sample.json
/packages/project-schema/fixtures/capture-result.sample.json
```

Fixtures let Person A generate toward known examples while Person B builds the editor against stable project files.

Any schema change should be a small isolated PR reviewed by both people.

### Shared Boundary: Generation Contract

Create a thin shared package for the request/response boundary between the app shell and the generation pipeline:

```text
/packages/generation-contract
```

This package defines:

- `CreateDemoRequest`
- `GenerationJob`
- `GenerationStatus`
- `GenerationResult`
- errors and progress events

The desktop/web app should call this contract instead of importing Person A's internal generation modules directly.

### Shared Boundary: API/Worker Integration

The local API should stay thin and contract-driven:

```text
/apps/api
```

It may expose routes, job status, and worker entrypoints, but core generation logic should live in Person A's packages and editor/export logic should live in Person B's packages. This keeps `apps/api` from becoming an ownership bottleneck.

### Person A: AI Demo Generation Pipeline

Person A owns everything before the editor opens:

```text
Product input -> ProductAnalysis -> Storyboard -> CapturePlan -> CaptureResult -> initial DemoProject
```

Owned areas:

```text
/packages/product-analysis
/packages/demo-assembly
/packages/browser-capture
```

Responsibilities:

- repo/product analysis
- website/app inspection
- storyboard generation
- fake demo data/state generation
- Playwright/Webreel-style capture planning
- capture execution and event collection
- compile initial `DemoProject`

Person A should avoid touching editor internals except through the shared project schema.

### Person B: Editor, AI Edit UX, and Export

Person B owns the app shell and editing experience:

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

Responsibilities:

- local web app shell for the earliest prototype
- UI integration with generation jobs through `generation-contract`
- eventual desktop/local app shell
- Create Demo UI
- generation progress UI
- project loading/saving
- timeline
- preview canvas
- range selection
- manual trim/zoom/camera/background controls
- AI chat side panel
- AI operation applier
- export/render path

Person B should own rendering/export because export correctness depends on editor state.

## Proposed Repository Structure

```text
tinker/
  docs/
    vision.md
    architecture.md
    prd.md

  apps/
    web/
      src/
        screens/
          CreateDemo/
          Editor/
          Settings/

    api/
      src/
        jobs/
        routes/
        workers/

    desktop/
      src/
        screens/
          CreateDemo/
          Editor/
          Settings/
        electron/
        main.ts
        preload.ts

  packages/
    project-schema/
      fixtures/
        demo-project.sample.json
        storyboard.sample.json
        capture-result.sample.json
      src/
        types.ts
        validators.ts
        version.ts

    generation-contract/
      src/
        createDemoRequest.ts
        generationJob.ts
        generationResult.ts

    product-analysis/
      src/
        analyzeRepo.ts
        analyzeWebsite.ts
        extractBrand.ts

    demo-assembly/
      src/
        generateStoryboard.ts
        generateNarration.ts
        compileProject.ts

    browser-capture/
      src/
        playwrightCapture.ts
        captureEvents.ts
        verifyCapturePlan.ts

    editor/
      src/
        timeline/
        preview/
        overlays/
        export/
        applyEditOperations.ts

    rendering/
      src/
        renderPreview.ts
        renderFinal.ts

    shared/
      src/
        logger.ts
        paths.ts
```

## Technology Posture

### Recommended V1 Stack

- **Automation:** Playwright
- **Agent/browser planning:** Stagehand or direct LLM + Playwright snapshots
- **Capture:** Webreel-inspired capture layer or Playwright video first
- **Video composition:** HyperFrames and/or ffmpeg for early output
- **Editor:** custom demo-specific React editor
- **First app shell:** local web app plus API/CLI worker
- **Desktop shell:** Electron eventually, after the core loop works
- **Schema:** TypeScript types plus runtime validators

### Commercial-Safe OSS Policy

Use only license-compatible code as foundation.

Safe foundations/references verified so far:

- `microsoft/playwright` — Apache-2.0
- `browserbase/stagehand` — MIT
- `vercel-labs/webreel` — Apache-2.0
- `heygen-com/hyperframes` — Apache-2.0
- `walterlow/freecut` — MIT, useful editor reference
- `farzaa/clicky` / `jasonkneen/openclicky` — MIT, useful screen-aware assistant reference

Use as inspiration only unless license is clarified:

- `CristianOlivera1/openvid` — relevant UX, but PolyForm Noncommercial; do not fork or copy code for commercial product
- `designcombo/react-video-editor` — useful reference, but GitHub reports no detected license
- `heygen-com/website-to-hyperframes-demo` — useful reference, but GitHub reports no detected license
- `remotion-dev/remotion` — powerful renderer, but has commercial-license considerations depending on use/company size

## MVP Milestones

### Milestone 1: Manual Project to Editor Export

Input: hand-written `demo-project.json` fixture.

Output: editor loads timeline, previews video, supports one or two manual edits, exports MP4.

Purpose: prove the project model and editor/export loop.

### Milestone 2: Manual Storyboard to Captured Project

Input: hand-written storyboard/capture plan.

Output: Playwright/Webreel-style capture produces assets/events and compiles a `DemoProject` that opens in the editor.

Purpose: prove deterministic recording and project compilation.

### Milestone 3: AI Storyboard to Captured Project

Input: product URL/repo URL + prompt.

Output: AI generates storyboard/capture plan, verifies it, records, and compiles an editable project.

Purpose: prove the core agent generation loop.

### Milestone 4: AI Range Editing

Input: selected timeline range + user edit instruction.

Output: structured AI edit operations previewed/applied to the project.

Purpose: prove the Cursor-for-video editing loop.

## Git Workflow

Use separate feature branches:

```text
person-a/generation-pipeline
person-b/web-editor
schema/demo-project-v1
```

Rules:

- `main` should stay runnable.
- Small PRs into `main`.
- Schema changes happen in isolated PRs.
- Both people review schema changes.
- Avoid mixing schema changes with big editor/generator work.
- Person A should not casually edit editor internals.
- Person B should not casually edit generation/capture internals.

## Risks and Tradeoffs

### Risk: Editor scope explosion

A full video editor is too large. Keep V1 demo-specific.

### Risk: AI-generated flows are flaky

The LLM should explore, plan, and repair. The final recording should be deterministic replay, not live improvisation.

### Risk: Licensing contamination

OpenVid and other unclear/noncommercial repos are useful references but unsafe as commercial code foundations.

### Risk: Desktop app shell distracts from core loop

Electron is reasonable, but a local web app/CLI prototype may validate the core pipeline faster.

### Risk: Project schema changes create merge conflicts

Treat schema as the shared contract. Change it deliberately and review it together.

## Success Criteria

The architecture is working when:

- a `DemoProject` can be generated, loaded, edited, saved, and exported
- capture produces structured events, not only video
- AI edit requests produce validated operations, not direct file mutations
- the generated first draft is editable rather than disposable
- each person can work mostly independently through the shared schema
- the first generated demo saves meaningful manual recording/editing time
