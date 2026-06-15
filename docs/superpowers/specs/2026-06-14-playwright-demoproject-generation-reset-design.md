# Playwright DemoProject Generation Reset Design

## Status

Approved for implementation planning.

## Context

Tinker's original architecture made `DemoProject` the editable source of truth: generation produces an editable project, the editor loads that project, and MP4 files are export artifacts. Person B's current local MVP is built and verified around that model: schema validation, project loading, preview, trim, zoom/camera motion, cursor/click effects, save/load, and real MP4 export.

Later generation work introduced a HyperFrames composition path. That path returns composition and video artifacts through `apps/api`, and the composition-editing specs treat `hyperframes/index.html` as the editable source of truth. This created split-brain architecture:

- the verified editor/export loop expects `job.result.project: DemoProject`
- the live API currently returns artifact lists
- composition-edit specs route product direction around HyperFrames source editing
- Playwright capture already exists, but API and docs do not consistently make it the core generation spine

This spec resets the product direction to the architecture that best matches the current MVP and the product vision: **generate an editable `DemoProject` from a real browser capture, then edit/export through the verified editor loop.**

## Product Decision

`DemoProject` is the canonical product state.

Successful live generation must return a schema-valid, editor-loadable `DemoProject`. Artifacts may accompany the project, but artifacts are derived outputs, evidence, or debug material. They are not the source of truth.

Playwright becomes the core generation path for V1:

```text
Product URL + repo URL + prompt
  -> product/repo analysis
  -> storyboard
  -> capture plan
  -> Playwright capture result
  -> compileProject()
  -> DemoProject
  -> editor / save / export
```

HyperFrames generation is removed from the primary product path. Existing HyperFrames/composition work may remain in the repository temporarily as historical or beta code, but it must not define the live generation API, primary app route, or product architecture.

## Superseded Direction

This spec supersedes the composition-source product direction recorded in:

- `docs/superpowers/specs/2026-06-11-generation-api-server-design.md`
- `docs/superpowers/specs/2026-06-13-composition-ai-edit-design.md`
- `docs/superpowers/specs/2026-06-14-composition-ai-edit-phase2-design.md`
- `docs/person-a-composition-edit-contract.md`

Those documents may remain as historical records, but new implementation planning should not use them as the product source of truth. Any active docs that currently describe HyperFrames composition source as the editable artifact should be marked superseded or updated to point at this reset.

## Goals

- Make the live API return a required `DemoProject` for successful generation jobs.
- Make Playwright the default and primary generation renderer.
- Route Person A's generation output into Person B's verified editor/export seam.
- Treat generated artifacts as secondary outputs attached to the job.
- Remove HyperFrames from the critical path for V1 product readiness.
- Preserve useful generated artifacts for debugging, provenance, and future export/render work.

## Non-Goals

- No new video editor model.
- No composition-source editing loop.
- No direct AI mutation of video files.
- No desktop automation.
- No captions, callouts, voiceover, audio mixing, or generic video editing.
- No requirement to immediately delete every HyperFrames file in the repository.
- No cloud persistence, accounts, multi-user job storage, or durable queues.

## Live API Contract

### Job Result Shape

`ApiGenerationResult` should become project-first:

```ts
type ApiGenerationResult = {
  project: DemoProject;
  artifacts?: ApiArtifact[];
  warnings: string[];
};
```

Rules:

- `project` is required when `status === "completed"`.
- `project` must parse with `DemoProjectSchema` before the job is marked completed.
- `warnings` is always present; use `[]` when clean.
- `artifacts` is optional but expected for normal jobs.
- Artifact generation failure should produce a warning or secondary error when the project is usable. It should not turn a valid generated project into a failed job unless the artifact is required for the project to load.
- A job must not complete with only artifact URLs and no `DemoProject`.

### Request Shape

The API continues to accept `ai-url-planning` requests:

```ts
type ApiCreateDemoRequest = {
  mode: "ai-url-planning";
  repoUrl: string;
  productUrl: string;
  prompt?: string;
  durationCapSeconds: number;
  aspectRatio: "16:9" | "9:16" | "1:1";
};
```

Renderer selection should be simplified for the primary path:

- Omitted `renderer` means Playwright.
- `renderer: "playwright"` is accepted if the field remains in the contract.
- `renderer: "hyperframes"` and `renderer: "both"` are rejected by the primary API.

The narrowest implementation may keep the shared renderer enum temporarily for internal code while the cleanup lands, but the public local API should accept only omitted renderer or `"playwright"`.

## Person A Generation Pipeline

Person A owns this V1 spine:

```text
analyzeWebsite(productUrl)
analyzeRepo(repoUrl)
planner({ analysis, repoAnalysis, prompt })
verifyCapturePlan(capturePlan)
runPlaywrightCapture(capturePlan)
compileProject({ storyboard, capturePlan, captureResult })
validate DemoProject
return ApiGenerationResult.project
```

Implementation guidance:

- `compileProject` is the handoff boundary into the editor.
- `runAiUrlDemo` should treat the Playwright result's `demo-project.json` as the primary output, not just one artifact among many.
- The API worker should load or receive the generated project and validate it before completing the job.
- Capture assets referenced by the project must be browser-previewable and export-resolvable under the local app's asset policy.
- Cursor/click events and zoom target suggestions should come from structured Playwright capture events where possible.

## Artifact Policy

Artifacts are still valuable, but they are subordinate to `DemoProject`.

Expected artifact kinds for Playwright generation:

- product analysis JSON
- product analysis screenshot
- repo analysis JSON
- storyboard JSON
- capture plan JSON
- capture result JSON
- captured video clips
- screenshots
- traces
- logs

Artifact invariants:

- Every artifact should be addressable by `kind`, `relativePath`, and `url`.
- Artifacts should include enough provenance to tell which job and project they came from.
- Artifacts that are referenced by `DemoProject.assets` must be resolvable by the editor/export pipeline.
- Artifacts not referenced by the project are debug/provenance only.
- No client should be required to infer project state from artifact paths.

## HyperFrames Policy

HyperFrames is no longer a V1 generation source of truth.

Allowed temporary states:

- historical specs and completed implementation records remain in `docs/`
- beta composition route may remain hidden while not promoted as primary product flow
- HyperFrames code may remain if deleting it would create unnecessary churn

Not allowed for the primary product path:

- successful generation returning only `composition-index` / `output-video`
- editor state derived only from `window.__timelines`
- AI edits that rewrite composition source as the main editing model
- API contracts that treat composition artifacts as equivalent to `DemoProject`

Future reintroduction is allowed only if HyperFrames consumes or derives from `DemoProject`, for example:

```text
DemoProject -> optional HyperFrames render/export artifact
```

It should not return as:

```text
HyperFrames composition -> canonical product state
```

## App Integration

The web app should use the live API the same way the mock client already models successful generation: receive a project and open the editor.

Flow:

```text
Create Demo
  -> POST /api/jobs
  -> poll GET /api/jobs/:id
  -> completed result contains DemoProject
  -> validate result.project in client boundary if needed
  -> open EditorScreen with projectOrigin: "generated"
```

The editor does not need to know whether the project came from a mock fixture, Playwright capture, or a saved JSON file. It should only receive a valid `DemoProject`.

## Migration Plan

### Phase 1: Contract Reset

- Update `ApiGenerationResultSchema` to require `project` and carry optional `artifacts` plus `warnings`.
- Add tests proving completed jobs without `project` are invalid.
- Keep artifact serving unchanged.
- Update API worker tests so fake successful jobs include a valid `DemoProject`.

### Phase 2: Worker Completion

- Make `runLocalGenerationJob` or the API worker surface the Playwright-generated `DemoProject` directly.
- Validate the project before `store.complete`.
- Preserve artifact indexing as secondary result data.
- Ensure project asset URIs line up with served local artifacts or the editor asset resolver.

### Phase 3: Web Client Wiring

- Make the live API generation client return/open `job.result.project`.
- Keep mock generation behavior aligned with the same result shape.
- Show warnings in the Create Demo progress surface.
- Treat artifact-only results as invalid failures.

### Phase 4: Docs Cleanup

- Mark composition-source specs as superseded by this reset.
- Update `docs/architecture.md` to reaffirm Playwright-to-`DemoProject` as V1.
- Update Person A handoff docs so live API success means `DemoProject` success.
- Update README if it still describes mock-only generation or composition-first behavior.

### Phase 5: HyperFrames Pruning

- Hide or remove primary navigation into composition beta flows.
- Remove HyperFrames renderer selection from user-facing API paths.
- Decide whether to keep HyperFrames code as an experimental renderer package or delete it in a separate cleanup plan.

## Error Handling

- Invalid request: fail before enqueueing with typed validation error.
- Analysis/planning/capture failure: fail the generation job with the current `GenerationError` stage.
- Capture succeeds but `compileProject` fails: fail the job at `assembly`.
- `compileProject` returns invalid `DemoProject`: fail the job at `assembly` or `validation`; do not complete artifact-only.
- Optional artifact indexing fails after project validation: complete with `project`, omit failed artifacts where safe, and add a warning.
- Required asset missing or unresolved: fail the job, because the editor cannot reliably load/export the project.

## Testing And Verification

Required tests:

- `ApiGenerationResultSchema` accepts `{ project, artifacts, warnings }`.
- `ApiGenerationResultSchema` rejects completed jobs with artifact-only results.
- API route tests complete jobs with a valid `DemoProject`.
- API route tests reject or fail artifact-only runner output.
- Demo assembly tests prove Playwright generation writes a valid `demo-project.json`.
- Web client tests prove live API success opens the editor using `job.result.project`.
- Existing editor/export tests remain green.

Verification commands:

```bash
pnpm validate:schema
pnpm --filter @tinker/generation-contract test
pnpm --filter @tinker/demo-assembly test
pnpm --filter @tinker/api test
pnpm --filter @tinker/web test
pnpm typecheck
pnpm --filter @tinker/web build
```

## Success Criteria

- A completed live API generation job always includes a valid `DemoProject`.
- The web app can open a live-generated Playwright project in the existing editor.
- The generated project can be previewed, edited, saved, and exported through the verified editor/export path.
- Artifact-only generation is impossible to report as success in the primary API.
- HyperFrames/composition-source editing is no longer described as the active product direction.
- Future workers can understand one product model: `DemoProject` is source of truth; artifacts are secondary.
