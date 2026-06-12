# MVP-008 Edge-Case Regression Fixture Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable edge-case `DemoProject` fixtures and regression tests for schema validation, render-plan behavior, and structured export-preflight failures.

**Architecture:** Put typed fixture builders in `packages/project-schema/src/edgeCaseFixtures.ts` and export them from `@tinker/project-schema`. Keep behavior tests close to the consumers: schema coverage in `packages/project-schema`, render-plan coverage in `packages/rendering`, and asset failure coverage in `packages/rendering/node`.

**Tech Stack:** TypeScript, Zod, Vitest, pnpm workspaces, existing `DemoProjectSchema`, `buildFinalRenderPlan`, and `preflightExportAssets`.

---

## File Map

- Create: `packages/project-schema/src/edgeCaseFixtures.ts`
- Create: `packages/project-schema/src/edgeCaseFixtures.test.ts`
- Modify: `packages/project-schema/src/index.ts`
- Create: `packages/rendering/src/edgeCaseFixtures.test.ts`
- Modify: `packages/rendering/src/node/assetResolution.test.ts`
- Modify after implementation: `docs/core-mvp-checklist.md`
- Modify after implementation: `docs/dongha.md`
- Modify after implementation: this plan

---

## Task 1: Add Typed Edge-Case Fixture Suite

**Files:**

- Create: `packages/project-schema/src/edgeCaseFixtures.ts`
- Create: `packages/project-schema/src/edgeCaseFixtures.test.ts`
- Modify: `packages/project-schema/src/index.ts`

- [x] **Step 1: Add failing fixture-suite tests**

Create `packages/project-schema/src/edgeCaseFixtures.test.ts` with tests that import `EDGE_CASE_DEMO_PROJECT_FIXTURES`, assert the required fixture ids exist, assert exportable fixtures parse with `DemoProjectSchema`, and assert `invalid_asset_reference` fails with an `assetId` issue.

- [x] **Step 2: Run red schema fixture tests**

Run:

```bash
pnpm --filter @tinker/project-schema test -- src/edgeCaseFixtures.test.ts
```

Expected: fail because the fixture module does not exist.

- [x] **Step 3: Implement fixture builders**

Create `edgeCaseFixtures.ts` with:

- `EdgeCaseFixture`
- `EDGE_CASE_DEMO_PROJECT_FIXTURES`
- a `projectWith` helper based on the canonical sample shape
- one fixture for each MVP-008 checklist case

The `invalid_asset_reference` fixture should be intentionally schema-invalid. The `missing_asset` fixture should be schema-valid but point to `assets/missing-capture.mp4`.

- [x] **Step 4: Export fixtures**

Add this to `packages/project-schema/src/index.ts`:

```ts
export * from "./edgeCaseFixtures.js";
```

- [x] **Step 5: Run green schema fixture tests**

Run:

```bash
pnpm --filter @tinker/project-schema test -- src/edgeCaseFixtures.test.ts
pnpm --filter @tinker/project-schema typecheck
```

Expected: project-schema fixture tests and typecheck pass.

---

## Task 2: Add Render-Plan Coverage For Exportable Fixtures

**Files:**

- Create: `packages/rendering/src/edgeCaseFixtures.test.ts`

- [x] **Step 1: Add failing render-plan tests**

Create `packages/rendering/src/edgeCaseFixtures.test.ts` that imports `EDGE_CASE_DEMO_PROJECT_FIXTURES` and asserts:

- each `exportable` fixture builds a final render plan
- aspect-ratio fixtures produce `1920x1080`, `1080x1920`, and `1080x1080`
- multiple clips with a gap preserve clip starts/ends
- trimmed clip preserves `sourceStart`/`sourceEnd`
- overlapping clips on separate tracks produce two media layers
- cursor/zoom edge cases produce cursor/zoom layers without crashing

- [x] **Step 2: Run red rendering fixture tests**

Run:

```bash
pnpm --filter @tinker/rendering test -- src/edgeCaseFixtures.test.ts
```

Expected: fail until Task 1 exports the fixture suite and render-plan expectations are wired.

- [x] **Step 3: Fix fixture or render-plan gaps only if tests expose crashes**

Do not add new product behavior unless a fixture reveals an actual crash. Prefer adjusting fixtures to represent valid existing `DemoProject` states.

- [x] **Step 4: Run green rendering fixture tests**

Run:

```bash
pnpm --filter @tinker/rendering test -- src/edgeCaseFixtures.test.ts
pnpm --filter @tinker/rendering typecheck
```

Expected: rendering fixture tests and typecheck pass.

---

## Task 3: Add Structured Failure Coverage

**Files:**

- Modify: `packages/rendering/src/node/assetResolution.test.ts`

- [x] **Step 1: Add failing missing/invalid fixture tests**

Add tests that:

- find `missing_asset` and assert `preflightExportAssets` rejects with `AssetResolutionError` containing `missing_file`
- find `invalid_asset_reference` and assert `DemoProjectSchema.safeParse` fails with an `assetId` issue instead of crashing

- [x] **Step 2: Run red/focused failure tests**

Run:

```bash
pnpm --filter @tinker/rendering test -- src/node/assetResolution.test.ts
```

Expected: fail until fixture suite exports are available and assertions are wired.

- [x] **Step 3: Implement minimal fixes**

Only adjust fixtures or test helpers. Do not alter asset-resolution behavior unless the existing code fails to produce structured errors.

- [x] **Step 4: Run green failure tests**

Run:

```bash
pnpm --filter @tinker/rendering test -- src/node/assetResolution.test.ts
pnpm --filter @tinker/rendering typecheck
```

Expected: asset-resolution tests and typecheck pass.

---

## Task 4: Review, Verify, And Check Off MVP-008

**Files:**

- Modify: `docs/core-mvp-checklist.md`
- Modify: `docs/dongha.md`
- Modify: this plan

- [x] **Step 1: Run focused MVP-008 verification**

Run:

```bash
pnpm --filter @tinker/project-schema test -- src/edgeCaseFixtures.test.ts
pnpm --filter @tinker/rendering test -- src/edgeCaseFixtures.test.ts src/node/assetResolution.test.ts
```

Expected: all MVP-008 focused tests pass.

- [x] **Step 2: Run full gate**

Run:

```bash
pnpm validate:schema
pnpm typecheck
pnpm -r test
pnpm --filter @tinker/web build
```

Expected: every command exits 0.

- [x] **Step 3: Request MVP-008 review**

Spawn a review agent with the MVP-008 design, this plan, source-of-truth checklist, and changed files. Require review of:

- all checklist fixtures are represented
- schema-valid versus intentionally invalid fixtures are classified correctly
- render-plan coverage proves exportable fixtures do not crash
- missing/invalid fixtures fail with structured errors
- no unrelated product behavior was added

- [x] **Step 4: Fix review findings and re-review**

If Critical/Important issues are found, spawn a fixer agent with exact findings and scoped file ownership. After the fixer reports done, spawn a fresh reviewer. Repeat until no blockers remain.

- [x] **Step 5: Check off MVP-008**

Only after green verification and clean review:

- Mark MVP-008 `Status: Done` in `docs/core-mvp-checklist.md`.
- Check every MVP-008 checklist item and acceptance criterion.
- Update `docs/dongha.md` current status and next steps so MVP-009 preview/export parity is next.
- Check off this plan's Task 4 steps.
