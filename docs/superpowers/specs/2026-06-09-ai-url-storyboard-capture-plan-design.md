# AI URL Storyboard to Captured Project Design

## Status

Approved for implementation planning.

## Context

Person A has completed two foundation slices:

```text
manual storyboard + manual capture plan -> Playwright capture -> CaptureResult -> DemoProject
CreateDemoRequest -> local generation runner -> GenerationResult
```

Those proofs show that deterministic capture, project assembly, and the shared generation boundary can work. The next Person A step should move from manual plans toward the product vision without taking on unsafe repo setup, app/editor work, or broad orchestration.

This slice targets the smallest meaningful version of Milestone 3 from `docs/architecture.md`: **AI Storyboard to Captured Project** for an already-running web app URL.

## Goal

Build **AI URL Storyboard to Captured Project**.

Given a running `productUrl`, a user prompt, duration cap, and aspect ratio, the system should inspect the page, generate a storyboard and deterministic capture plan, verify the plan, execute it with Playwright, assemble a valid `DemoProject`, and return a `GenerationResult` through the existing generation boundary.

The AI may help analyze and plan. The final recording take must still be deterministic replay through a verified `CapturePlan`.

## Non-Goals

- No GitHub repo cloning or source-code analysis.
- No dependency installation or automatic product setup.
- No durable queue, database, background worker process, or concurrency system.
- No app UI, editor, rendering, or export work.
- No desktop automation.
- No live AI improvisation during the final capture.
- No broad multi-step repair loop. A single validation-feedback retry may be added only if implementation remains small and deterministic.
- No project schema changes unless a concrete contract gap is discovered and reviewed separately.

## Package Boundaries

### `@tinker/generation-contract`

Owns the request/result boundary used by app/API callers.

Responsibilities:

- Add a new supported request mode such as `"ai-url-planning"`.
- Require `productUrl` for the new mode.
- Continue validating duration, aspect ratio, output directory, and URL shape.
- Represent failures by stage without exposing Person A implementation classes.
- Keep the existing `"manual-fixture"` mode working.

Progress should remain stable enough for future UI integration. New status or stage messages may be added for analysis, planning, verification, capture, and assembly, but the contract should avoid promising retries or resumability in this slice.

### `@tinker/product-analysis`

Owns lightweight inspection of an already-running web app URL.

Responsibilities:

- Open the provided URL in Playwright or a similarly deterministic browser inspection path.
- Capture basic page facts: title, visible headings, visible body copy snippets, primary links/routes, button labels, input labels/placeholders, and screenshot asset references.
- Extract simple brand hints when available, such as dominant colors from CSS or visible metadata.
- Return a small `ProductAnalysis` object that is useful for storyboard planning.
- Write `product-analysis.json` as a generated artifact.

This package should not clone repos, install dependencies, infer build commands, or execute arbitrary local setup.

### `@tinker/demo-assembly`

Owns the planning and assembly path for this slice.

Responsibilities:

- Generate a `Storyboard` from `ProductAnalysis`, user prompt, duration cap, and aspect ratio.
- Generate a deterministic `CapturePlan` from the storyboard and product analysis.
- Validate AI-produced JSON before passing it to capture.
- Call `verifyCapturePlan` before browser recording.
- Reuse the existing capture and `compileProject` flow.
- Write `storyboard.json`, `capture-plan.json`, `capture-result.json`, and `demo-project.json` to the output directory.
- Expose a local runner or script that invokes the flow through `@tinker/generation-contract`.

The package may contain the first AI planning adapter if that is the smallest integration point, but the adapter should be isolated behind a narrow function so it can later move or support multiple model providers.

### `@tinker/browser-capture`

Owns deterministic execution only.

Responsibilities:

- Continue validating and executing `CapturePlan` objects.
- Preserve typed capture failures with step index and useful selector/context information.
- Avoid AI-specific logic.
- Return structured events, screenshots, checkpoints, and video artifacts as it already does for the manual flow.

### `@tinker/project-schema`

Remains the source of truth for editable projects.

Responsibilities:

- Validate the final `DemoProject`.
- Avoid schema changes unless the generated project exposes a real missing field that both Person A and Person B agree to add.

## Data Flow

```text
CreateDemoRequest(mode: "ai-url-planning", productUrl, prompt)
  -> generation-contract validates request
  -> local runner creates GenerationJob
  -> progress: queued/running
  -> product-analysis inspects running URL
  -> writes product-analysis.json
  -> AI planner generates Storyboard JSON
  -> validates storyboard
  -> writes storyboard.json
  -> AI planner generates CapturePlan JSON
  -> validates capture plan shape
  -> browser-capture verifyCapturePlan
  -> writes capture-plan.json
  -> deterministic Playwright capture
  -> writes capture-result.json and media artifacts
  -> demo-assembly compileProject
  -> project-schema validates demo-project.json
  -> progress: completed
  -> GenerationResult
```

On failure:

```text
validation / analysis / planning / verification / capture / assembly failure
  -> progress: failed
  -> GenerationError with job id, stage, and message
  -> non-zero script exit
```

## AI Planning Contract

AI output should be treated as untrusted JSON.

The planner must produce:

- a storyboard matching the shared storyboard shape already used by the manual flow
- a capture plan matching `@tinker/browser-capture` plan types

Before execution:

- parse model output as strict JSON
- validate required fields and enum values
- reject unknown or unsupported capture step types
- reject missing selectors/text targets where required
- run `verifyCapturePlan`

The initial prompt should strongly prefer simple, visible UI actions:

- navigate to the product URL
- wait for stable selectors
- click visible buttons or links by text where possible
- type only into clearly labeled fields
- pause briefly between important states
- avoid destructive actions, auth flows, payments, or external navigation

If a plan fails validation, the implementation may either fail immediately or perform one validation-feedback retry. More complex repair loops are future scope.

## Runner Proof

Expose a root script such as:

```bash
pnpm generate:ai-url-job -- --url <running-app-url> --prompt "Make a short demo of the main value prop"
```

The script should:

- construct a `CreateDemoRequest` with `mode: "ai-url-planning"`
- run through the shared generation contract boundary
- print progress events in order
- write generated planning and capture artifacts
- print the final `GenerationResult`
- exit non-zero on validation, analysis, planning, verification, capture, assembly, or project validation failure

The first stable proof should use the local fixture page or another deterministic local page. External websites may be used manually later, but they should not be required for automated verification.

## Error Handling

Failures should be explicit and stage-specific:

- `validation`: invalid request, missing URL, unsupported mode, invalid output directory
- `analysis`: URL cannot be opened, page times out, browser inspection fails
- `planning`: model output is missing, malformed, not JSON, or fails storyboard/capture schemas
- `verification`: generated capture plan fails `verifyCapturePlan`
- `capture`: Playwright execution fails during deterministic replay
- `assembly`: `compileProject` or `DemoProjectSchema` validation fails
- `unknown`: unexpected errors that do not fit a known stage

Error messages should be short enough for CLI output and future UI progress surfaces, while preserving the original error as an internal cause when possible.

## Testing And Verification

Testing should prove the AI URL path without making the test suite depend on nondeterministic external websites.

Planned checks:

- Unit test request parsing for `mode: "ai-url-planning"`, including missing or malformed `productUrl`.
- Unit test product analysis against a tiny local fixture page.
- Unit test storyboard and capture-plan parsing with valid and invalid AI JSON samples.
- Unit test runner progress order for the successful local fixture path with the planner stubbed or fixed.
- Existing manual generation and contract tests continue to pass.
- Script-level smoke test for the full AI URL runner against a deterministic local fixture when model access is configured.

Expected verification commands:

```bash
pnpm -r typecheck
pnpm --filter @tinker/project-schema validate:sample
pnpm generate:manual-demo
pnpm generate:local-job
pnpm generate:ai-url-job -- --url <local-fixture-url> --prompt "Make a short demo of the main value prop"
```

If model access is not configured in CI or local verification, the full AI runner may support a deterministic fixture planner mode for tests. That mode should be clearly marked as test/dev support and should not replace the real AI planning path.

## Success Criteria

The slice is successful when:

- `CreateDemoRequest` supports an explicit AI URL planning mode without breaking `manual-fixture`.
- a running web app URL can be inspected into a useful `ProductAnalysis` artifact.
- AI-generated storyboard and capture-plan JSON are validated before use.
- the generated capture plan passes `verifyCapturePlan` before recording.
- final capture is deterministic Playwright replay, not live AI improvisation.
- generated output includes `product-analysis.json`, `storyboard.json`, `capture-plan.json`, `capture-result.json`, `demo-project.json`, and captured media artifacts.
- `demo-project.json` passes `DemoProjectSchema`.
- failures identify the stage clearly enough for a developer or future UI to explain what went wrong.
- Person B can still integrate only against `@tinker/generation-contract` and generated `DemoProject` files, without importing Person A internals.
