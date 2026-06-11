# Generation Contract Local Runner Design

## Status

Approved for implementation planning.

## Context

Person A has completed the first deterministic generation slice:

```text
manual storyboard + manual capture plan -> Playwright capture -> CaptureResult -> DemoProject
```

That proof currently exists as a direct package/script flow. The next product-shaped step is to expose it through the shared generation boundary described in `docs/architecture.md`, so Person B can integrate Create Demo UI and editor loading without importing Person A internals.

The repository currently has runnable `@tinker/browser-capture`, `@tinker/demo-assembly`, and `@tinker/project-schema` packages. The `packages/generation-contract` directory exists from the architecture scaffold, but it does not yet have an implemented package structure or source contract.

## Goal

Build the smallest stable boundary around the completed manual generation flow: **CreateDemoRequest to GenerationResult through a local runner**.

This slice should prove that generation can be invoked through a shared contract, report deterministic progress, and return the generated editable project plus artifacts. The implementation may still use the existing manual fixture capture internally.

## Non-Goals

- No AI-generated storyboard or capture plan.
- No repo cloning, dependency installation, or automatic product setup.
- No durable job queue, database, background worker process, or concurrency management.
- No app UI or editor integration.
- No direct imports from app/editor code into Person A internals.
- No new project schema fields unless a concrete contract gap is discovered and reviewed separately.

## Package Boundaries

### `@tinker/generation-contract`

Owns the shared request, job, progress, result, and error contract between the app/API boundary and the generation pipeline.

Responsibilities:

- Define TypeScript types for generation requests, jobs, statuses, progress events, results, and errors.
- Provide runtime validators for externally supplied data.
- Keep the contract independent from `@tinker/browser-capture` and `@tinker/demo-assembly` implementation details.
- Reference generated projects and artifacts by paths and asset metadata, not by exposing internal capture classes.

### Person A local runner

Owns executing the current manual generation proof through the new contract.

This may live in `@tinker/demo-assembly` for the first slice if that is the smallest integration point, or in a small dedicated Person A package/module if implementation planning finds that cleaner.

Responsibilities:

- Accept a validated `CreateDemoRequest`.
- Create a local in-memory `GenerationJob`.
- Emit deterministic `GenerationProgressEvent` entries.
- Invoke the existing manual fixture capture and project assembly flow.
- Return a `GenerationResult` containing the generated project path and generated artifact paths.
- Surface typed generation failures with the stage and underlying message.

### `apps/api`

Stays optional for this slice.

A thin local API or worker entrypoint may be added only if it remains contract-driven and does not become an orchestration layer. The required proof is a local runner script, not an HTTP server.

## Contract Shape

The exact TypeScript/Zod definitions can be finalized during implementation, but the contract should cover these concepts.

```ts
type CreateDemoRequest = {
  id?: string;
  productUrl?: string;
  repoUrl?: string;
  prompt?: string;
  durationCapSeconds: number;
  aspectRatio: "16:9" | "9:16" | "1:1";
  outputDirectory?: string;
  mode: "manual-fixture";
};

type GenerationStatus =
  | "queued"
  | "running"
  | "capturing"
  | "assembling"
  | "completed"
  | "failed";

type GenerationJob = {
  id: string;
  request: CreateDemoRequest;
  status: GenerationStatus;
  createdAt: string;
  updatedAt: string;
};

type GenerationProgressEvent = {
  jobId: string;
  status: GenerationStatus;
  message: string;
  time: string;
  artifactPath?: string;
};

type GenerationResult = {
  jobId: string;
  status: "completed";
  projectPath: string;
  outputDirectory: string;
  artifactPaths: string[];
};

type GenerationError = {
  jobId?: string;
  status: "failed";
  stage: "validation" | "capture" | "assembly" | "unknown";
  message: string;
};
```

The initial `mode: "manual-fixture"` field is intentional. It prevents the request shape from pretending that arbitrary product URLs or repo URLs are fully supported before AI planning and product analysis exist.

## Data Flow

```text
CreateDemoRequest
  -> generation-contract validates request
  -> local runner creates GenerationJob
  -> progress: queued
  -> progress: running
  -> progress: capturing
  -> existing manual capture flow
  -> progress: assembling
  -> existing demo assembly flow
  -> DemoProjectSchema validates generated demo-project.json
  -> progress: completed
  -> GenerationResult
```

On failure:

```text
failure in validation/capture/assembly
  -> progress: failed
  -> typed GenerationError
  -> non-zero script exit
```

## Runner Proof

Expose a simple root script such as:

```bash
pnpm generate:local-job
```

The script should:

- construct a valid manual-fixture `CreateDemoRequest`
- run the full generation flow through the contract boundary
- print progress events in order
- print the final `GenerationResult`
- exit non-zero when request validation, capture, assembly, or project validation fails

The existing `pnpm generate:manual-demo` script can remain as the lower-level direct proof. The new script proves the product-facing boundary.

## Error Handling

The first version should fail early and explicitly.

Validation errors should happen before browser launch when:

- `durationCapSeconds` is missing or not positive
- `aspectRatio` is not supported
- `mode` is not `manual-fixture`
- provided URL fields are malformed, if present
- `outputDirectory` cannot be resolved safely

Execution errors should include:

- the job id when one exists
- the failing stage
- a short human-readable message
- the original error as internal cause where TypeScript/runtime support allows it

The contract should not promise retries, repair, or resumability in this slice.

## Testing And Verification

Testing should focus on contract validity and preserving the existing deterministic generation proof.

Planned checks:

- Unit test valid and invalid `CreateDemoRequest` parsing.
- Unit test `GenerationJob`, `GenerationProgressEvent`, `GenerationResult`, and `GenerationError` parsing.
- Unit or script-level test that the local runner emits statuses in the expected order for the successful manual fixture path.
- Existing manual capture and assembly tests continue to pass.

Expected verification commands:

```bash
pnpm -r typecheck
pnpm --filter @tinker/project-schema validate:sample
pnpm generate:manual-demo
pnpm generate:local-job
```

If package-local test scripts are added, they should stay minimal and deterministic.

## Success Criteria

The slice is successful when:

- `@tinker/generation-contract` is a real workspace package with types and runtime validators.
- a local runner accepts a `CreateDemoRequest` and returns a valid `GenerationResult`.
- progress events make the generation lifecycle observable without a UI.
- the runner internally uses the existing manual capture and demo assembly proof.
- generated `demo-project.json` still passes `DemoProjectSchema`.
- Person B can integrate against `@tinker/generation-contract` without importing `@tinker/browser-capture` or `@tinker/demo-assembly`.
- no AI generation, queue system, or app/editor implementation is required for the proof.
