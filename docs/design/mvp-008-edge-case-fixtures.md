# MVP-008 Edge-Case Regression Fixture Suite Design

## Goal

Create a reusable suite of ugly-but-realistic `DemoProject` fixtures so schema validation, render planning, and export preflight regressions are caught before they reach the editor.

## Source Of Truth

- `docs/core-mvp-checklist.md` MVP-008
- `AGENTS.md` Person B ownership rules
- `docs/architecture.md` `DemoProject` as source of truth
- `packages/project-schema/src/validators.ts`
- `packages/rendering/src/renderFinal.ts`
- `packages/rendering/src/node/assetResolution.ts`
- `packages/project-schema/fixtures/demo-project.sample.json`

## Design

### Fixture Shape

Add a small TypeScript fixture module in `@tinker/project-schema`:

```ts
type EdgeCaseFixture = {
  id: string;
  description: string;
  project: DemoProject;
  exportable: boolean;
  expectedFailure?: "schema" | "asset_resolution";
};
```

Use builders instead of separate JSON files. This keeps fixtures type-aware, reduces duplicate boilerplate, and lets tests mutate the canonical sample without hand-syncing many JSON files.

### Required Fixture Coverage

The fixture suite must include:

- empty tracks
- one valid video clip
- multiple clips with a gap
- trimmed clip
- overlapping clips on separate tracks
- missing asset file
- invalid asset reference
- cursor events outside frame bounds
- duplicate timestamps
- zoom target outside frame bounds
- 16:9, 9:16, and 1:1 aspect ratios
- very short project under 1 second
- long project over 3 minutes

### Validation Semantics

Not every ugly state should be schema-invalid:

- Missing asset file is schema-valid but export-preflight-invalid.
- Invalid asset reference is schema-invalid because the clip references an unknown `assetId`.
- Cursor events outside frame bounds are schema-valid for now; motion/render code should tolerate them.
- Duplicate timestamps are schema-valid; deterministic ordering and sampling should tolerate them.
- Zoom target outside frame bounds is schema-valid for now; motion/render code should clamp/resolve later, but MVP-008 ensures it does not crash planning.

### Render Plan Coverage

Every exportable fixture should pass `DemoProjectSchema.parse` and `buildFinalRenderPlan`.

Render-plan assertions should prove:

- output dimensions match aspect ratio
- timeline duration is preserved
- media layers reflect clips, gaps, trims, and overlapping tracks
- cursor and zoom edge cases produce layers without crashing

### Structured Failure Coverage

Missing/invalid fixtures should fail predictably:

- invalid asset reference fails schema validation with an `assetId` issue
- missing asset file fails `preflightExportAssets` with `AssetResolutionError` and `missing_file`

## Non-Goals

- No new production editing behavior.
- No schema tightening for cursor bounds, duplicate timestamps, or zoom bounds in MVP-008.
- No real ffmpeg render per fixture; render-plan and asset preflight coverage are enough for this ticket.
- No full JSON fixture catalog unless a later workflow needs file-based fixtures.

## Acceptance Evidence

MVP-008 is complete when:

- all checklist fixture cases exist in the edge fixture suite
- each fixture has schema validation coverage
- exportable fixtures have render-plan coverage
- missing/invalid fixtures fail with structured errors, not crashes
- focused tests and the full verification gate pass
