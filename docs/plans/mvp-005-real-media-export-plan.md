# MVP-005 Real Media Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace placeholder MP4 export with a real-media ffmpeg export that respects clips, trims, camera motion, cursor/click effects, output dimensions, and ffprobe verification.

**Architecture:** Extract motion-core into `@tinker/motion` to avoid an editor/rendering package cycle, then build a deterministic ffmpeg filter graph in `@tinker/rendering` from a frozen `DemoProject` snapshot and preflighted asset paths.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, ffmpeg, ffprobe, `@tinker/project-schema`, new `@tinker/motion`.

---

## File Map

- Create: `packages/motion/package.json`
- Create: `packages/motion/tsconfig.json`
- Create: `packages/motion/src/index.ts`
- Move/copy into new package first, then remove old copies after imports are updated:
  - `packages/editor/src/motion/cursorTelemetry.ts`
  - `packages/editor/src/motion/autoZoomSuggestions.ts`
  - `packages/editor/src/motion/cameraTransform.ts`
  - matching tests
- Modify: `packages/editor/package.json`
- Modify: `packages/editor/src/motion/index.ts`
- Modify: `packages/editor/src/preview/previewMotionState.ts`
- Modify: `packages/editor/src/autoZoomSuggestionFlow.ts`
- Modify: `packages/rendering/package.json`
- Modify: `packages/rendering/src/node/renderFinalToMp4.ts`
- Create: `packages/rendering/src/node/ffmpegFilterGraph.ts`
- Create: `packages/rendering/src/node/exportSnapshot.ts`
- Modify: `packages/rendering/src/node/probeMp4Artifact.ts`
- Modify: `packages/rendering/src/node/renderFinalToMp4.test.ts`
- Modify: `packages/rendering/src/node/index.ts`
- Modify: `packages/rendering/src/index.ts`
- Generate: `packages/project-schema/fixtures/assets/capture-001.mp4`
- Modify after implementation: `docs/core-mvp-checklist.md`, `docs/dongha.md`, this plan.

---

## Task 1: Extract Motion-Core Into `@tinker/motion`

- [x] **Step 1: Create package skeleton**

Create `packages/motion/package.json`:

```json
{
  "name": "@tinker/motion",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "pnpm --filter @tinker/project-schema build && tsc -p tsconfig.json",
    "typecheck": "pnpm --filter @tinker/project-schema build && tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@tinker/project-schema": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.9.3",
    "vitest": "^3.2.4"
  }
}
```

Create `packages/motion/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noEmit": false,
    "types": ["vitest/globals"]
  },
  "include": ["src/**/*.ts"]
}
```

- [x] **Step 2: Move motion files and tests**

Move the existing motion files into `packages/motion/src/` with the same filenames:

```text
cursorTelemetry.ts
cursorTelemetry.test.ts
autoZoomSuggestions.ts
autoZoomSuggestions.test.ts
cameraTransform.ts
cameraTransform.test.ts
index.ts
```

Keep the current import style inside the moved files except package-relative paths remain local.

- [x] **Step 3: Update editor re-export and imports**

Replace `packages/editor/src/motion/index.ts` with:

```ts
export * from "@tinker/motion";
```

Update editor imports that reference `./motion/*` directly:

```ts
// packages/editor/src/autoZoomSuggestionFlow.ts
import { suggestAutoZooms, type MotionFrame } from "@tinker/motion";

// packages/editor/src/preview/previewMotionState.ts
import {
  createCursorFollowCameraState,
  normalizeCursorTelemetry,
  normalizeZoomRegions,
  resolveCameraTransformWithCursorFollow,
  sampleSmoothedCursor,
  smoothCursorTelemetry,
  type CameraTransform,
  type MotionFrame,
  type NormalizedCursorPoint,
} from "@tinker/motion";
```

Add `@tinker/motion` to `packages/editor/package.json` dependencies and update editor scripts so they build motion before editor:

```json
"dependencies": {
  "@tinker/motion": "workspace:*",
  "@tinker/project-schema": "workspace:*",
  "@tinker/rendering": "workspace:*",
  "react": "^19.2.1",
  "react-dom": "^19.2.1"
}
```

- [x] **Step 4: Run focused motion/editor tests**

Run:

```bash
pnpm --filter @tinker/motion test
pnpm --filter @tinker/editor test -- src/autoZoomSuggestionFlow.test.ts src/preview/previewMotionState.test.ts
```

Expected: all tests pass with motion tests now running from `@tinker/motion`.

---

## Task 2: Freeze Export Snapshot And Return Probe Summary

- [x] **Step 1: Write failing snapshot/probe tests**

In `packages/rendering/src/node/renderFinalToMp4.test.ts`, add tests that prove:

```ts
it("freezes a validated project snapshot before export starts", async () => {
  const project = realVideoProject();
  const calls: Array<{ args: string[]; duration: number }> = [];

  await withRealVideoProjectRoot(async (projectRoot) => {
    const promise = renderFinalToMp4(project, {
      projectRoot,
      outputPath: join(projectRoot, "snapshot.mp4"),
      runCommand: async (_command, args) => {
        project.duration = 999;
        calls.push({ args, duration: project.duration });
      },
      runProbe: async () => ({
        streams: [{ codec_type: "video", codec_name: "h264" }],
        format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "2.000000" },
      }),
    });

    const result = await promise;
    expect(result.artifact.duration).toBe(2);
    expect(calls[0]?.args.join(" ")).not.toContain("999");
  });
});
```

Also assert `result.probe` exists and is returned.

- [x] **Step 2: Run red test**

Run:

```bash
pnpm --filter @tinker/rendering test -- src/node/renderFinalToMp4.test.ts
```

Expected: fail because `runProbe` and `result.probe` do not exist yet.

- [x] **Step 3: Add snapshot helper**

Create `packages/rendering/src/node/exportSnapshot.ts`:

```ts
import type { DemoProject } from "@tinker/project-schema";

export function freezeExportProjectSnapshot(project: DemoProject): DemoProject {
  return deepFreeze(structuredClone(project));
}
```

The implementation should not run full relational schema validation before asset preflight, because missing clip asset references must keep returning the structured `AssetResolutionError` from MVP-002. `buildFinalRenderPlan(snapshot)` still validates before ffmpeg starts.

- [x] **Step 4: Wire probe into result**

Modify `renderFinalToMp4.ts`:

```ts
import { freezeExportProjectSnapshot } from "./exportSnapshot.js";
import { probeMp4Artifact, type ProbeCommandRunner, type ProbedMp4Artifact } from "./probeMp4Artifact.js";

export type RenderFinalToMp4Options = {
  outputPath: string;
  projectRoot: string;
  allowedInputRoots?: string[];
  ffmpegPath?: string;
  ffprobePath?: string;
  runCommand?: CommandRunner;
  runProbe?: ProbeCommandRunner;
};

export type RenderFinalToMp4Result = {
  artifact: RenderedMp4Artifact;
  plan: FinalRenderPlan;
  probe: ProbedMp4Artifact;
};
```

At the start of `renderFinalToMp4`, use:

```ts
const snapshot = freezeExportProjectSnapshot(project);
```

Use `snapshot` for preflight and plan building. After ffmpeg completes, call:

```ts
const probe = await probeMp4Artifact(options.outputPath, {
  ffprobePath: options.ffprobePath,
  runCommand: options.runProbe,
});
```

Return `probe` and use parsed probe duration when finite.

- [x] **Step 5: Run green test**

Run:

```bash
pnpm --filter @tinker/rendering test -- src/node/renderFinalToMp4.test.ts
```

Expected: snapshot/probe tests pass.

---

## Task 3: Build Real-Media Ffmpeg Filter Graph

- [x] **Step 1: Write failing argv/filter tests**

In `packages/rendering/src/node/renderFinalToMp4.test.ts`, update the deterministic command test so it expects:

```ts
expect(calls[0]?.args).not.toContain("-f");
expect(calls[0]?.args.join(" ")).not.toContain("color=c=#0f172a:s=1920x1080:r=30:d=45");
expect(calls[0]?.args).toContain("-filter_complex");
expect(calls[0]?.args).toContain(join(projectRoot, "assets/capture-001.mp4"));
```

Add a trim test:

```ts
expect(filter).toContain("trim=start=1:end=2");
expect(filter).toContain("setpts=PTS-STARTPTS+0/TB");
```

- [x] **Step 2: Run red test**

Run:

```bash
pnpm --filter @tinker/rendering test -- src/node/renderFinalToMp4.test.ts
```

Expected: fail because command still uses lavfi placeholder input.

- [x] **Step 3: Create filter graph builder**

Create `packages/rendering/src/node/ffmpegFilterGraph.ts` with these public types:

```ts
import type { DemoProject } from "@tinker/project-schema";
import type { NodeAssetFileResolution } from "./assetResolution.js";
import type { FinalRenderPlan } from "../renderFinal.js";

export type FfmpegInput = {
  assetId: string;
  path: string;
  clipId: string;
};

export type FfmpegFilterGraph = {
  inputs: FfmpegInput[];
  filterComplex: string;
  outputLabel: string;
};

export function buildRealMediaFilterGraph(
  project: DemoProject,
  plan: FinalRenderPlan,
  resolutions: readonly NodeAssetFileResolution[],
): FfmpegFilterGraph {
  const okResolutions = resolutions.filter((resolution) => resolution.ok);
  const pathByAssetId = new Map(okResolutions.map((resolution) => [resolution.assetId, resolution.path]));
  const clips = project.tracks
    .filter((track) => track.type === "video")
    .flatMap((track) => track.clips.map((clip) => ({ track, clip })))
    .sort((left, right) => left.clip.start - right.clip.start);

  const inputs = clips.map(({ clip }) => ({
    assetId: clip.assetId,
    path: pathByAssetId.get(clip.assetId) ?? "",
    clipId: clip.id,
  }));

  const filters: string[] = [
    `color=c=#000000:s=${plan.output.width}x${plan.output.height}:r=${plan.timeline.fps}:d=${plan.timeline.duration}[base]`,
  ];

  let composedLabel = "base";
  clips.forEach(({ clip }, index) => {
    const clipLabel = `clip${index}`;
    const nextLabel = `media${index}`;
    const sourceEnd = clip.sourceEnd ?? clip.sourceStart + (clip.end - clip.start);
    filters.push(
      `[${index}:v]trim=start=${ffmpegNumber(clip.sourceStart)}:end=${ffmpegNumber(sourceEnd)},setpts=PTS-STARTPTS+${ffmpegNumber(clip.start)}/TB,scale=${plan.output.width}:${plan.output.height}:force_original_aspect_ratio=decrease,pad=${plan.output.width}:${plan.output.height}:(ow-iw)/2:(oh-ih)/2,setsar=1[${clipLabel}]`,
    );
    filters.push(
      `[${composedLabel}][${clipLabel}]overlay=0:0:enable='${enableBetween(clip.start, clip.end)}'[${nextLabel}]`,
    );
    composedLabel = nextLabel;
  });

  filters.push(`[${composedLabel}]format=yuv420p[vout]`);
  return { inputs, filterComplex: filters.join(";"), outputLabel: "vout" };
}
```

Use helper functions to keep escaping contained:

```ts
function ffmpegNumber(value: number) {
  return Number(value.toFixed(6)).toString();
}

function enableBetween(start: number, end: number) {
  return `between(t\\,${ffmpegNumber(start)}\\,${ffmpegNumber(end)})`;
}
```

- [x] **Step 4: Replace placeholder args**

Modify `renderFinalToMp4.ts` so `buildFfmpegArgs` accepts the graph:

```ts
function buildFfmpegArgs(plan: FinalRenderPlan, graph: FfmpegFilterGraph, outputPath: string): string[] {
  return [
    "-y",
    ...graph.inputs.flatMap((input) => ["-i", input.path]),
    "-filter_complex",
    graph.filterComplex,
    "-map",
    `[${graph.outputLabel}]`,
    "-t",
    String(plan.timeline.duration),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputPath,
  ];
}
```

- [x] **Step 5: Run green argv/filter tests**

Run:

```bash
pnpm --filter @tinker/rendering test -- src/node/renderFinalToMp4.test.ts
```

Expected: command tests pass and missing asset preflight tests still pass before ffmpeg is invoked.

---

## Task 4: Add Cursor/Click Overlays And Camera Motion

- [x] **Step 1: Write failing filter tests**

Add render tests that assert:

```ts
expect(filter).toContain("crop=");
expect(filter).toContain("scale=1920:1080");
expect(filter).toContain("drawbox=");
expect(filter).toContain("enable='between(t,12.1,12.6)'");
```

Add a zoom-edit regression that compares the camera filter string before and after changing `zoom.target`.

- [x] **Step 2: Run red test**

Run:

```bash
pnpm --filter @tinker/rendering test -- src/node/renderFinalToMp4.test.ts
```

Expected: fail because the new real-media graph does not yet add cursor/camera stages.

- [x] **Step 3: Use shared motion in filter graph**

Add `@tinker/motion` to `packages/rendering/package.json`, then import:

```ts
import {
  normalizeCursorTelemetry,
  normalizeZoomRegions,
  resolveCameraTransform,
} from "@tinker/motion";
```

Build a camera stage from normalized zoom regions. For MVP-005 this uses explicit zoom regions and static ffmpeg camera windows sampled through `@tinker/motion`.

Policy: MVP-005 does not attempt animated ramp/easing parity. The export graph samples one fixed crop/scale per static camera interval; it does not generate per-frame crop/scale expressions for ramp-in, ramp-out, or easing curves. Cursor-follow parity is also deferred to MVP-009.

- [x] **Step 4: Draw cursor/click effects before camera motion**

Normalize cursor events against `plan.source`, map them into the scaled/padded media area within `plan.output`, and append drawbox filters before the camera crop/scale stage:

```ts
drawbox=x=${x}:y=${y}:w=${size}:h=${size}:color=${color}:t=fill:enable='between(t,${start},${end})'
```

Use click events for 0.5 seconds and move events for a short visible pulse.

- [x] **Step 5: Run green overlay tests**

Run:

```bash
pnpm --filter @tinker/rendering test -- src/node/renderFinalToMp4.test.ts
```

Expected: camera and cursor filter tests pass.

---

## Task 5: Real MP4 Smoke Tests

- [x] **Step 1: Generate a valid fixture**

Replace `packages/project-schema/fixtures/assets/capture-001.mp4` with a small deterministic video:

```bash
ffmpeg -y \
  -f lavfi -i "testsrc2=size=320x180:rate=30:duration=3" \
  -an -c:v libx264 -pix_fmt yuv420p -movflags +faststart \
  packages/project-schema/fixtures/assets/capture-001.mp4
```

- [x] **Step 2: Add integration smoke tests**

Add tests in `renderFinalToMp4.test.ts` that run real ffmpeg and ffprobe when available:

```ts
it("exports a playable MP4 from real source media", async () => {
  await withFixtureProjectRoot(async (projectRoot) => {
    const result = await renderFinalToMp4(shortProject(), {
      projectRoot,
      outputPath: join(projectRoot, "real-source.mp4"),
    });

    expect(result.probe.streams.some((stream) => stream.codec_type === "video")).toBe(true);
    expect(result.artifact.width).toBe(1920);
    expect(result.artifact.height).toBe(1080);
    expect(result.artifact.duration).toBeGreaterThan(0);
  });
});
```

Add a trimmed fixture test that expects the probed duration to be close to the clip duration.

- [x] **Step 3: Run real smoke tests**

Run:

```bash
pnpm --filter @tinker/rendering test -- src/node/renderFinalToMp4.test.ts
```

Expected: ffmpeg creates real MP4 files and ffprobe validates them.

---

## Task 6: Update Checklists And Full Gate

- [x] **Step 1: Update docs**

Check off MVP-005 items in `docs/core-mvp-checklist.md` only after tests prove each item. Update `docs/dongha.md` export/current-status entries for real source media, camera motion, cursor/click export, and probe summary.

- [x] **Step 2: Run focused verification**

Run:

```bash
pnpm --filter @tinker/motion test
pnpm --filter @tinker/rendering test
pnpm --filter @tinker/editor test -- src/preview/previewMotionState.test.ts src/autoZoomSuggestionFlow.test.ts
```

Expected: all focused tests pass.

- [x] **Step 3: Run required full gate**

Run:

```bash
pnpm validate:schema
pnpm typecheck
pnpm -r test
pnpm --filter @tinker/web build
```

Expected: every command exits 0.

- [x] **Step 4: Request code review**

Spawn a review agent with the MVP-005 design, this plan, source-of-truth docs, and changed files. Fix Critical/High/Important issues with new regression tests first, then send a second re-review agent after fixes.

- [x] **Step 5: Mark MVP-005 complete**

Only after clean verification and clean re-review, check this task and mark MVP-005 `Status: Done` in `docs/core-mvp-checklist.md`.
