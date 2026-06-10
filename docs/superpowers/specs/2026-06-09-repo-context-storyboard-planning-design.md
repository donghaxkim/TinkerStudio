# Repo Context Storyboard Planning Design

## Status

Approved for implementation planning.

## Context

Person A has completed the first AI URL planning slice:

```text
productUrl + prompt -> ProductAnalysis -> AI Storyboard + CapturePlan -> CaptureResult -> DemoProject
```

Early generated storyboards are not strong enough because the planner only sees the live product URL, lightweight page text, and the user prompt. Many products expose their clearest value proposition, feature names, routes, and user workflows in the public GitHub repository rather than in the initially visible page state.

The architecture already expects users to provide both a GitHub repo URL and a product URL. The existing generation contract also accepts `repoUrl` in request shapes, and `DemoProject` metadata can store `sourceRepoUrl`, but the current AI URL path does not use repo context during planning.

## Goal

Build the smallest safe repo-context enhancement for Person A's AI URL planning path.

Given a running `productUrl`, optional public GitHub `repoUrl`, prompt, duration cap, and aspect ratio, the system should analyze the live website and, when a repo URL is provided, fetch/analyze the public repository as source-only context. The planner should use both sources to generate a better storyboard and deterministic capture plan. Final capture must remain verified Playwright replay.

## Non-Goals

- No dependency installation.
- No build, test, dev-server, package-script, or app execution inside the cloned repository.
- No automatic product setup from repository code.
- No private repository access or credential handling.
- No use of `.env` files, local secrets, or repository runtime configuration.
- No broad repair loop or live AI improvisation during capture.
- No editor, rendering, app UI, queue, database, or durable worker work.
- No project schema changes unless a concrete cross-person contract gap is discovered separately.
- No requirement that the repo agent directly writes the storyboard or capture plan.

## Recommended Approach

Use a source-only repo agent to produce a structured `RepoAnalysis` artifact, then feed that artifact plus existing `ProductAnalysis` into the current AI URL planner.

This keeps responsibilities clear:

- repo analysis discovers product meaning from source material
- website analysis discovers visible UI state and selectors
- planning combines both into storyboard and capture intent
- browser capture remains deterministic execution only

Alternative approaches were considered:

- Have the repo agent write the storyboard directly. This might improve narrative quickly, but it splits planning responsibility and makes validation/debugging harder.
- Have the repo agent write both storyboard and capture plan. This is too fragile because source code does not reliably reveal live DOM state, selectors, auth state, or the currently deployed UI.

## Package Boundaries

### `@tinker/generation-contract`

Owns request validation for the shared generation boundary.

Responsibilities:

- Keep `repoUrl` optional for `mode: "ai-url-planning"`.
- Validate `repoUrl` as an `http` or `https` URL when provided.
- Keep existing `manual-fixture` behavior working.
- Avoid introducing a new generation result shape for repo analysis; generated artifact paths are sufficient for this slice.

### `@tinker/product-analysis`

Owns source-only public repository analysis.

Responsibilities:

- Fetch or clone a public GitHub repository into the job output workspace.
- Analyze source files without installing dependencies or executing project scripts.
- Produce a compact `RepoAnalysis` object for planning.
- Write `repo-analysis.json` as a generated artifact when repo context is used.
- Provide deterministic test/dev seams so automated tests do not require networked GitHub access or nondeterministic agent output.

The package should continue to own lightweight website analysis through `analyzeWebsite`.

### `@tinker/demo-assembly`

Owns orchestration of the AI URL demo path and planner input.

Responsibilities:

- Accept optional `repoUrl` in `runAiUrlDemo` input.
- Invoke repo analysis after website analysis when `repoUrl` is present.
- Pass optional `repoAnalysis` into `AiUrlPlannerInput`.
- Include repo context in the planner prompt.
- Write `repo-analysis.json` into the output directory.
- Include `sourceRepoUrl` in `compileProject` input so `DemoProject.metadata.sourceRepoUrl` is set.

### `@tinker/browser-capture`

Remains unchanged.

Responsibilities:

- Validate and execute deterministic `CapturePlan` objects.
- Preserve existing capture errors and event collection.
- Avoid repo-aware or AI-aware logic.

### `@tinker/project-schema`

Remains unchanged for this slice.

Responsibilities:

- Continue validating generated `DemoProject` files.
- Treat `metadata.sourceRepoUrl` as existing metadata, not a new core schema field.

## Data Model

Add a planning-oriented repo analysis type in `@tinker/product-analysis`:

```ts
type RepoAnalysis = {
  repoUrl: string;
  commit?: string;
  productName?: string;
  summary: string;
  features: string[];
  likelyRoutes: string[];
  demoIdeas: string[];
  importantTerms: string[];
  setupNotes: string[];
  sourceHints: Array<{
    path: string;
    reason: string;
  }>;
};
```

Field intent:

- `summary`: concise product purpose and value proposition inferred from repo material.
- `features`: product capabilities or workflows worth showing.
- `likelyRoutes`: route strings, page names, or URL hints discovered from source.
- `demoIdeas`: narrative ideas the storyboard planner can adapt.
- `importantTerms`: domain language, entity names, or UI labels likely to appear in the app.
- `setupNotes`: source-only observations about framework or setup, not instructions to execute setup.
- `sourceHints`: small evidence trail for debugging planner context.

The type should stay compact. It is context for planning, not a full repository map.

## Repo Analysis Guardrails

The source-only agent may read and search files in the cloned repository. It must not:

- install dependencies
- run `npm`, `pnpm`, `yarn`, `bun`, `pip`, `cargo`, `go`, or similar project commands
- start servers
- run tests or builds
- execute repository scripts
- read or include `.env` files, secrets, tokens, or credential files
- follow generated dependency directories such as `node_modules`, `.next`, `dist`, `build`, or `.git`
- pass unbounded source content into model context

Implementation should cap file count, total bytes, and per-file bytes included in analysis. It should prioritize README/docs, package metadata, route files, app/page components, public docs, and obvious feature modules.

## Data Flow

```text
CreateDemoRequest(mode: "ai-url-planning", productUrl, repoUrl?, prompt)
  -> generation-contract validates request
  -> local runner creates GenerationJob
  -> progress: queued/running
  -> product-analysis inspects running URL
  -> writes product-analysis.json
  -> if repoUrl is provided:
       fetch public repo into generated job workspace
       source-only repo analyzer creates RepoAnalysis
       writes repo-analysis.json
  -> AI planner receives ProductAnalysis + RepoAnalysis? + prompt
  -> validates storyboard JSON
  -> validates capture plan JSON
  -> browser-capture verifyCapturePlan
  -> deterministic Playwright capture
  -> demo-assembly compileProject with sourceRepoUrl? metadata
  -> project-schema validates demo-project.json
  -> progress: completed
  -> GenerationResult
```

Generated artifacts when `repoUrl` is present:

- `product-analysis.json`
- `repo-analysis.json`
- `storyboard.json`
- `capture-plan.json`
- `capture-result.json`
- `demo-project.json`
- captured video, screenshots, and trace artifacts when produced

When `repoUrl` is absent, the AI URL path should behave as it does today and should not write `repo-analysis.json`.

## Planner Contract

Extend `AiUrlPlannerInput`:

```ts
type AiUrlPlannerInput = {
  productUrl: string;
  prompt: string;
  durationCapSeconds: number;
  aspectRatio: AspectRatio;
  analysis: ProductAnalysis;
  repoAnalysis?: RepoAnalysis;
};
```

The planner prompt should tell the model how to use each source:

- Use repo context for product purpose, feature names, domain language, and plausible demo narratives.
- Use website analysis for visible UI state, labels, inputs, buttons, and routes currently available at `productUrl`.
- Prefer actions supported by visible website analysis over actions inferred only from source.
- Do not navigate outside the final analyzed `productUrl` origin unless future product requirements explicitly allow it.
- Keep capture plans simple, safe, and deterministic.
- Continue returning exactly one JSON object with `storyboard` and `capturePlan`.

Existing validation remains mandatory:

- strict storyboard parsing
- strict capture plan shape parsing
- `assertStoryboardMatchesInput`
- `assertCapturePlanMatchesProductUrl`
- `verifyCapturePlan`

Repo context can improve the storyboard, but it must not weaken capture safety.

## Error Handling

Keep the shared failure contract stable for this slice.

- Invalid `repoUrl`: `validation`
- Repo fetch or clone failure: `analysis`
- Repo analysis failure: `analysis`
- Invalid repo analysis output: `analysis`
- Planner output malformed or schema-invalid: `planning`
- Capture plan fails target URL checks: `planning`
- Capture plan fails `verifyCapturePlan`: `verification`
- Playwright replay failure: `capture`
- Project assembly or schema validation failure: `assembly`

A new `repo_analysis` failure stage is not required yet. It can be added later if future UI needs separate progress/error presentation.

Progress messages may mention repo analysis while still using the existing `running` status.

## Runner Proof

The existing AI URL runner should accept an optional repo flag:

```bash
pnpm generate:ai-url-job -- --url <product-url> --repo <github-repo-url> --prompt "Make a concise product demo"
```

The script should:

- construct `CreateDemoRequest` with `mode: "ai-url-planning"`
- include `repoUrl` when `--repo` is provided
- run through the existing shared generation boundary
- print ordered progress events
- write `repo-analysis.json` when repo context is used
- print the final `GenerationResult`
- exit non-zero on validation, analysis, planning, verification, capture, assembly, or project validation failure

## Testing And Verification

Automated tests should not rely on live GitHub access or nondeterministic agent output.

Planned checks:

- Contract test: `mode: "ai-url-planning"` accepts optional `repoUrl`.
- Contract test: invalid `repoUrl` schemes are rejected.
- Unit test `RepoAnalysis` parsing with valid and invalid samples.
- Unit test repo analyzer with deterministic fixture input or stubbed agent output.
- Unit test `runAiUrlDemo` writes `repo-analysis.json` only when `repoUrl` is present.
- Unit test planner input includes `repoAnalysis` when available.
- Unit test planner prompt includes repo features, demo ideas, and source hints.
- Unit test final `demo-project.json` metadata includes `sourceRepoUrl` when `repoUrl` is provided.
- Existing manual generation, local job, product analysis, AI planning, and capture tests continue to pass.

Expected verification commands:

```bash
pnpm -r typecheck
pnpm --filter @tinker/project-schema validate:sample
pnpm generate:manual-demo
pnpm generate:local-job
pnpm generate:ai-url-job -- --url <local-fixture-url> --prompt "Make a short demo of the main value prop"
```

Optional manual smoke test when network/model credentials are available:

```bash
pnpm generate:ai-url-job -- --url <product-url> --repo <github-repo-url> --prompt "Make a concise product demo"
```

## Success Criteria

The slice is successful when:

- AI URL generation can accept a public GitHub repo URL in addition to the product URL.
- The repository is fetched/analyzed as source-only context without executing project code.
- Generated outputs include `repo-analysis.json` when `repoUrl` is provided.
- The planner prompt includes both website analysis and repo analysis.
- Storyboard quality has access to repo-derived feature names, product purpose, route hints, and demo ideas.
- Capture planning still targets the analyzed product URL and passes existing verification.
- Final recording remains deterministic Playwright replay.
- `demo-project.json` passes `DemoProjectSchema` and records `metadata.sourceRepoUrl` when applicable.
- Person B can still integrate through `@tinker/generation-contract` and generated project/artifact paths without importing Person A internals.
