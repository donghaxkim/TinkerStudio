# Frontend Playwright Connection Design

## Goal

Connect the existing Playwright generation pipeline to the web create flow without replacing the current HyperFrames path. Users should be able to choose Playwright from the existing generation-method selector, submit a job through the existing `/api/jobs` client, and see useful Playwright outputs when the job completes.

## Current State

- `apps/web/src/App.tsx` already wires the web app to `createHttpCompositionGenerationClient()`.
- `apps/web/src/screens/CompositionEditor/CompositionDemoScreen.tsx` renders a HyperFrames/Playwright selector, but Playwright is disabled and local state is fixed to `"hyperframes"`.
- `apps/web/src/lib/httpCompositionGenerationClient.ts` defaults request bodies to `renderer: "hyperframes"`, while still allowing an explicit override.
- `apps/api/src/routes/jobs.ts` accepts `renderer` and defaults to `"playwright"` when omitted.
- Playwright jobs complete as `result.method: "playwright"` with a `DemoProject` and artifacts, not a HyperFrames composition.

## Design

Keep HyperFrames as the default UI choice, but enable the Playwright radio button. The selected renderer is passed through the existing `CreateCompositionJobRequest` to the HTTP client and then to `/api/jobs`.

When a completed job returns `result.method: "hyperframes"`, the current behavior stays unchanged: open `CompositionEditorScreen` with the generated composition URL and output video URL.

When a completed job returns `result.method: "playwright"`, render a lightweight Playwright result view instead of trying to force the result into the composition editor. The view should show that Playwright completed, link to the generated project JSON, and surface the primary capture video if one exists. This keeps the integration honest: Playwright produces a `DemoProject` and capture artifacts, while HyperFrames produces an editable composition.

## Scope

In scope:

- Enable renderer selection in the create screen.
- Send `renderer: "playwright"` when Playwright is selected.
- Add a Playwright completion view for returned artifacts.
- Preserve HyperFrames default behavior.
- Add focused tests for selector behavior, request payloads, and Playwright completion rendering.

Out of scope:

- Reintroducing or rebuilding the older `DemoProject` editor.
- Converting Playwright output into a HyperFrames composition.
- Adding editing support for Playwright jobs.
- Changing the API job schema or Playwright generation pipeline.

## Error Handling

Existing job failure handling remains unchanged. If a Playwright job fails, the create screen shows the job error message. If Playwright completes without a capture video artifact, the result view still links to the project artifact and explains that no preview video was returned.

## Testing

Update web tests to cover:

- HyperFrames remains selected by default.
- Playwright can be selected and sent in the create request.
- A completed Playwright job renders the Playwright result view instead of the HyperFrames editor.
- HyperFrames completion behavior remains unchanged.
