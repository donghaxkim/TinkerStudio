# MVP-009 Preview/Export Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove and tighten preview/export parity for camera transforms, coordinate normalization, animated ramp/easing, and cursor-follow behavior.

**Architecture:** Add a shared deterministic camera resolver in `@tinker/motion`, use it from editor preview, and use it from the Node ffmpeg graph camera interval builder. Export remains a static-interval ffmpeg graph, but intervals are frame-sampled and merged so ramp/easing and cursor-follow are represented without replacing the renderer.

**Tech Stack:** TypeScript, Vitest, existing `@tinker/motion`, React/editor preview adapter, Node ffmpeg filter graph builder.

---

## File Map

- Modify: `packages/motion/src/cameraTransform.ts`
- Modify: `packages/motion/src/cameraTransform.test.ts`
- Modify: `packages/editor/src/preview/previewMotionState.ts`
- Modify: `packages/editor/src/preview/previewMotionState.test.ts`
- Modify: `packages/rendering/src/node/ffmpegFilterGraph.ts`
- Modify: `packages/rendering/src/node/renderFinalToMp4.test.ts`
- Create: `packages/rendering/src/node/previewExportParity.test.ts`
- Modify after implementation: `docs/core-mvp-checklist.md`
- Modify after implementation: `docs/dongha.md`
- Modify after implementation: this plan

---

## Task 1: Add Shared Deterministic Camera Resolver

**Files:**

- Modify: `packages/motion/src/cameraTransform.ts`
- Modify: `packages/motion/src/cameraTransform.test.ts`

- [x] **Step 1: Add failing motion tests**

Add tests for `resolveDeterministicCameraTransform`:

- same timestamp returns same transform after unrelated calls
- cursor-follow recentering is reconstructed from prior cursor samples
- zoom ramp/easing strength is represented at transition timestamps

- [x] **Step 2: Run red motion tests**

Run:

```bash
pnpm --filter @tinker/motion test -- src/cameraTransform.test.ts
```

Expected: fail because `resolveDeterministicCameraTransform` does not exist.

- [x] **Step 3: Implement shared resolver**

Move the deterministic replay logic currently private to `previewMotionState.ts` into `cameraTransform.ts`.

Export:

```ts
export type DeterministicCameraOptions = ResolveWithCursorFollowOptions & {
  maxTime?: number;
};

export function resolveDeterministicCameraTransform(
  regions: readonly NormalizedZoomRegion[],
  cursorPoints: readonly NormalizedCursorPoint[],
  time: number,
  options: DeterministicCameraOptions = {},
): CameraTransform
```

- [x] **Step 4: Run green motion tests**

Run:

```bash
pnpm --filter @tinker/motion test -- src/cameraTransform.test.ts
pnpm --filter @tinker/motion typecheck
```

Expected: motion tests and typecheck pass.

---

## Task 2: Use Shared Resolver In Preview

**Files:**

- Modify: `packages/editor/src/preview/previewMotionState.ts`
- Modify: `packages/editor/src/preview/previewMotionState.test.ts`

- [x] **Step 1: Add preview parity/import test**

Add a test that compares `buildPreviewMotionState(project, time).camera` to calling `resolveDeterministicCameraTransform` with the same normalized zoom/cursor inputs.

- [x] **Step 2: Run red/guard preview tests**

Run:

```bash
pnpm --filter @tinker/editor test -- src/preview/previewMotionState.test.ts
```

Expected: fail until preview imports and uses the shared resolver, or pass as a guard after Task 1 if behavior already matches.

- [x] **Step 3: Replace private preview replay helper**

Remove the private `createCursorFollowCameraState`/sample replay helper from `previewMotionState.ts` and call `resolveDeterministicCameraTransform`.

- [x] **Step 4: Run green preview tests**

Run:

```bash
pnpm --filter @tinker/editor test -- src/preview/previewMotionState.test.ts
pnpm --filter @tinker/editor typecheck
```

Expected: preview motion tests and typecheck pass.

---

## Task 3: Use Frame-Sampled Shared Camera Intervals In Export

**Files:**

- Modify: `packages/rendering/src/node/ffmpegFilterGraph.ts`
- Modify: `packages/rendering/src/node/renderFinalToMp4.test.ts`

- [x] **Step 1: Add failing export camera tests**

Add tests that prove:

- camera filters vary during zoom ramp/easing instead of one static zoom-window filter
- cursor-follow changes export camera focus when cursor leaves the safe zone

- [x] **Step 2: Run red rendering tests**

Run:

```bash
pnpm --filter @tinker/rendering test -- src/node/renderFinalToMp4.test.ts
```

Expected: fail because export currently uses static midpoint camera intervals and ignores cursor-follow.

- [x] **Step 3: Implement frame-sampled camera intervals**

In `ffmpegFilterGraph.ts`:

- import `resolveDeterministicCameraTransform` and `smoothCursorTelemetry`
- normalize cursor telemetry against `plan.source`
- sample camera transforms at frame cadence across the project duration
- merge adjacent samples with identical static camera filters
- export a testable `buildCameraIntervalsForExport` helper

- [x] **Step 4: Run green rendering tests**

Run:

```bash
pnpm --filter @tinker/rendering test -- src/node/renderFinalToMp4.test.ts
pnpm --filter @tinker/rendering typecheck
```

Expected: rendering tests and typecheck pass.

---

## Task 4: Add Preview/Export Parity Tests

**Files:**

- Create: `packages/rendering/src/node/previewExportParity.test.ts`

- [x] **Step 1: Add parity tests**

Create tests that compare preview camera state to export camera intervals at fixed timestamps for:

- regular zoom active timestamp
- ramp/easing timestamp
- cursor-follow timestamp
- 16:9, 9:16, and 1:1 aspect-ratio fixture focus/output placement

- [x] **Step 2: Run parity tests**

Run:

```bash
pnpm --filter @tinker/rendering test -- src/node/previewExportParity.test.ts
```

Expected: pass after Tasks 1-3.

- [x] **Step 3: Run package typechecks**

Run:

```bash
pnpm --filter @tinker/motion typecheck
pnpm --filter @tinker/editor typecheck
pnpm --filter @tinker/rendering typecheck
```

Expected: all typechecks pass.

---

## Task 5: Review, Verify, And Check Off MVP-009

**Files:**

- Modify: `docs/core-mvp-checklist.md`
- Modify: `docs/dongha.md`
- Modify: this plan

- [x] **Step 1: Run focused MVP-009 verification**

Run:

```bash
pnpm --filter @tinker/motion test -- src/cameraTransform.test.ts
pnpm --filter @tinker/editor test -- src/preview/previewMotionState.test.ts
pnpm --filter @tinker/rendering test -- src/node/renderFinalToMp4.test.ts src/node/previewExportParity.test.ts
```

Expected: focused MVP-009 tests pass.

- [x] **Step 2: Run full gate**

Run:

```bash
pnpm validate:schema
pnpm typecheck
pnpm -r test
pnpm --filter @tinker/web build
```

Expected: every command exits 0.

- [x] **Step 3: Request MVP-009 review**

Spawn a review agent with the MVP-009 design, this plan, source-of-truth checklist, and changed files. Require review of:

- shared deterministic camera resolver
- preview adoption
- export frame-sampled camera intervals
- cursor-follow parity
- ramp/easing parity
- aspect-ratio/cursor placement parity
- no unrelated behavior or schema changes

- [x] **Step 4: Fix review findings and re-review**

If Critical/Important issues are found, spawn a fixer agent with exact findings and scoped file ownership. After the fixer reports done, spawn a fresh reviewer. Repeat until no blockers remain.

- [x] **Step 5: Check off MVP-009**

Only after green verification and clean review:

- Mark MVP-009 `Status: Done` in `docs/core-mvp-checklist.md`.
- Check every MVP-009 checklist item and acceptance criterion.
- Update `docs/dongha.md` current status and next steps so MVP-010 final gate is next.
- Check off this plan's Task 5 steps.
