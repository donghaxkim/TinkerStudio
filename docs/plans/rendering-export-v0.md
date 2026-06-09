# Rendering Export v0 Implementation Plan

> **For Hermes:** Implement directly with TDD. Keep scope limited to DemoProject -> MP4 artifact.

**Goal:** Export the current `DemoProject` state to an MP4 artifact using a local renderer.

**Architecture:** Add a browser-safe render plan in `@tinker/rendering`, a Node-only ffmpeg renderer subpath, a small editor export adapter, and a web export readiness panel. Do not change the shared schema.

**Tech Stack:** TypeScript, Vitest, React, Node `child_process`, local ffmpeg.

---

### Task 1: Add rendering package scaffold and failing render plan tests

**Objective:** Define the intended export contract before implementation.

**Files:**
- Create: `packages/rendering/package.json`
- Create: `packages/rendering/tsconfig.json`
- Create: `packages/rendering/vitest.config.ts`
- Create: `packages/rendering/src/renderFinal.test.ts`

**Test expectations:**

- `buildFinalRenderPlan(sampleProject)` validates and returns MP4 output metadata.
- Aspect ratio `16:9` maps to `1920x1080`.
- Captions/callouts/zooms/cursor events become render layers.
- Non-`.mp4` output filenames are rejected.

**Verify RED:**

```bash
pnpm --filter @tinker/rendering test
```

Expected: fails because exports are missing.

### Task 2: Implement browser-safe render plan

**Objective:** Build a deterministic render plan from `DemoProject` only.

**Files:**
- Create/modify: `packages/rendering/src/renderFinal.ts`
- Create/modify: `packages/rendering/src/renderPreview.ts`
- Create/modify: `packages/rendering/src/index.ts`

**Verify GREEN:**

```bash
pnpm --filter @tinker/rendering test
pnpm --filter @tinker/rendering typecheck
```

### Task 3: Add Node ffmpeg renderer with tests

**Objective:** Convert the render plan to a real MP4 artifact through ffmpeg without adding dependencies.

**Files:**
- Create: `packages/rendering/src/node/renderFinalToMp4.ts`
- Create: `packages/rendering/src/node/index.ts`
- Create: `packages/rendering/src/node/renderFinalToMp4.test.ts`
- Create: `packages/rendering/src/cli/renderSampleProject.ts`

**Test expectations:**

- Renderer refuses non-MP4 output paths.
- Renderer passes a deterministic ffmpeg argument list to an injectable runner.
- Renderer returns artifact metadata.

**Verify:**

```bash
pnpm --filter @tinker/rendering test
pnpm --filter @tinker/rendering build
pnpm --filter @tinker/rendering render:sample -- /tmp/tinker-sample-export.mp4
ffprobe -v error -show_entries format=format_name,duration -show_entries stream=codec_name,codec_type -of json /tmp/tinker-sample-export.mp4
```

### Task 4: Add editor export adapter and web panel

**Objective:** Surface MP4 export readiness in the editor without importing Node-only renderer into the browser.

**Files:**
- Create: `packages/editor/src/export/prepareMp4Export.ts`
- Modify: `packages/editor/src/index.ts`
- Create: `apps/web/src/screens/Editor/ProjectExportPanel.tsx`
- Create: `apps/web/src/screens/Editor/ProjectExportPanel.test.tsx`
- Modify: `apps/web/src/screens/Editor/EditorScreen.tsx`
- Modify: `apps/web/package.json`
- Modify: root `package.json`

**Test expectations:**

- Export panel shows `.mp4` artifact name, duration, dimensions, and layer count.
- Invalid projects show a clear export error.

**Verify:**

```bash
pnpm --filter @tinker/editor test
pnpm --filter @tinker/web test
```

### Task 5: Final verification and commit

**Objective:** Prove the branch works and leave a reviewable commit.

**Commands:**

```bash
pnpm validate:schema
pnpm typecheck
pnpm -r test
pnpm --filter @tinker/rendering render:sample -- /tmp/tinker-sample-export.mp4
ffprobe -v error -show_entries format=format_name,duration -show_entries stream=codec_name,codec_type -of json /tmp/tinker-sample-export.mp4
pnpm --filter @tinker/web build
git status --short
git diff --stat
git add -A
git commit -m "[verified] add rendering export v0"
```
