# Dual Generation Methods Design

## Status

Approved for implementation planning.

## Context

Tinker has two viable generation paths:

- **Playwright capture**: records a real web app interaction and compiles it into an editable `DemoProject` for the existing editor/export loop.
- **HyperFrames composition**: generates a polished HTML/GSAP composition and rendered video artifacts for the composition editor/revision loop.

The prior reset draft overcorrected by making Playwright the only primary path and demoting HyperFrames. That does not match the intended product direction. Users should be able to choose the video generation method they want, and neither method should be described as more important than the other.

This spec defines a dual-method architecture where both paths are first-class, but each keeps its native editing model.

## Product Decision

Playwright and HyperFrames are equal first-class generation methods.

The user-facing Create Demo flow should let the user choose:

- **Playwright recording**: best when the user wants real captured app footage, cursor/click events, and the existing `DemoProject` editor/export path.
- **HyperFrames composition**: best when the user wants a generated polished composition, richer motion/design control, and composition-source revision editing.

The two paths have different canonical editable outputs:

```ts
type GenerationMethod = "playwright" | "hyperframes";
```

```text
Playwright method
  -> canonical editable output: DemoProject
  -> editor: DemoProject editor
  -> export: project renderer / MP4 export
```

```text
HyperFrames method
  -> canonical editable output: HyperFrames composition source
  -> editor: composition editor
  -> export: HyperFrames render / output MP4
```

Neither native output should be forced into the other model in V1.

## Method Pipelines

### Playwright Method

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

### HyperFrames Method

```text
Product URL + repo URL + prompt
  -> product/repo analysis
  -> HyperFrames composition generation
  -> artifact validation
  -> HyperFrames render
  -> composition source + output MP4 + manifests/logs
  -> composition editor / revision loop / export
```

## Updated Direction

This spec supersedes the Playwright-only reset direction and updates the older single-method docs:

- `docs/superpowers/specs/2026-06-11-generation-api-server-design.md`
- `docs/superpowers/specs/2026-06-13-generation-api-renderer-selection-design.md`
- the previous committed file path `docs/superpowers/specs/2026-06-14-playwright-demoproject-generation-reset-design.md`

The composition-edit docs remain relevant for the HyperFrames method. They should be updated only where they claim HyperFrames replaces `DemoProject` for the whole product. The correct framing is: HyperFrames composition source is canonical **for HyperFrames jobs**, while `DemoProject` is canonical **for Playwright jobs**.

## Goals

- Make Playwright and HyperFrames explicit user-selectable generation methods.
- Return method-specific successful job results instead of one artifact-only shape.
- Keep `DemoProject` required for Playwright success.
- Keep composition source and rendered output artifacts required for HyperFrames success.
- Route each method to its native editor.
- Preserve shared progress, job status, artifact serving, and error handling.
- Avoid language that declares either method more important than the other.

## Non-Goals

- No forced conversion between `DemoProject` and HyperFrames composition source.
- No direct AI mutation of video files.
- No desktop automation.
- No captions, callouts, voiceover, audio mixing, or generic video editing.
- No cloud persistence, accounts, multi-user job storage, or durable queues.
- No requirement to support `renderer: "both"` in the user-facing Create Demo flow.

## Live API Contract

### Job Result Shape

`ApiGenerationResult` should become method-discriminated:

```ts
type ApiGenerationResult = PlaywrightGenerationResult | HyperframesGenerationResult;

type PlaywrightGenerationResult = {
  method: "playwright";
  project: DemoProject;
  artifacts: ApiArtifact[];
  warnings: string[];
};

type HyperframesGenerationResult = {
  method: "hyperframes";
  composition: {
    indexArtifact: ApiArtifact;
    outputVideoArtifact: ApiArtifact;
    generationManifestArtifact?: ApiArtifact;
    assetManifestArtifact?: ApiArtifact;
  };
  artifacts: ApiArtifact[];
  warnings: string[];
};
```

Rules:

- `method` is required and determines the result shape.
- `PlaywrightGenerationResult.project` is required and must parse with `DemoProjectSchema` before the job is marked completed.
- `HyperframesGenerationResult.composition.indexArtifact` is required and must point to the generated composition source.
- `HyperframesGenerationResult.composition.outputVideoArtifact` is required and must point to the rendered MP4.
- `warnings` is always present; use `[]` when clean.
- `artifacts` is always present and contains all served artifacts for the selected method.
- A completed job must not return a shape from the wrong method.
- Clients must branch by `result.method`, not by guessing artifact paths.

### Request Shape

The API continues to accept `ai-url-planning` requests, with an explicit method selection:

```ts
type ApiCreateDemoRequest = {
  mode: "ai-url-planning";
  renderer: "playwright" | "hyperframes";
  repoUrl: string;
  productUrl: string;
  prompt?: string;
  durationCapSeconds: number;
  aspectRatio: "16:9" | "9:16" | "1:1";
};
```

Rules:

- The user-facing app should always send `renderer` explicitly.
- The API should accept `"playwright"` and `"hyperframes"` as equal choices.
- Omitted `renderer` may remain temporarily defaulted for backwards compatibility, but the product UI must not rely on an implicit default.
- `renderer: "both"` should be rejected by the user-facing API unless a separate comparison/debug flow is designed.

## Person A Generation Pipeline

Person A owns both generation spines.

### Playwright Spine

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

Playwright implementation guidance:

- `compileProject` is the handoff boundary into the editor.
- `runAiUrlDemo` should treat the Playwright result's `demo-project.json` as the Playwright method's primary output, not just one artifact among many.
- The API worker should load or receive the generated project and validate it before completing the job.
- Capture assets referenced by the project must be browser-previewable and export-resolvable under the local app's asset policy.
- Cursor/click events and zoom target suggestions should come from structured Playwright capture events where possible.

### HyperFrames Spine

```text
analyzeWebsite(productUrl)
analyzeRepo(repoUrl)
generateHyperframes({ analysis, repoAnalysis, prompt })
validateHyperframesArtifacts(hyperframesDir)
runHyperframesRender({ hyperframesDir })
return composition artifacts
```

HyperFrames implementation guidance:

- `validateHyperframesArtifacts` is the handoff boundary into the composition editor.
- The job must not complete unless `composition-index` and `output-video` artifacts exist and are served.
- The composition source remains the canonical editable state for HyperFrames jobs.
- Revision/edit endpoints may build on the existing composition edit specs, but only for HyperFrames jobs.

## Artifact Policy

Artifacts are method-specific outputs. Their role depends on the selected method.

Expected artifact kinds for Playwright:

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

Expected artifact kinds for HyperFrames:

- product analysis JSON
- product analysis screenshot
- repo analysis JSON
- composition index HTML
- output MP4
- generation manifest JSON
- asset manifest JSON
- lint log
- render log
- generated assets

Artifact invariants:

- Every artifact should be addressable by `kind`, `relativePath`, and `url`.
- Artifacts should include enough provenance to tell which job and project they came from.
- Playwright artifacts referenced by `DemoProject.assets` must be resolvable by the editor/export pipeline.
- HyperFrames composition artifacts must be resolvable by the composition preview/render pipeline.
- No client should be required to infer selected method or editable state from artifact paths.

## Editor Routing

The web app routes completed jobs by `result.method`:

```text
result.method === "playwright"
  -> open DemoProject EditorScreen with result.project

result.method === "hyperframes"
  -> open CompositionDemoScreen / CompositionEditor with result.composition + artifacts
```

The Create Demo UI should present the choice before generation, with clear language:

- Playwright recording: real browser capture, editable timeline project.
- HyperFrames composition: generated motion composition, rendered video, composition revisions.

Neither option should be labeled default, legacy, beta, or advanced unless the user explicitly opts into experimental development surfaces.

## App Integration

Flow:

```text
Create Demo
  -> user chooses Playwright or HyperFrames
  -> POST /api/jobs with renderer
  -> poll GET /api/jobs/:id
  -> completed result has method-specific payload
  -> route to matching editor
```

The app should keep both editor surfaces available:

- Playwright jobs use the existing `DemoProject` editor/export loop.
- HyperFrames jobs use the composition preview/timeline/revision loop.

## Migration Plan

### Phase 1: Contract Reset

- Replace artifact-only `ApiGenerationResult` with the discriminated union.
- Add schema tests for valid Playwright and HyperFrames results.
- Add schema tests rejecting Playwright results without `project`.
- Add schema tests rejecting HyperFrames results without `composition-index` or `output-video`.
- Keep artifact serving unchanged.

### Phase 2: API Worker Completion

- For `renderer: "playwright"`, load/validate the generated `DemoProject` and complete with `method: "playwright"`.
- For `renderer: "hyperframes"`, validate required composition artifacts and complete with `method: "hyperframes"`.
- Preserve artifact indexing for both methods.
- Reject or fail `renderer: "both"` until a separate comparison/debug design exists.

### Phase 3: Web Client Wiring

- Add explicit method choice to Create Demo.
- Make `createApiGenerationClient` parse and return the discriminated result.
- Route Playwright results to the `DemoProject` editor.
- Route HyperFrames results to the composition editor.
- Keep mock clients aligned with the same result shapes.

### Phase 4: Docs Cleanup

- Update `docs/architecture.md` to describe dual first-class methods.
- Update Person A handoff docs to include both result shapes.
- Update composition docs so they apply specifically to HyperFrames jobs.
- Update `README.md` to explain the method choice.

## Error Handling

- Invalid request: fail before enqueueing with typed validation error.
- Unknown renderer: fail before enqueueing.
- Missing renderer: transitional default only if compatibility requires it; otherwise fail before enqueueing.
- Playwright analysis/planning/capture failure: fail the generation job with the current `GenerationError` stage.
- Playwright capture succeeds but `compileProject` fails: fail the job at `assembly`.
- Playwright `compileProject` returns invalid `DemoProject`: fail the job at `assembly` or `validation`.
- HyperFrames generation, lint, validation, or render failure: fail the job with the corresponding stage/log context.
- A job must not be marked completed if the required native editable output for its method is missing.

## Testing And Verification

Required tests:

- `ApiGenerationResultSchema` accepts valid Playwright and HyperFrames result shapes.
- `ApiGenerationResultSchema` rejects method/result mismatches.
- API route tests complete Playwright jobs with a valid `DemoProject`.
- API route tests complete HyperFrames jobs with required composition artifacts.
- API route tests reject or fail `renderer: "both"` in the user-facing path.
- Demo assembly tests prove Playwright generation writes a valid `demo-project.json`.
- Demo assembly tests prove HyperFrames generation returns validated composition artifacts.
- Web client tests prove Playwright success opens the `DemoProject` editor.
- Web client tests prove HyperFrames success opens the composition editor.
- Existing editor/export and composition editor tests remain green.

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

- Create Demo lets the user choose Playwright or HyperFrames before starting generation.
- Playwright jobs complete with a valid `DemoProject` and open in the existing project editor.
- HyperFrames jobs complete with validated composition artifacts and open in the composition editor.
- Neither method is documented or presented as more important than the other.
- Clients branch on `result.method`, not artifact path guesses.
- Future workers can understand two native product models: `DemoProject` for Playwright jobs and composition source for HyperFrames jobs.
