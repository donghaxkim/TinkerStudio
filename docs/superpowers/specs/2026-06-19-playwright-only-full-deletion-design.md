# Design: Playwright-only full deletion

**Date:** 2026-06-19
**Status:** Approved (design); pending implementation plan
**Branch context:** `refactor/playwright-only`
**Related:** `docs/demo-pipeline.md`, `docs/smooth-playwright-capture.md`, `docs/superpowers/specs/2026-06-14-dual-generation-methods-design.md`, `docs/superpowers/specs/2026-06-16-frontend-playwright-connection-design.md`

## Goal

Make Tinker a Playwright-only demo generation product by fully deleting HyperFrames-related backend
and frontend code while keeping the existing smooth Playwright capture pipeline working.

This is intentionally not a compatibility or feature-flag cleanup. Old HyperFrames jobs, imported
HyperFrames folders, composition source editing, and HyperFrames revision rendering become unsupported
on this branch.

## Decision

Use a contract-first deletion.

First, simplify shared generation contracts so Playwright is the only supported generation method.
Then remove every backend, frontend, test, and documentation path that exists only to support
HyperFrames. TypeScript and tests should reveal any remaining stale references.

## Scope

**In scope:**
- Remove HyperFrames as a generation renderer from shared schemas, request types, result types, and API snapshots.
- Remove the `both` renderer mode because it only exists to run Playwright and HyperFrames together.
- Remove HyperFrames generation, validation, repair, render, artifact, and planning modules from `@tinker/demo-assembly`.
- Remove HyperFrames composition import, AI composition edit, and render-revision API flows.
- Remove frontend renderer selection, HyperFrames agent selection, HyperFrames import/dropzone UX, and composition iframe result handling.
- Keep Playwright generation, smooth capture, `DemoProject` output, `playwright/final.mp4`, cancellation, planning sessions, and artifact download working.
- Update tests, package scripts, and docs so the repository describes one generation method: Playwright.

**Out of scope:**
- Replacing Playwright with another renderer.
- Redesigning the Playwright capture planner or `DemoProject` schema.
- Preserving old HyperFrames generated folders or API restoration behavior.
- Keeping hidden compatibility shims for `renderer: "hyperframes"` or `renderer: "both"`.
- Building Playwright AI edit parity for the removed composition edit flow in this slice.

## Existing State

The codebase currently has a dual-renderer shape:

```
POST /api/jobs
  -> request.renderer: "hyperframes" | "playwright" | "both"
  -> runLocalGenerationJob
  -> runAiUrlDemo
     -> shared analysis / understanding / strategy
     -> HyperFrames generation OR Playwright capture OR both
```

Important HyperFrames surfaces found during exploration:

- `packages/generation-contract/src/createDemoRequest.ts` exposes `AiUrlRendererSchema` with `"hyperframes"`, `"playwright"`, and `"both"`, plus `hyperframesAgent`.
- `packages/generation-contract/src/apiJob.ts` models both Playwright and HyperFrames API result dialects, plus HyperFrames revision results.
- `packages/demo-assembly/src/runAiUrlDemo.ts` defaults to HyperFrames internally, branches between renderer paths, and imports HyperFrames artifact/planning/render modules.
- `apps/api/src/routes/jobs.ts` accepts a renderer option, restores completed HyperFrames jobs from disk, and exposes edit/render revision endpoints.
- `apps/api/src/edit/*`, `apps/api/src/workers/editWorker.ts`, and `apps/api/src/workers/renderWorker.ts` support HyperFrames composition editing and render-on-demand.
- `apps/web/src/screens/CompositionEditor/CompositionDemoScreen.tsx` exposes renderer and HyperFrames agent controls, imports HyperFrames folders, and opens HyperFrames iframe compositions.
- Documentation still describes dual generation methods or historical HyperFrames decisions.

Playwright is already the intended full-pipeline path in `docs/demo-pipeline.md`: product/repo
analysis, understanding, strategy, Playwright capture planning, smooth capture, `DemoProject`, and
`playwright/final.mp4`.

## Proposed Flow

```
POST /api/jobs
  -> Playwright-only ai-url-planning request
  -> runLocalGenerationJob
  -> runAiUrlDemo
     -> analysis
     -> understanding
     -> strategy
     -> Playwright planner
     -> smooth Playwright capture
     -> demo-project.json + final.mp4 + run-summary.json
```

The product should no longer ask which renderer to use. A generation job always means the
Playwright path.

## Contract Changes

Simplify request and result contracts around Playwright:

- Remove the public renderer choice from job creation and web/local request types. A job request no longer needs `renderer` because Playwright is the only path.
- Remove `HyperframesAgentSchema`, `HyperframesAgent`, and `hyperframesAgent` from request schemas and web request types.
- Keep completed API results discriminated by `method`, but make the only valid value the literal `"playwright"`.
- Remove HyperFrames artifact kinds: `composition-index`, `asset-manifest`, `generation-manifest`, `lint-log`, `render-log`, and generic HyperFrames `asset`.
- Remove `ApiRevisionResultSchema` and revision result types because revisions only serve HyperFrames composition editing.
- Keep Playwright artifact kinds: `playwright-demo-project`, `playwright-storyboard`, `playwright-capture-plan`, `playwright-capture-result`, `playwright-video`, `playwright-screenshot`, `playwright-trace`, plus shared analysis artifacts.

No backward compatibility is required for clients still sending `renderer: "hyperframes"` or
`renderer: "both"`. API requests with those fields should fail validation instead of being silently
stripped or coerced.

## Backend Deletion

`@tinker/demo-assembly` should keep only the Playwright renderer path:

- Delete `hyperframesArtifacts.ts`, `hyperframesPlanning.ts`, `hyperframesRender.ts`, and their tests.
- Remove HyperFrames imports, generator/repairer inputs, repair attempts, `runHyperframesRenderer`, and `both` merge behavior from `runAiUrlDemo.ts`.
- Remove renderer branching from `RunAiUrlDemoInput` and `runAiUrlDemo`; the function executes Playwright only.
- Remove HyperFrames-related package test script entries.
- Keep `compileProject`, Director Mode, render plan, edit decision list, run summary, and Playwright smoke flows intact.

The API should stop serving composition-specific behavior:

- Remove HyperFrames restoration from `GET /api/jobs/:id`.
- Remove composition edit and revision-render routes from `registerJobsRoutes`.
- Remove `apps/api/src/edit/*` modules that only support HyperFrames composition source editing.
- Remove `editWorker`, `renderWorker`, pending edit/render state, and server wiring.
- Simplify artifact indexing to classify Playwright and shared artifacts only.
- Keep job creation, queueing, cancellation, progress, artifact downloads, planning sessions, and local generation worker behavior.

## Frontend Deletion

The web app should expose Playwright as the only generation path:

- Remove the renderer dropdown and `GenerationRenderer` state.
- Remove HyperFrames agent selection and `HyperframesAgent` imports.
- Make planned generation and direct generation send Playwright-compatible job requests without HyperFrames fields.
- Remove HyperFrames import/dropzone UI and its HTTP import client wiring.
- Remove HyperFrames iframe composition result handling from completed jobs.
- Keep Playwright completed-job handling: find a `playwright-video` artifact and open the existing video/DemoProject-backed editor experience.
- Update tests and UI copy so users see one action: generate or edit a Playwright-backed demo video.

Keep `CompositionEditorScreen` only as the shell for standalone Playwright video preview and future
DemoProject editing. Remove props and branches that only support HyperFrames iframe compositions.

## Error Handling

- Requests with removed HyperFrames fields should fail existing 422 validation paths rather than being silently coerced.
- Completed Playwright jobs without a `playwright-video` artifact should continue showing a clear frontend error.
- Existing HyperFrames output directories should not be restored into API job snapshots.
- Artifact download security checks remain unchanged for supported Playwright artifact paths.

## Testing

Update tests around the new single-method contract:

- Generation contract tests accept Playwright jobs and reject removed HyperFrames and `both` variants.
- `runAiUrlDemo` tests cover the Playwright-only path and no longer expect HyperFrames artifacts.
- `runLocalGenerationJob` tests verify Playwright requests flow through and complete.
- API route tests verify job creation defaults to Playwright, rejects removed renderer values if supplied, and no longer exposes edit/render revision routes.
- Artifact indexing tests cover Playwright artifacts and shared analysis artifacts only.
- Web tests verify no renderer or HyperFrames agent controls are rendered, job creation sends no HyperFrames fields, and completed Playwright jobs open the video preview.

Final verification should include:

```
pnpm --filter @tinker/generation-contract test
pnpm --filter @tinker/demo-assembly test
pnpm --filter @tinker/api test
pnpm --filter @tinker/web test
pnpm typecheck
```

Run narrower commands first while deleting code, then the broader commands before completion.

## Success Criteria

- Searching the active source and tests for `hyperframes` or `HyperFrames` returns only historical docs that are intentionally retained, or no matches if docs are also cleaned.
- The app no longer presents a renderer choice, HyperFrames agent choice, HyperFrames import flow, or composition iframe path.
- API contracts no longer advertise HyperFrames or `both` as supported generation methods.
- Playwright generation still produces `playwright/demo-project.json`, `playwright/final.mp4` when video production succeeds, artifacts, progress events, cancellation behavior, and `run-summary.json`.
- Targeted tests and typechecks pass after the deletion.
