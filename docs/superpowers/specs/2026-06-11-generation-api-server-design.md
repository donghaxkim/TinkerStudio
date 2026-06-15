# Generation API Server Design

## Status

Approved for implementation planning.

## Context

The previous slice (`2026-06-09-generation-contract-local-runner-design.md`) delivered `@tinker/generation-contract` and `runLocalGenerationJob`, the in-process runner that executes generation behind a validated contract. The runner has since grown beyond that spec: it dispatches `mode: "ai-url-planning"` requests through `runAiUrlDemo`, which analyzes the product website and repository, generates a Hyperframes composition with an agent, validates the generated artifacts, and renders `output.mp4` with a lint/render repair loop.

What does not exist is any way to invoke the runner outside a terminal. `apps/api` contains only `.gitkeep` files, and Person B's web app runs entirely against `createMockGenerationClient`.

This slice also records a product direction decision made during design:

- **Generation is Hyperframes-only.** Agent-driven Playwright capture produced footage with motion quality too poor for Screen Studio-style output (smooth cursor paths, eased zooms). Hyperframes bakes that motion into a GSAP composition instead. The Playwright capture path was not exposed through this API slice, and the old `manual-fixture` mode has since been removed from the shared create-demo contract.
- **The editable artifact is the composition source, not a `DemoProject` timeline.** The job result returns served artifact URLs, including the generated `index.html` composition. The intended future editing loop is conversational: the user prompts an agent that edits the composition source and re-renders. The `DemoProject`/assisted result dialect stays in the contract untouched, but its deprecation — and the corresponding `docs/architecture.md` revision — must be discussed jointly with Person B. Neither happens in this slice.

## Goal

Build the smallest local HTTP server that lets a client create an AI Hyperframes generation job, observe its progress by polling, and fetch the produced artifacts — including the composition source — over HTTP.

## Non-Goals

- No `apps/web`, `apps/desktop`, or any Person B-owned package changes. Integration is a documented handoff.
- No SSE or websockets. Polling only; streaming is deferred to the future chat-iteration feature.
- No exposure of the removed `manual-fixture` mode or the `playwright`/`both` renderers through the API.
- No `DemoProject` compilation or assisted-dialect result construction.
- This slice originally avoided existing schema deletion; `manual-fixture` removal is covered by the later removal spec.
- No durable job persistence, database, cancellation, retries, or authentication.
- No chat/edit-iteration endpoints.

## Package Boundaries

### `@tinker/api` (new, in `apps/api`)

Thin, contract-driven HTTP layer. Owns routing, request validation against the shared contract, the in-memory job store and FIFO queue, invocation of the runner, and artifact serving. Contains no generation logic.

```text
apps/api/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    main.ts                 # boot: read config, build server, listen
    server.ts               # buildServer(deps): Fastify instance with injectable runner
    config.ts               # port, CORS origins from env
    routes/
      jobs.ts               # POST /api/jobs, GET /api/jobs/:id
      artifacts.ts          # GET /api/jobs/:id/artifacts/*
    jobs/
      jobStore.ts           # in-memory job records
      jobQueue.ts           # FIFO queue, concurrency 1, bounded length
      artifactIndex.ts      # artifact path -> kind/url/mediaType mapping
    workers/
      generationWorker.ts   # invokes runLocalGenerationJob with onProgress
```

### `@tinker/generation-contract` (one additive module)

New `src/apiJob.ts` defining the HTTP response shapes: `ApiArtifact`, `ApiGenerationResult`, `ApiGenerationJob`, with Zod schemas and parse helpers. It reuses the existing `AiUrlPlanningCreateDemoRequestSchema`, `ManualFixtureProgressEventSchema`, and `GenerationErrorSchema`, and defines its own narrowed status enum (the runner subset below — not `GenerationStatusSchema`, which also carries the assisted dialect's `succeeded`/`canceled`). No existing schema changes. Ships as its own small PR for joint review per the schema workflow rules.

### `@tinker/demo-assembly` (unchanged)

`runLocalGenerationJob` is consumed as-is via its existing options (including runner injection for tests).

## HTTP Contract

The server binds `127.0.0.1` only. Port defaults to `4500`, configurable via `TINKER_API_PORT`.

### `POST /api/jobs`

Creates a job. The body must parse as `AiUrlPlanningCreateDemoRequest` with these additional API rules:

- `renderer` must be `"hyperframes"` (the schema default when omitted). Explicit `"playwright"` or `"both"` is rejected.
- `outputDirectory` must be absent. The server controls output layout.
- A client-supplied `id` is ignored. The server generates the job ID (`job-<base36 time>-<random suffix>`) and injects it into the request before invoking the runner, so the runner writes to `generated/local-job/<jobId>`.

Responses:

- `202` with the queued `ApiGenerationJob` snapshot.
- `400` for unparseable JSON.
- `422` with a `GenerationError` (`stage: "validation"`) for contract violations, including the API rules above.
- `429` when the queue is full (bounded at 10 pending jobs).

### `GET /api/jobs/:id`

Returns the current `ApiGenerationJob` snapshot, or `404 { message }` for unknown IDs. Clients poll this route (1–2 s is fine; the runner emits roughly six coarse events over minutes).

### `GET /api/jobs/:id/artifacts/<relativePath>`

Serves a file from that job's output root. `404` for unknown jobs, missing files, paths outside the job root, or jobs that have not completed the relevant file yet. Static serving uses the job's resolved output root with path-traversal protection and `X-Content-Type-Options: nosniff`.

## Contract Shape

```ts
type ApiGenerationJob = {
  id: string;
  status: "queued" | "running" | "capturing" | "assembling" | "completed" | "failed";
  request: AiUrlPlanningCreateDemoRequest;   // echo of the accepted request
  createdAt: string;
  updatedAt: string;
  progressEvents: ManualFixtureProgressEvent[]; // runner dialect, appended in order
  result?: ApiGenerationResult;              // present iff status === "completed"
  error?: GenerationError;                   // present iff status === "failed"
};

type ApiGenerationResult = {
  artifacts: ApiArtifact[];
};

type ApiArtifact = {
  kind: ApiArtifactKind;
  url: string;            // relative: /api/jobs/<id>/artifacts/<relativePath>
  relativePath: string;   // POSIX-style path inside the job output root
  mediaType?: string;     // best effort from extension
};

type ApiArtifactKind =
  | "output-video"                  // hyperframes/output.mp4
  | "composition-index"             // hyperframes/index.html (the editable source)
  | "asset-manifest"                // hyperframes/asset-manifest.json
  | "generation-manifest"           // hyperframes/generation-manifest.json
  | "lint-log"                      // hyperframes/lint.log
  | "render-log"                    // hyperframes/render.log
  | "product-analysis"              // product-analysis.json
  | "product-analysis-screenshot"   // product-analysis.png
  | "repo-analysis"                 // repo-analysis.json
  | "asset"                         // hyperframes/assets/**
  | "other";                        // any other runner-reported artifact
```

`artifactIndex.ts` classifies the runner's `ManualFixtureGenerationResult.artifactPaths` by relative location within the job output root using the table above. Unrecognized paths are included as `"other"` rather than dropped. URLs are relative so they work unchanged behind a dev proxy.

## Data Flow

```text
POST /api/jobs
  -> validate AiUrlPlanningCreateDemoRequest + API rules
  -> create in-memory job record (queued), enqueue, respond 202

worker (one job at a time, FIFO)
  -> runLocalGenerationJob(request, { onProgress })
  -> each progress event appended to the record; record.status follows event status
  -> on success: classify artifactPaths -> ApiArtifact[]; status completed
  -> on LocalGenerationJobError: store generationError; status failed

GET /api/jobs/:id            -> snapshot of the record
GET /api/jobs/:id/artifacts/* -> static file from generated/local-job/<jobId>
```

## Error Handling

- Validation failures never enqueue a job.
- Runner failures surface as the job's typed `GenerationError` with its failure stage (`validation | analysis | planning | verification | capture | assembly | unknown`), matching what `runLocalGenerationJob` already produces.
- Unexpected route errors return `500 { message }` without leaking stack traces.
- A server restart loses in-memory job records; artifacts remain on disk under `generated/local-job/`. `GET` for a pre-restart job returns `404`. This is a documented limitation; persistence is future scope.

## Security Posture

- Loopback-only listener; no auth in this slice.
- CORS defaults to `http://localhost:5173` and `http://127.0.0.1:5173`, overridable via `TINKER_API_CORS_ORIGINS` (comma-separated). The recommended integration is a Vite proxy, which makes CORS moot.
- The served `index.html` is AI-generated code. Mitigations: it executes only on the loopback origin for the user who generated it, and `validateHyperframesArtifacts` already enforces the forbidden-file rules before a job can complete.
- Artifact serving resolves strictly inside the per-job output root (same posture as the runner's `resolveSafeOutputDirectory`).

## Person B Handoff

What the web app needs to integrate, with no Person A involvement in `apps/web`:

1. **Create:** `POST /api/jobs` with `{ mode: "ai-url-planning", repoUrl, productUrl, prompt?, durationCapSeconds, aspectRatio }`. Note `repoUrl` must be a public GitHub repository root URL. The current Create Demo form submits the assisted request shape (no `mode`); it must send the `ai-url-planning` shape instead.
2. **Poll:** `GET /api/jobs/:id` every 1–2 s until `status` is `completed` or `failed`. Render `progressEvents` (runner dialect: `status` + `message` + `time`), not the assisted `phase` dialect.
3. **Consume:** pick artifacts by `kind` — `output-video` for playback, `composition-index` plus `asset`/manifests for the future chat-edit feature.
4. **Dev wiring:** suggested Vite proxy: `{ "/api": "http://127.0.0.1:4500" }`.
5. **Flagged for joint discussion:** deprecation of the assisted/`DemoProject` result dialect and the `docs/architecture.md` revision reflecting composition-source editing. Not part of this slice.

## Runner Proof

Root script `pnpm api:dev` starts the server. A documented curl flow proves the slice end to end:

```bash
curl -s -X POST localhost:4500/api/jobs -H 'content-type: application/json' -d '{
  "mode": "ai-url-planning",
  "repoUrl": "https://github.com/SamuelZ12/longcut",
  "productUrl": "https://longcut.ai",
  "prompt": "Make a short demo of the main value prop.",
  "durationCapSeconds": 12,
  "aspectRatio": "16:9"
}'
curl -s localhost:4500/api/jobs/<id>          # poll until completed
curl -sO localhost:4500/api/jobs/<id>/artifacts/hyperframes/output.mp4
```

Real OpenCode-backed runs require the existing environment (opencode CLI, Hyperframes runtime) and stay manual; they are not part of CI.

## Testing And Verification

All tests run with `fastify.inject()` and an injected fake runner (via `RunLocalGenerationJobOptions.runAiUrlDemo`) writing temp artifacts — no network, no OpenCode, no browser.

Planned checks:

- `POST /api/jobs` accepts a valid ai-url-planning request and returns a queued snapshot with a server-generated ID.
- Rejections: assisted-shape body, removed `mode: "manual-fixture"`, `renderer: "playwright"`/`"both"`, supplied `outputDirectory`, malformed JSON, full queue.
- Lifecycle: progress events append in runner order; terminal snapshots carry `result` xor `error`; FIFO order and single-concurrency hold under multiple submissions.
- Artifact classification: known paths map to the kind table; unknown paths become `other`; URLs round-trip through the artifacts route; traversal attempts (`..`, absolute paths, encoded separators) return `404`.
- Contract: `ApiGenerationJob`/`ApiArtifact` schemas parse valid payloads and reject malformed ones.

Verification commands:

```bash
pnpm -r typecheck
pnpm --filter @tinker/generation-contract test
pnpm --filter @tinker/api test
```

Existing package suites stay green.

## Risks

- **In-memory store**: restart forgets jobs. Acceptable for a local single-user prototype; artifacts survive on disk.
- **Long jobs + polling UX**: planning alone can take ~10 minutes. Progress events are coarse; the handoff documents this so the UI can set expectations.
- **Contract drift with the mock client**: Person B's UI was built against the assisted dialect. The handoff section is the bridge; the dialect deprecation discussion is the durable fix.
- **Single-slot queue**: a second job waits for the first. Correct for local resource limits; revisit only if multi-user ever matters.

## Success Criteria

- `pnpm api:dev` starts a loopback server backed by the real runner.
- A valid `ai-url-planning` request creates a job that progresses through runner statuses observable by polling.
- A completed job's `output.mp4`, `index.html` composition source, manifests, logs, and analysis artifacts are all fetchable over HTTP at the URLs the result reports.
- Invalid requests fail with typed validation errors before any generation work starts.
- `@tinker/generation-contract` gains only the additive `apiJob` module, reviewed as its own PR.
- No file under `apps/web`, `apps/desktop`, `packages/editor`, `packages/ai-edit-ui`, or `packages/rendering` changes.
