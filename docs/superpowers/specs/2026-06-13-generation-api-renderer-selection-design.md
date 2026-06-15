# Generation API Renderer Selection Design

## Status

Approved for implementation planning.

## Context

The API server slice in `2026-06-11-generation-api-server-design.md` intentionally exposed only Hyperframes generation. That decision kept the first HTTP surface small, but it no longer matches the desired product direction. The local runner already supports AI URL generation with three renderers: `"hyperframes"`, `"playwright"`, and `"both"`. The current API blocks two of those paths in `apps/api/src/routes/jobs.ts` and narrows API job snapshots to `renderer: "hyperframes"` in `packages/generation-contract/src/apiJob.ts`.

This slice reverses only the API exposure decision. It does not remove Hyperframes, the Playwright runner, or any existing internal CLI/test paths.

## Goal

Expose Playwright screen-recording generation through the local HTTP API alongside Hyperframes generation, with Playwright as the API default and a `both` option for jobs that should produce both outputs.

## Non-Goals

- No changes to `apps/web`, `apps/desktop`, `packages/editor`, `packages/ai-edit-ui`, or `packages/rendering`.
- No new capture engine. The API uses the existing `runLocalGenerationJob` and `runAiUrlDemo` renderer support.
- No exposure of the removed `mode: "manual-fixture"` through the API.
- No durable persistence, cancellation, retries, authentication, SSE, or websockets.
- No redesign of the assisted `DemoProject` dialect beyond exposing Playwright artifacts produced by the existing runner.
- No quality guarantees that Playwright output matches Hyperframes motion quality; clients choose the renderer based on the workflow they want.

## HTTP Contract Changes

### `POST /api/jobs`

The request body remains an `AiUrlPlanningCreateDemoRequest` shape with API-owned `id` and `outputDirectory` omitted.

Renderer behavior changes as follows:

- `renderer` may be `"playwright"`, `"hyperframes"`, or `"both"`.
- If `renderer` is omitted, the server injects `"playwright"` into the accepted request.
- This API default is route-owned. The implementation must not accidentally inherit the shared `AiUrlPlanningCreateDemoRequestSchema` default of `"hyperframes"` when normalizing accepted API requests.
- `renderer: "both"` runs the existing combined runner path and returns artifacts from both renderers.
- `outputDirectory` remains rejected. The server controls `generated/local-job/<jobId>`.
- Client-supplied `id` remains ignored before validation.
- `mode` must remain `"ai-url-planning"`; `"manual-fixture"` has been removed from the shared create-demo contract.

All existing status codes remain unchanged: `202` for accepted jobs, `422` for contract or API-rule violations, `429` for a full queue, and `400` for unparseable JSON.

## Contract Shape Changes

`ApiGenerationJob.request.renderer` changes from the literal `"hyperframes"` to the existing AI URL renderer enum:

```ts
type ApiGenerationJob = {
  id: string;
  status: "queued" | "running" | "capturing" | "assembling" | "completed" | "failed";
  request: AiUrlPlanningCreateDemoRequest & {
    id: string;
    renderer: "playwright" | "hyperframes" | "both";
  };
  createdAt: string;
  updatedAt: string;
  progressEvents: ManualFixtureProgressEvent[];
  result?: ApiGenerationResult;
  error?: GenerationError;
};
```

The schema still rejects `outputDirectory`, unknown fields, missing progress events, and non-AI-URL modes.

`ApiGenerationResult` remains `{ artifacts: ApiArtifact[] }`. The runner-level `rendererResults` stays internal to `@tinker/demo-assembly`; the API exposes outputs through classified artifact URLs rather than adding a second result dialect.

## Artifact Classification

The existing artifact index already includes Hyperframes outputs:

- `hyperframes/output.mp4` as `output-video`
- `hyperframes/index.html` as `composition-index`
- Hyperframes manifests, logs, assets, analysis JSON, and screenshots

This slice adds Playwright-specific artifact kinds:

```ts
type ApiArtifactKind =
  | "output-video"
  | "composition-index"
  | "asset-manifest"
  | "generation-manifest"
  | "lint-log"
  | "render-log"
  | "product-analysis"
  | "product-analysis-screenshot"
  | "repo-analysis"
  | "playwright-demo-project"
  | "playwright-storyboard"
  | "playwright-capture-plan"
  | "playwright-capture-result"
  | "playwright-video"
  | "playwright-screenshot"
  | "playwright-trace"
  | "asset"
  | "other";
```

Classification rules:

- `playwright/demo-project.json` -> `playwright-demo-project`
- `playwright/storyboard.json` -> `playwright-storyboard`
- `playwright/capture-plan.json` -> `playwright-capture-plan`
- `playwright/capture-result.json` -> `playwright-capture-result`
- `playwright/capture/videos/**` -> `playwright-video`
- `playwright/capture/screenshots/**` -> `playwright-screenshot`
- Trace files under `playwright/**` -> `playwright-trace`
- Unknown runner-reported paths remain `other` rather than being dropped.

For `renderer: "playwright"`, the API result will typically have no `output-video` artifact because the Playwright path currently produces captured clips and a `DemoProject`, not a final assembled MP4. Captured video clips are exposed as `playwright-video`. For `renderer: "both"`, Hyperframes `output-video` remains available alongside Playwright planning and capture artifacts.

## Data Flow

```text
POST /api/jobs
  -> parse AI URL fields without client id/outputDirectory
  -> default missing renderer to "playwright"
  -> validate the normalized request as AiUrlPlanningCreateDemoRequest
  -> create queued job snapshot with server id
  -> enqueue job

worker
  -> runLocalGenerationJob(request, { onProgress })
  -> runner dispatches renderer: playwright | hyperframes | both
  -> progress events append in order
  -> classify all runner artifactPaths into API artifacts
  -> complete or fail job
```

No worker branching is needed for renderer selection. The runner already owns renderer execution order and error behavior.

## Error Handling

- Unknown renderer values fail request validation before enqueueing.
- Removed `manual-fixture` requests, assisted-shape requests, `outputDirectory`, and unknown request fields still fail with `GenerationError` at `stage: "validation"`.
- Runtime failures from either renderer surface through the existing `LocalGenerationJobError` path and set the job to `failed`.
- In `renderer: "both"`, the current runner behavior applies: if either renderer fails, the whole job fails. Partial successful artifacts may exist on disk, but the API job does not report a completed result.

## Testing And Verification

Planned checks:

- `POST /api/jobs` accepts explicit `renderer: "playwright"`, `"hyperframes"`, and `"both"`.
- Omitted `renderer` stores `"playwright"` in the accepted request snapshot and passes it to the runner.
- Invalid renderers, removed `manual-fixture` requests, assisted-shape bodies, unknown fields, and `outputDirectory` remain rejected.
- API job schemas parse all three renderer values and continue rejecting missing renderer values in stored snapshots.
- Artifact classification maps Playwright JSON files, captured videos, captured screenshots, and traces to the new kinds.
- Artifact serving keeps the same path traversal protections for Playwright paths.
- Existing queue, lifecycle, failure, and Hyperframes artifact tests stay green.

Verification commands:

```bash
pnpm -r typecheck
pnpm --filter @tinker/generation-contract test
pnpm --filter @tinker/api test
pnpm --filter @tinker/demo-assembly test
```

## Person B Handoff Update

The create-job payload should now treat `renderer` as optional, defaulting to Playwright when omitted. Clients that want the editable Hyperframes composition must send `renderer: "hyperframes"` or `renderer: "both"`.

Consumption guidance:

- Use `output-video` for Hyperframes playback when present.
- Use `playwright-video` clips and `playwright-demo-project` for Playwright-generated screen capture workflows.
- Use `composition-index` only for Hyperframes editing workflows.
- If a client asks for `both`, expect both renderer-specific artifact groups and choose by `kind` rather than path guessing.

## Risks

- **Default behavior change**: Existing clients that omit `renderer` will now receive Playwright artifacts instead of Hyperframes `output.mp4`. This is intentional and must be called out in the handoff.
- **No final Playwright MP4**: The Playwright path produces captured clips and a `DemoProject`, not the Hyperframes-style final MP4. The API should expose this honestly via artifact kinds rather than pretending it produced `output-video`.
- **Longer `both` jobs**: `renderer: "both"` runs two render paths serially in the existing runner and can take longer.
- **Partial artifacts on failure**: A failed `both` job may leave one renderer's files on disk, but the in-memory job remains failed with no result.

## Success Criteria

- A job without `renderer` starts Playwright generation.
- A job with `renderer: "hyperframes"` preserves the existing Hyperframes behavior.
- A job with `renderer: "both"` exposes both Hyperframes and Playwright artifact groups after completion.
- API schemas and tests document all three renderer modes.
- No manual fixture mode is exposed through the API.
