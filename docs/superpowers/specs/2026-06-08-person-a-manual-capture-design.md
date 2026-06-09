# Person A Manual Capture Design

## Status

Approved for implementation planning.

## Context

Person A owns the generation pipeline before the editor opens:

```text
Product input -> ProductAnalysis -> Storyboard -> CapturePlan -> CaptureResult -> initial DemoProject
```

The first build slice should prove the deterministic middle of that pipeline before adding AI planning or app/API orchestration.

The repository currently has the shared `@tinker/project-schema` package implemented. Person A package directories exist under the updated names from `docs/architecture.md`, but they need runnable package structure and source implementations.

## Goal

Build Person A's first end-to-end slice: **Manual Storyboard to Captured Project**.

This slice uses a hand-written storyboard and capture plan against a tiny local fixture page. It records real browser video with Playwright, collects structured interaction events, compiles the result into a valid `DemoProject`, and writes generated artifacts to a local output directory.

## Non-Goals

- No AI-generated storyboard or capture plan.
- No repo/product analysis beyond future-facing package boundaries.
- No API route, worker queue, or app shell integration.
- No desktop automation.
- No retries or AI repair for failed capture plans.
- No direct editor or rendering package changes except through the shared schema contract.

## Package Boundaries

### `@tinker/browser-capture`

Owns browser automation and capture execution.

Responsibilities:

- Define the manual `CapturePlan` and related capture result types if they are not already in a shared contract.
- Validate manual capture plans before launch.
- Start a tiny local fixture page for the sample capture.
- Execute deterministic Playwright steps.
- Record real browser video.
- Capture screenshots if useful for debugging or project assets.
- Collect structured interaction events such as cursor movement, clicks, scrolls, and zoom targets.
- Return a `CaptureResult` with asset references, event metadata, checkpoints, and artifact paths.

### `@tinker/demo-assembly`

Owns turning capture output into the initial editable project.

Responsibilities:

- Accept manual storyboard metadata plus `CaptureResult`.
- Compile a schema-valid `DemoProject`.
- Reference captured assets by asset `id` instead of duplicating paths throughout the project.
- Add basic captions, cursor events, zooms, or callouts only when deterministic data exists.
- Validate the generated project with `DemoProjectSchema` before writing it.

### `@tinker/product-analysis`

Stays mostly untouched for this slice.

The package remains the future home for repo and website analysis, but this implementation should not add fake analysis work just to fill the package.

### `@tinker/project-schema`

Remains the source of truth for the editable `DemoProject` contract.

This slice should consume its types and validators rather than redefining project shape elsewhere.

## Data Flow

```text
local fixture page
  -> manual storyboard + capture plan
  -> browser-capture validates plan
  -> browser-capture executes Playwright recording
  -> CaptureResult with video asset, screenshots, events, checkpoints
  -> demo-assembly compiles DemoProject
  -> project-schema validates demo-project.json
  -> generated output directory contains artifacts
```

The generated output directory should contain at minimum:

- `demo-project.json`
- captured browser video asset
- capture event metadata

It may also contain screenshots and Playwright trace artifacts if they are useful and cheap to produce.

## Sample Runner

Expose a simple runnable proof, such as:

```bash
pnpm generate:manual-demo
```

The script should run the full local fixture capture and project assembly flow without requiring `apps/api`.

The script should exit non-zero when capture or schema validation fails.

## Validation And Error Handling

The first slice should fail early and explicitly.

`@tinker/browser-capture` validates the manual capture plan before launch:

- target URL or local fixture path exists
- viewport dimensions are positive
- every step has a known step type
- selectors or text targets required by each step are present
- expected checkpoints are structurally valid

During capture:

- missing selectors throw a typed capture error with the failed step index
- artifact paths are returned only when files are written
- event timestamps are normalized relative to capture start

`@tinker/demo-assembly` validates generated project structure:

- every clip references a known asset
- project duration covers clips, captions, zooms, callouts, and cursor events
- the final object parses through `DemoProjectSchema`

Retries and AI repair are out of scope. If a capture plan fails, the script should report where it failed so the manual plan can be fixed.

## Testing And Verification

Testing should focus on deterministic behavior, with Playwright capture serving as an end-to-end smoke proof.

Planned checks:

- Unit test `verifyCapturePlan` with valid and invalid manual plans.
- Unit test `compileProject` using a small fake `CaptureResult`, asserting the output passes `DemoProjectSchema`.
- Fixture validation test for generated `demo-project.json` shape.
- Manual or script-level smoke test for the Playwright video path.

Expected verification commands:

```bash
pnpm -r typecheck
pnpm --filter @tinker/project-schema validate:sample
pnpm generate:manual-demo
```

If a test runner is added, it should be minimal and package-local. Otherwise, TypeScript plus script-level validation is sufficient for this first implementation.

## Success Criteria

The slice is successful when:

- running the sample script captures a real browser video of the local fixture page
- capture produces structured events, not only a video file
- `@tinker/demo-assembly` compiles the capture into a valid `DemoProject`
- `demo-project.json` passes `DemoProjectSchema`
- Person B can later consume the generated `DemoProject` without importing Person A internals
- no API/job orchestration or AI generation is required for the proof
