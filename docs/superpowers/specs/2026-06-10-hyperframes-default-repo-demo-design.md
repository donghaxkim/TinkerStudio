# Hyperframes Default Repo Demo Design

## Summary

Tinker should shift AI URL demo generation from live browser-control videos to repo-backed, polished generated product videos. Hyperframes becomes the default renderer. A repository URL is required for all AI URL demo generation so OpenCode can ground the demo in real product source, assets, routes, copy, components, and workflows.

The existing Playwright capture pipeline remains available as an alternate renderer for comparison and diagnostics, but it is no longer the default creative path.

## Goals

- Require `--repo` for AI URL demo generation.
- Make Hyperframes the default renderer for repo-backed demos.
- Use OpenCode to inspect the repo, extract useful assets, and create the Hyperframes composition.
- Produce polished generated product videos that accurately communicate the workflow, even when the UI is reconstructed or stylized.
- Keep Playwright as an optional comparison renderer so outputs can be evaluated across products.
- Keep Tinker responsible for orchestration, validation, artifact paths, timeouts, and safety boundaries.

## Non-Goals

- Do not remove the existing Playwright capture packages.
- Do not depend on live step-by-step browser interaction for the default output.
- Do not require generated Hyperframes UI to be pixel-perfect against the real product.
- Do not let OpenCode bypass Tinker artifact validation or write outside the job output directory.

## CLI Behavior

AI URL generation requires both product URL and repo URL.

```bash
pnpm generate:ai-url-job -- --url https://example.com --repo https://github.com/org/product --prompt "Create a product demo"
```

The renderer flag supports three modes:

```text
--renderer hyperframes
--renderer playwright
--renderer both
```

Default behavior:

- `--renderer` defaults to `hyperframes`.
- Missing `--repo` fails fast with a clear error.
- `playwright` mode still requires `--repo`, because AI URL demos are now defined as repo-backed product demos.
- `both` generates separate Hyperframes and Playwright artifact sets under the same job output root.

## Architecture

The default repo demo pipeline is:

```text
product URL + repo URL + prompt
-> Tinker clones repo into job scratch directory
-> Tinker runs website analysis for visual/product grounding
-> Tinker runs OpenCode repo analysis
-> Tinker asks OpenCode to create a Hyperframes demo project
-> OpenCode extracts/selects repo assets into the job output directory
-> OpenCode writes Hyperframes composition files
-> Tinker validates required files and manifest shape
-> Tinker runs Hyperframes lint/render
-> If configured, Tinker asks OpenCode to repair render/lint failures with logs
-> Tinker writes final artifact manifest
```

The optional Playwright path remains:

```text
product URL + repo URL + prompt
-> Tinker runs existing OpenCode demo planner
-> Tinker verifies capture plan
-> Tinker runs deterministic Playwright capture
-> Tinker compiles existing DemoProject artifact
```

When `--renderer both` is used, the two paths share website and repo analysis where practical, then write separate renderer-specific artifacts.

## OpenCode Responsibilities

OpenCode owns the creative and source-aware parts of Hyperframes generation.

OpenCode should:

- Inspect the checked-out repo for product workflows, routes, copy, features, assets, design tokens, component names, screenshots, examples, mock data, and brand clues.
- Select and copy useful assets into the Hyperframes output directory.
- Produce an `asset-manifest.json` describing selected assets and their source evidence.
- Create a Hyperframes project with `index.html`, local assets, styles, animation timing, captions, and any supporting scripts.
- Use repo-derived UI/assets as the primary source of truth.
- Fall back to product screenshots from website analysis when repo evidence is incomplete.
- Prefer stylized, polished reconstruction over brittle live browser interactions.
- Avoid secrets, private data, auth-only flows, payments, destructive actions, and claims unsupported by repo/product evidence.

OpenCode may also be used for a bounded repair loop after Hyperframes lint or render failures. Tinker supplies the error logs and asks OpenCode to fix only the generated Hyperframes project files.

## Tinker Responsibilities

Tinker remains the deterministic orchestrator.

Tinker should:

- Enforce `--repo` before generation starts.
- Clone the repo into an isolated job scratch directory.
- Run website analysis and repo analysis.
- Provide OpenCode with explicit job paths, prompt, product URL, repo analysis, website analysis, duration, and aspect ratio.
- Restrict OpenCode output to the generated job directory.
- Validate that expected Hyperframes files exist.
- Validate machine-readable manifests before rendering.
- Run `npx hyperframes lint` and `npx hyperframes render` from the generated Hyperframes project.
- Persist render logs, repair logs, manifests, and final MP4 paths.
- Keep timeouts and retry counts explicit.
- Preserve Playwright as an alternate renderer and comparison baseline.

## Hyperframes Artifact Layout

For a Hyperframes run, Tinker writes artifacts under:

```text
generated/local-job/<id>/hyperframes/
  index.html
  assets/
  asset-manifest.json
  generation-manifest.json
  lint.log
  render.log
  output.mp4
```

`asset-manifest.json` records what OpenCode selected:

```json
{
  "assets": [
    {
      "id": "logo-primary",
      "type": "logo",
      "sourcePath": "public/logo.svg",
      "outputPath": "assets/logo.svg",
      "evidence": "Primary app logo referenced by the landing page header"
    }
  ]
}
```

`generation-manifest.json` records render intent and provenance:

```json
{
  "renderer": "hyperframes",
  "productUrl": "https://example.com",
  "sourceRepoUrl": "https://github.com/org/product",
  "durationCapSeconds": 20,
  "aspectRatio": "16:9",
  "sourceGrounding": ["repo", "website-analysis"],
  "outputVideoPath": "output.mp4"
}
```

The exact manifest schemas can be refined during implementation, but they must be structured JSON and validated by Tinker before declaring success.

## Playwright Artifact Layout

For comparison mode, Playwright writes under a renderer-specific directory:

```text
generated/local-job/<id>/playwright/
  storyboard.json
  capture-plan.json
  capture-result.json
  demo-project.json
  capture/
```

This avoids mixing default Hyperframes artifacts with browser-capture artifacts and makes comparisons easier.

## Data Flow

Website analysis provides:

- canonical product URL,
- page title and visible copy,
- screenshot references,
- high-level product hints.

Repo analysis provides:

- real features and workflows,
- routes and entry points,
- UI/source structure,
- public demo data or sample flows,
- constraints and safety notes.

OpenCode Hyperframes generation receives:

- product URL,
- repo checkout path,
- repo analysis JSON,
- website analysis JSON,
- user prompt,
- duration cap,
- aspect ratio,
- output directory.

OpenCode returns or writes:

- Hyperframes composition files,
- copied assets,
- asset manifest,
- generation manifest.

Tinker then validates and renders.

## Error Handling

- Missing `--repo` fails before analysis starts.
- Hyperframes lint failure records `lint.log` and can trigger a bounded OpenCode repair attempt.
- Hyperframes render failure records `render.log` and can trigger a bounded OpenCode repair attempt.
- Repair attempts are capped, deterministic, and operate only inside the Hyperframes output directory.
- If Hyperframes still fails, the job fails with paths to logs and generated files.
- If `--renderer both` is used and one renderer fails, the job records the successful renderer artifacts and marks the failed renderer explicitly. The CLI should still exit non-zero unless an explicit future flag allows partial success.

## Safety Boundaries

- OpenCode receives a repo checkout and a generated job output path, not broad write permission across the workspace.
- Generated assets must live under the job output directory.
- Tinker validates manifests and expected files before running render.
- Prompts instruct OpenCode not to include secrets, credentials, private data, auth-only workflows, payment flows, or destructive actions.
- Website screenshots are used as visual fallback only; the default Hyperframes path should not perform live application mutations.

## Testing Strategy

- Unit test CLI validation: missing `--repo` fails.
- Unit test renderer default: omitted `--renderer` selects `hyperframes`.
- Unit test renderer routing: `hyperframes`, `playwright`, and `both` call the expected dependencies.
- Unit test OpenCode Hyperframes prompt includes repo checkout path, output path, asset extraction requirements, screenshot fallback, and safety constraints.
- Unit test Hyperframes artifact validation rejects missing `index.html`, missing manifests, and output paths outside the job directory.
- Unit test repair loop passes lint/render logs back to OpenCode and respects retry limits.
- Integration smoke test with a small fixture repo that includes a logo, route, and component copy.

## Migration Plan

The implementation should be incremental:

1. Add renderer mode types and CLI validation requiring `--repo`.
2. Refactor AI URL job output into renderer-specific artifact directories.
3. Add the OpenCode Hyperframes generator interface.
4. Add Hyperframes file and manifest validation.
5. Add Hyperframes lint/render invocation.
6. Add bounded OpenCode repair loop.
7. Keep existing Playwright path working behind `--renderer playwright` and `--renderer both`.

## Implementation Notes

- Current Hyperframes docs describe the local CLI workflow as `npx hyperframes lint`, `npx hyperframes preview`, and `npx hyperframes render`; implementation should use that shape unless direct package APIs prove more stable.
- Manifest schemas should stay minimal in the first implementation and expand only when needed by comparison tooling.
