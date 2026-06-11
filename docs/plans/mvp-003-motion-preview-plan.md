# MVP-003 Motion Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make editor preview consume motion-core cursor and camera math instead of hardcoded overlay assumptions.

**Architecture:** Add a pure `previewMotionState` adapter in `packages/editor/src/preview`, then keep `Preview.tsx` focused on rendering that state. The adapter derives frame dimensions, normalized/smoothed cursor points, active click indicators, normalized zoom regions, and deterministic cursor-follow camera transforms from the current project and timestamp.

**Tech Stack:** TypeScript, React, Vitest, Testing Library, `@tinker/project-schema`, existing `packages/editor/src/motion` utilities.

---

## File Structure

- Create: `packages/editor/src/preview/previewMotionState.ts`
- Create: `packages/editor/src/preview/previewMotionState.test.ts`
- Modify: `packages/editor/src/preview/Preview.tsx`
- Modify: `packages/editor/src/preview/Preview.test.tsx`
- Modify: `packages/editor/src/index.ts`
- Modify: `docs/core-mvp-checklist.md`
- Modify: `docs/dongha.md`

---

### Task 1: Preview Motion Adapter

**Files:**
- Create: `packages/editor/src/preview/previewMotionState.ts`
- Create: `packages/editor/src/preview/previewMotionState.test.ts`

- [x] **Step 1: Write failing adapter tests**

Add tests that prove:

```ts
const state = buildPreviewMotionState(project, 1);
expect(state.frame).toEqual({ width: 1080, height: 1920 });
expect(state.cursor?.cx).toBeCloseTo(0.5);
expect(state.cursor?.cy).toBeCloseTo(0.25);
```

Also test:

- `16:9`, `9:16`, and `1:1` fallback frames when active asset dimensions are missing
- active zoom returns `camera.scale > 1`
- repeated calls at the same timestamp return equal camera/cursor state after calling other timestamps first

- [x] **Step 2: Run red tests**

Run:

```bash
pnpm --filter @tinker/editor test -- src/preview/previewMotionState.test.ts
```

Expected: fail because `previewMotionState.ts` does not exist.

- [x] **Step 3: Implement adapter**

Implement:

```ts
export type PreviewMotionState = {
  frame: MotionFrame;
  camera: CameraTransform;
  cursor?: NormalizedCursorPoint;
  clickEvents: NormalizedCursorPoint[];
  activeZoomIds: string[];
};

export function buildPreviewMotionState(project: DemoProject, time: number): PreviewMotionState;
```

The adapter must:

- get the active clip and asset with `getActiveClip`
- infer frame dimensions from active asset dimensions or aspect-ratio fallback
- call `normalizeCursorTelemetry`
- call `smoothCursorTelemetry`
- call `normalizeZoomRegions`
- replay `resolveCameraTransformWithCursorFollow` from `createCursorFollowCameraState`
- return deterministic state for the requested timestamp

- [x] **Step 4: Run green adapter tests**

Run:

```bash
pnpm --filter @tinker/editor test -- src/preview/previewMotionState.test.ts
```

Expected: pass.

---

### Task 2: Preview Rendering Integration

**Files:**
- Modify: `packages/editor/src/preview/Preview.tsx`
- Modify: `packages/editor/src/preview/Preview.test.tsx`
- Modify: `packages/editor/src/index.ts`

- [x] **Step 1: Write failing React tests**

Update `Preview.test.tsx` so it expects:

```ts
const layer = screen.getByTestId("preview-motion-layer");
expect(layer).toHaveStyle({ transform: expect.stringContaining("scale(") });
```

Add a portrait/square-safe cursor test:

```ts
const cursor = screen.getByTestId("active-cursor");
expect(cursor).toHaveStyle({ left: "50%", top: "25%" });
```

The test project should use `aspectRatio: "9:16"` and cursor coordinates in a `1080x1920` frame so the old `x / 19.2`, `y / 10.8` math fails.

- [x] **Step 2: Run red React tests**

Run:

```bash
pnpm --filter @tinker/editor test -- src/preview/Preview.test.tsx
```

Expected: fail because the motion layer and normalized cursor styles are not implemented.

- [x] **Step 3: Integrate adapter in Preview**

`Preview.tsx` should:

- call `buildPreviewMotionState(project, currentTime)`
- wrap media/placeholder in `data-testid="preview-motion-layer"`
- apply camera transform to that layer
- render cursor from `motion.cursor.cx/cy`
- render clicks from `motion.clickEvents`
- remove hardcoded `x / 19.2` and `y / 10.8`
- stop rendering the old fixed active zoom rectangle as the authoritative zoom behavior

- [x] **Step 4: Export adapter if useful**

Export `PreviewMotionState` and `buildPreviewMotionState` from `packages/editor/src/index.ts` so future export/UI work can reuse the same preview-facing contract.

- [x] **Step 5: Run green React tests**

Run:

```bash
pnpm --filter @tinker/editor test -- src/preview/Preview.test.tsx src/preview/previewMotionState.test.ts
```

Expected: pass.

---

### Task 3: Verification, Docs, And Review

**Files:**
- Modify: `docs/core-mvp-checklist.md`
- Modify: `docs/dongha.md`
- Modify: `docs/plans/mvp-003-motion-preview-plan.md`

- [x] **Step 1: Run focused verification**

Run:

```bash
pnpm --filter @tinker/editor test -- src/preview/previewMotionState.test.ts src/preview/Preview.test.tsx src/motion/cursorTelemetry.test.ts src/motion/cameraTransform.test.ts
```

Expected: pass.

- [x] **Step 2: Search for stale hardcoded cursor math**

Run:

```bash
rg -n "x / 19\\.2|y / 10\\.8|active-zoom|normalizeCursorTelemetry|resolveCameraTransformWithCursorFollow" packages/editor/src/preview packages/editor/src/motion
```

Expected: no hardcoded coordinate division remains in preview. Motion-core functions are used by the adapter.

- [x] **Step 3: Run required verification gate**

Run:

```bash
pnpm validate:schema
pnpm typecheck
pnpm -r test
pnpm --filter @tinker/web build
```

Expected: all pass.

- [x] **Step 4: Update checklists**

Mark MVP-003 complete only if all checklist and acceptance criteria are satisfied by current evidence.

- [x] **Step 5: Review with agent**

Spawn a review agent to compare `docs/core-mvp-checklist.md`, this plan, the design doc, and implementation. If it finds issues, spawn a fixer agent with exact findings, verify its changes locally, then spawn another review agent for re-review.
