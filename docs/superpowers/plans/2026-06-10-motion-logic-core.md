# Motion Logic Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build backend-only motion utilities for cursor telemetry, auto-zoom suggestions, camera transforms, and cursor-follow behavior over the existing `DemoProject.cursorEvents` and `DemoProject.zooms`.

**Architecture:** Add pure TypeScript modules under `packages/editor/src/motion/`. The modules consume `@tinker/project-schema` types and return plain objects or `ZoomKeyframe`-compatible suggestions. They do not mutate projects, modify schema, or wire into UI/preview/export.

**Tech Stack:** TypeScript, Vitest, `@tinker/project-schema`, existing `@tinker/editor` export patterns.

---

## Task 1: Cursor Telemetry

**Files:**
- Create: `packages/editor/src/motion/cursorTelemetry.ts`
- Create: `packages/editor/src/motion/cursorTelemetry.test.ts`

- [ ] Add tests for invalid/non-finite event filtering, coordinate/time clamping, stable time sorting, pixel-to-normalized conversion, interpolation before/between/after points, synthetic in-between move samples, and smoothing bounds.
- [ ] Implement `MotionFrame`, `NormalizedCursorPoint`, `normalizeCursorTelemetry`, `interpolateCursorPosition`, `smoothCursorTelemetry`, and `sampleSmoothedCursor`.
- [ ] Run `pnpm --filter @tinker/editor exec vitest run src/motion/cursorTelemetry.test.ts`.

## Task 2: Auto-Zoom Suggestions

**Files:**
- Create: `packages/editor/src/motion/autoZoomSuggestions.ts`
- Create: `packages/editor/src/motion/autoZoomSuggestions.test.ts`

- [ ] Add tests for short dwell rejection, too-long dwell rejection, sustained dwell acceptance, existing zoom overlap exclusion, minimum spacing, deterministic IDs, and target clamping near frame edges.
- [ ] Implement OpenScreen-inspired dwell detection with `DEFAULT_MIN_DWELL_SECONDS`, `DEFAULT_MAX_DWELL_SECONDS`, `DEFAULT_DWELL_MOVE_THRESHOLD`, and `DEFAULT_SUGGESTION_SPACING_SECONDS`.
- [ ] Implement `detectZoomDwellCandidates` and `suggestAutoZooms`, returning current-schema-compatible `ZoomKeyframe` objects.
- [ ] Run `pnpm --filter @tinker/editor exec vitest run src/motion/autoZoomSuggestions.test.ts`.

## Task 3: Camera Transform And Cursor Follow

**Files:**
- Create: `packages/editor/src/motion/cameraTransform.ts`
- Create: `packages/editor/src/motion/cameraTransform.test.ts`

- [ ] Add tests for identity transform, deterministic active zoom transform, overlapping zoom priority, focus clamping, cursor safe-zone hold/recenter behavior, inactive-gap state reset, and zoom-out freeze after full zoom.
- [ ] Implement `ZoomFocus`, `NormalizedZoomRegion`, `CameraTransform`, `CursorFollowCameraState`, and `createCursorFollowCameraState`.
- [ ] Implement `normalizeZoomRegions`, `resolveCameraTransform`, `computeCursorFollowFocus`, and `resolveCameraTransformWithCursorFollow`.
- [ ] Run `pnpm --filter @tinker/editor exec vitest run src/motion/cameraTransform.test.ts`.

## Task 4: Export Surface And Verification

**Files:**
- Create: `packages/editor/src/motion/index.ts`
- Modify: `packages/editor/src/index.ts`

- [ ] Export all motion modules through `packages/editor/src/motion/index.ts`.
- [ ] Export the motion barrel from `@tinker/editor`.
- [ ] Confirm no files under `packages/project-schema`, UI, preview, rendering, export, storage, or capture are modified for this slice.
- [ ] Run `pnpm --filter @tinker/editor test`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm -r test`.
- [ ] Run `git diff --check`.

## Manual Probe Checklist

- [ ] Cursor telemetry probe: messy unsorted events filter invalid samples, clamp bounds, interpolate correctly, and smooth within `[0, 1]`.
- [ ] Auto-zoom probe: sustained dwell emits a zoom; short/too-long dwell do not; existing zoom overlap is skipped; edge targets clamp.
- [ ] Camera probe: active transforms ramp deterministically; overlapping zooms choose the stronger/later region; safe-zone follow holds/recenters; inactive gaps reset state.
