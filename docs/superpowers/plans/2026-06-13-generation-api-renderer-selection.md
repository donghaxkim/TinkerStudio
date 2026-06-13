# Generation API Renderer Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose `renderer: "playwright" | "hyperframes" | "both"` through the generation API, default omitted API renderer values to Playwright, and classify Playwright artifacts.

**Architecture:** Keep renderer execution owned by the existing demo assembly runner. The API route normalizes accepted HTTP requests into server-owned job snapshots, the generation contract validates those snapshots, and the artifact index maps runner artifact paths into API artifact kinds.

**Tech Stack:** TypeScript, Zod, Fastify inject tests, Vitest, pnpm workspaces.

---

## File Structure

- Modify `packages/generation-contract/src/apiJob.ts`: widen API job snapshot renderer validation from Hyperframes-only to `AiUrlRendererSchema`, and add Playwright artifact kinds to `ApiArtifactKindSchema`.
- Modify `packages/generation-contract/src/apiJob.test.ts`: document the widened renderer contract, preserve internal-only restrictions, and assert the new artifact-kind enum.
- Modify `apps/api/src/routes/jobs.ts`: parse incoming API requests without inheriting the shared Hyperframes default, default omitted API renderers to Playwright, remove the Hyperframes-only guard, and pass the selected renderer to the stored request.
- Modify `apps/api/src/jobs/artifactIndex.ts`: classify Playwright demo, storyboard, capture plan, capture result, videos, screenshots, and traces.
- Modify `apps/api/src/server.test.ts`: cover explicit renderer acceptance, Playwright defaulting, invalid renderer rejection, store snapshot acceptance, and Playwright artifact classification/serving protections.
- No worker changes are planned. `apps/api/src/workers/generationWorker.ts` already passes the request to the runner and indexes all returned artifact paths.

---

### Task 1: Widen API Contract Schema

**Files:**
- Modify: `packages/generation-contract/src/apiJob.test.ts`
- Modify: `packages/generation-contract/src/apiJob.ts`

- [ ] **Step 1: Write failing contract tests**

In `packages/generation-contract/src/apiJob.test.ts`, update the artifact-kind enum expectation in `exports the artifact kind enum` to include the Playwright kinds between repo analysis and generic assets:

```ts
expect(ApiArtifactKindSchema.options).toEqual([
  "output-video",
  "composition-index",
  "asset-manifest",
  "generation-manifest",
  "lint-log",
  "render-log",
  "product-analysis",
  "product-analysis-screenshot",
  "repo-analysis",
  "playwright-demo-project",
  "playwright-storyboard",
  "playwright-capture-plan",
  "playwright-capture-result",
  "playwright-video",
  "playwright-screenshot",
  "playwright-trace",
  "asset",
  "other",
]);
```

In the same file, update `parses queued and completed API job snapshots` so the queued parse runs all supported renderers:

```ts
for (const renderer of ["hyperframes", "playwright", "both"] as const) {
  const queued = parseApiGenerationJob({
    id: `job-${renderer}`,
    status: "queued",
    request: { ...request, id: `job-${renderer}`, renderer },
    createdAt: "2026-06-11T00:00:00.000Z",
    updatedAt: "2026-06-11T00:00:00.000Z",
    progressEvents: [],
  });

  expect(queued.status).toBe("queued");
  expect(queued.request.id).toBe(`job-${renderer}`);
  expect(queued.request.renderer).toBe(renderer);
}

const completed = parseApiGenerationJob({
  id: "job-test",
  status: "completed",
  request,
  createdAt: "2026-06-11T00:00:00.000Z",
  updatedAt: "2026-06-11T00:00:02.000Z",
  progressEvents: [progressEvent],
  result: {
    artifacts: [
      {
        kind: "output-video",
        relativePath: "hyperframes/output.mp4",
        url: "/api/jobs/job-test/artifacts/hyperframes/output.mp4",
        mediaType: "video/mp4",
      },
      {
        kind: "playwright-video",
        relativePath: "playwright/capture/videos/clip.webm",
        url: "/api/jobs/job-test/artifacts/playwright/capture/videos/clip.webm",
        mediaType: "video/webm",
      },
    ],
  },
});

expect(completed.result?.artifacts.map((artifact) => artifact.kind)).toEqual(["output-video", "playwright-video"]);
```

In `requires AI URL planning requests and explicit progress events`, remove the loop that expects `"playwright"` and `"both"` to fail, and replace it with an invalid renderer assertion:

```ts
expect(
  safeParseApiGenerationJob({
    id: "job-test",
    status: "queued",
    request: { ...request, renderer: "canvas" },
    createdAt: "2026-06-11T00:00:00.000Z",
    updatedAt: "2026-06-11T00:00:00.000Z",
    progressEvents: [],
  }).success,
).toBe(false);
```

- [ ] **Step 2: Run contract tests to verify they fail**

Run: `pnpm --filter @tinker/generation-contract test`

Expected: FAIL. The failure should mention that `"playwright"`, `"both"`, or the new Playwright artifact kinds are invalid under the current API job schema.

- [ ] **Step 3: Implement contract widening**

In `packages/generation-contract/src/apiJob.ts`, update the import and API request schema:

```ts
import { AiUrlPlanningCreateDemoRequestSchema, AiUrlRendererSchema } from "./createDemoRequest.js";
```

```ts
const ApiCreateDemoRequestSchema = AiUrlPlanningCreateDemoRequestSchema.omit({
  outputDirectory: true,
  renderer: true,
})
  .extend({
    id: z.string().min(1),
    renderer: AiUrlRendererSchema,
  })
  .strict();
```

Update `ApiArtifactKindSchema` to exactly match the enum from the updated test:

```ts
export const ApiArtifactKindSchema = z.enum([
  "output-video",
  "composition-index",
  "asset-manifest",
  "generation-manifest",
  "lint-log",
  "render-log",
  "product-analysis",
  "product-analysis-screenshot",
  "repo-analysis",
  "playwright-demo-project",
  "playwright-storyboard",
  "playwright-capture-plan",
  "playwright-capture-result",
  "playwright-video",
  "playwright-screenshot",
  "playwright-trace",
  "asset",
  "other",
]);
```

- [ ] **Step 4: Run contract tests to verify they pass**

Run: `pnpm --filter @tinker/generation-contract test`

Expected: PASS.

- [ ] **Step 5: Commit contract changes**

```bash
git add packages/generation-contract/src/apiJob.ts packages/generation-contract/src/apiJob.test.ts
git commit -m "feat(contract): support API renderer selection"
```

---

### Task 2: Default and Accept Renderers in the API Route

**Files:**
- Modify: `apps/api/src/server.test.ts`
- Modify: `apps/api/src/routes/jobs.ts`

- [ ] **Step 1: Write failing API route tests**

In `apps/api/src/server.test.ts`, keep `validBody` without `renderer`. Update the first route test name and payload to make Hyperframes explicit:

```ts
it("accepts explicit Hyperframes jobs, injects the server id, runs Hyperframes, and exposes completed snapshots", async () => {
```

Within that test, change the POST payload from:

```ts
payload: { ...validBody, id: "client-id" },
```

to:

```ts
payload: { ...validBody, id: "client-id", renderer: "hyperframes" },
```

Replace the existing `accepts omitted renderer and stores Hyperframes in the response snapshot` test with this Playwright default test:

```ts
it("defaults omitted renderer to Playwright and stores Playwright in the response snapshot", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), `tinker-api-routes-default-renderer-${randomUUID()}-`));
  const outputRoot = join(repoRoot, "generated", "local-job", "job-test");
  const completed = deferred<void>();
  const server = await buildServer({
    config: testConfig(repoRoot),
    idGenerator: () => "job-test",
    runner: async (rawRequest): Promise<ManualFixtureGenerationResult> => {
      expect(rawRequest).toMatchObject({ id: "job-test", mode: "ai-url-planning", renderer: "playwright" });
      completed.resolve();
      return {
        jobId: "job-test",
        status: "completed",
        projectPath: join(outputRoot, "playwright", "demo-project.json"),
        captureResultPath: join(outputRoot, "playwright", "capture-result.json"),
        outputDirectory: outputRoot,
        artifactPaths: [],
        renderer: "playwright",
        rendererResults: {
          playwright: {
            projectPath: join(outputRoot, "playwright", "demo-project.json"),
            captureResultPath: join(outputRoot, "playwright", "capture-result.json"),
          },
        },
      };
    },
    now: () => "2026-06-11T00:00:00.000Z",
  });

  try {
    const response = await server.inject({ method: "POST", url: "/api/jobs", payload: validBody });

    expect(response.statusCode).toBe(202);
    expect(JSON.parse(response.body)).toMatchObject({
      id: "job-test",
      status: "queued",
      request: { id: "job-test", renderer: "playwright" },
    });
    await completed.promise;
  } finally {
    await server.close();
  }
});
```

Add a route test after the default-renderer test for explicit Playwright and `both` acceptance:

```ts
it("accepts explicit Playwright and both renderers", async () => {
  for (const renderer of ["playwright", "both"] as const) {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-api-routes-${renderer}-${randomUUID()}-`));
    const outputRoot = join(repoRoot, "generated", "local-job", `job-${renderer}`);
    const completed = deferred<void>();
    const server = await buildServer({
      config: testConfig(repoRoot),
      idGenerator: () => `job-${renderer}`,
      runner: async (rawRequest): Promise<ManualFixtureGenerationResult> => {
        expect(rawRequest).toMatchObject({ id: `job-${renderer}`, mode: "ai-url-planning", renderer });
        completed.resolve();

        if (renderer === "playwright") {
          return {
            jobId: `job-${renderer}`,
            status: "completed",
            projectPath: join(outputRoot, "playwright", "demo-project.json"),
            captureResultPath: join(outputRoot, "playwright", "capture-result.json"),
            outputDirectory: outputRoot,
            artifactPaths: [],
            renderer,
            rendererResults: {
              playwright: {
                projectPath: join(outputRoot, "playwright", "demo-project.json"),
                captureResultPath: join(outputRoot, "playwright", "capture-result.json"),
              },
            },
          };
        }

        return {
          jobId: `job-${renderer}`,
          status: "completed",
          projectPath: join(outputRoot, "hyperframes", "output.mp4"),
          captureResultPath: join(outputRoot, "hyperframes", "generation-manifest.json"),
          outputDirectory: outputRoot,
          artifactPaths: [],
          renderer,
          rendererResults: {
            hyperframes: {
              outputVideoPath: join(outputRoot, "hyperframes", "output.mp4"),
              generationManifestPath: join(outputRoot, "hyperframes", "generation-manifest.json"),
              assetManifestPath: join(outputRoot, "hyperframes", "asset-manifest.json"),
            },
            playwright: {
              projectPath: join(outputRoot, "playwright", "demo-project.json"),
              captureResultPath: join(outputRoot, "playwright", "capture-result.json"),
            },
          },
        };
      },
      now: () => "2026-06-11T00:00:00.000Z",
    });

    try {
      const response = await server.inject({ method: "POST", url: "/api/jobs", payload: { ...validBody, renderer } });

      expect(response.statusCode).toBe(202);
      expect(JSON.parse(response.body)).toMatchObject({
        id: `job-${renderer}`,
        status: "queued",
        request: { id: `job-${renderer}`, renderer },
      });
      await completed.promise;
    } finally {
      await server.close();
    }
  }
});
```

In `rejects invalid job requests and caps pending queue capacity`, replace the invalid renderer entries:

```ts
{ ...validBody, renderer: "playwright" },
{ ...validBody, renderer: "both" },
```

with:

```ts
{ ...validBody, renderer: "canvas" },
```

In the capacity runner in the same test, update the mocked completed result to match the new default Playwright request path:

```ts
return {
  jobId: "job-blocked",
  status: "completed",
  projectPath: join(repoRoot, "generated", "local-job", "job-blocked", "playwright", "demo-project.json"),
  captureResultPath: join(repoRoot, "generated", "local-job", "job-blocked", "playwright", "capture-result.json"),
  outputDirectory: join(repoRoot, "generated", "local-job", "job-blocked"),
  artifactPaths: [],
  renderer: "playwright",
  rendererResults: {
    playwright: {
      projectPath: join(repoRoot, "generated", "local-job", "job-blocked", "playwright", "demo-project.json"),
      captureResultPath: join(repoRoot, "generated", "local-job", "job-blocked", "playwright", "capture-result.json"),
    },
  },
};
```

In `ignores malformed client ids before validating job requests`, change the runner expectation to Playwright because the payload omits `renderer`:

```ts
expect(rawRequest).toMatchObject({ id: "job-test", mode: "ai-url-planning", renderer: "playwright" });
```

Replace that mocked result with a Playwright-shaped result:

```ts
return {
  jobId: "job-test",
  status: "completed",
  projectPath: join(outputRoot, "playwright", "demo-project.json"),
  captureResultPath: join(outputRoot, "playwright", "capture-result.json"),
  outputDirectory: outputRoot,
  artifactPaths: [],
  renderer: "playwright",
  rendererResults: {
    playwright: {
      projectPath: join(outputRoot, "playwright", "demo-project.json"),
      captureResultPath: join(outputRoot, "playwright", "capture-result.json"),
    },
  },
};
```

- [ ] **Step 2: Run API tests to verify route failures**

Run: `pnpm --filter @tinker/api test`

Expected: FAIL. The route should still default to Hyperframes and still reject Playwright or `both` before implementation.

- [ ] **Step 3: Implement API route normalization**

In `apps/api/src/routes/jobs.ts`, update the import:

```ts
import {
  AiUrlPlanningCreateDemoRequestSchema,
  AiUrlRendererSchema,
  GenerationErrorSchema,
  type AiUrlPlanningCreateDemoRequest,
} from "@tinker/generation-contract";
```

Replace `ApiJobCreateRequestBodySchema` with a schema that removes the shared renderer default before adding an optional API renderer:

```ts
const ApiJobCreateRequestBodySchema = AiUrlPlanningCreateDemoRequestSchema.omit({
  id: true,
  outputDirectory: true,
  renderer: true,
})
  .extend({
    renderer: AiUrlRendererSchema.optional(),
  })
  .strict();
```

Remove this Hyperframes-only guard completely:

```ts
if (parsed.data.renderer !== "hyperframes") {
  return reply.status(422).send(validationError("renderer must be hyperframes"));
}
```

Before building `acceptedRequest`, compute the API-owned default:

```ts
const renderer = parsed.data.renderer ?? "playwright";
```

Then set the accepted request renderer from that value:

```ts
const acceptedRequest = {
  id,
  mode: "ai-url-planning",
  repoUrl: parsed.data.repoUrl,
  productUrl: parsed.data.productUrl,
  durationCapSeconds: parsed.data.durationCapSeconds,
  aspectRatio: parsed.data.aspectRatio,
  renderer,
  ...(parsed.data.prompt === undefined ? {} : { prompt: parsed.data.prompt }),
} satisfies AiUrlPlanningCreateDemoRequest;
```

- [ ] **Step 4: Run API tests to verify route behavior passes**

Run: `pnpm --filter @tinker/api test`

Expected: PASS for route-related tests. If the only remaining failures are the job store tests that still expect Playwright snapshots to throw, continue to Task 3 before committing.

- [ ] **Step 5: Commit route changes**

If the API test suite passes at this point, commit:

```bash
git add apps/api/src/routes/jobs.ts apps/api/src/server.test.ts
git commit -m "feat(api): accept renderer selection for jobs"
```

If the API test suite still fails only on job store validation that expects Playwright to be invalid, continue to Task 3 and include `apps/api/src/server.test.ts` in that task's commit instead.

---

### Task 3: Update Job Store Expectations for Widened Snapshots

**Files:**
- Modify: `apps/api/src/server.test.ts`

- [ ] **Step 1: Write failing store assertions for Playwright and both snapshots**

Replace `does not sanitize invalid API request fields into valid snapshots` with:

```ts
it("stores all supported API renderers without sanitizing request snapshots", () => {
  const store = createJobStore();

  for (const renderer of ["hyperframes", "playwright", "both"] as const) {
    const snapshot = store.create({
      id: `job-${renderer}`,
      request: { ...request, id: `job-${renderer}`, renderer },
      outputRoot: `/tmp/job-${renderer}`,
      now: "2026-06-11T00:00:00.000Z",
    });

    expect(snapshot.request.renderer).toBe(renderer);
  }

  expect(() => store.create({
    id: "job-output-directory",
    request: { ...request, outputDirectory: "/tmp/output" },
    outputRoot: "/tmp/job-output-directory",
    now: "2026-06-11T00:00:00.000Z",
  })).toThrow();
});
```

Replace `does not persist invalid records when create validation fails` with:

```ts
it("does not persist invalid records when create validation fails", () => {
  const store = createJobStore();

  expect(() => store.create({
    id: "job-invalid-output-directory",
    request: { ...request, outputDirectory: "/tmp/output" },
    outputRoot: "/tmp/job-invalid-output-directory",
    now: "2026-06-11T00:00:00.000Z",
  })).toThrow();

  expect(store.getRecord("job-invalid-output-directory")).toBeUndefined();
  expect(store.getSnapshot("job-invalid-output-directory")).toBeUndefined();
});
```

- [ ] **Step 2: Run the API tests**

Run: `pnpm --filter @tinker/api test`

Expected: PASS for store validation if Task 1 has already widened `ApiGenerationJobSchema`.

- [ ] **Step 3: Commit store expectation changes if not already committed**

```bash
git add apps/api/src/server.test.ts
git commit -m "test(api): cover widened renderer snapshots"
```

If Task 2 already committed `apps/api/src/server.test.ts`, this step should have no changes and should be skipped.

---

### Task 4: Classify Playwright Artifacts

**Files:**
- Modify: `apps/api/src/server.test.ts`
- Modify: `apps/api/src/jobs/artifactIndex.ts`

- [ ] **Step 1: Write failing artifact-index tests**

In `apps/api/src/server.test.ts`, add this test inside `describe("artifact indexing", () => {` after the Hyperframes classification test:

```ts
it("classifies Playwright artifacts and keeps unknown Playwright paths", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "tinker-api-playwright-artifacts-"));
  const artifacts = indexArtifacts({
    jobId: "job-test",
    outputRoot,
    artifactPaths: [
      join(outputRoot, "playwright", "demo-project.json"),
      join(outputRoot, "playwright", "storyboard.json"),
      join(outputRoot, "playwright", "capture-plan.json"),
      join(outputRoot, "playwright", "capture-result.json"),
      join(outputRoot, "playwright", "capture", "videos", "clip.webm"),
      join(outputRoot, "playwright", "capture", "screenshots", "frame.png"),
      join(outputRoot, "playwright", "capture", "trace.zip"),
      join(outputRoot, "playwright", "notes.txt"),
    ],
  });

  expect(artifacts.map((artifact) => artifact.kind)).toEqual([
    "playwright-demo-project",
    "playwright-storyboard",
    "playwright-capture-plan",
    "playwright-capture-result",
    "playwright-video",
    "playwright-screenshot",
    "playwright-trace",
    "other",
  ]);
  expect(artifacts[4]).toMatchObject({
    relativePath: "playwright/capture/videos/clip.webm",
    url: "/api/jobs/job-test/artifacts/playwright/capture/videos/clip.webm",
    mediaType: "video/webm",
  });
  expect(artifacts[5]).toMatchObject({
    relativePath: "playwright/capture/screenshots/frame.png",
    mediaType: "image/png",
  });
});
```

In the route test `serves safe job artifacts and rejects traversal or encoded slash paths`, add a listed Playwright artifact to the fake runner:

```ts
await mkdir(join(outputRoot, "playwright", "capture", "videos"), { recursive: true });
await writeFile(join(outputRoot, "playwright", "capture", "videos", "clip.webm"), "webm");
```

Add that file to `artifactPaths`:

```ts
join(outputRoot, "playwright", "capture", "videos", "clip.webm"),
```

Then add a serving assertion before the unsafe URL loop:

```ts
const playwrightVideoResponse = await server.inject({
  method: "GET",
  url: "/api/jobs/job-test/artifacts/playwright/capture/videos/clip.webm",
});

expect(playwrightVideoResponse.statusCode).toBe(200);
expect(playwrightVideoResponse.headers["x-content-type-options"]).toBe("nosniff");
expect(playwrightVideoResponse.headers["content-type"]).toContain("video/webm");
```

- [ ] **Step 2: Run API tests to verify artifact failures**

Run: `pnpm --filter @tinker/api test`

Expected: FAIL. The index should classify Playwright paths as `other`, and `.webm` media type may be missing.

- [ ] **Step 3: Implement artifact classification**

In `apps/api/src/jobs/artifactIndex.ts`, update `classifyArtifact`:

```ts
function classifyArtifact(relativePath: string): ApiArtifactKind {
  if (relativePath === "hyperframes/output.mp4") return "output-video";
  if (relativePath === "hyperframes/index.html") return "composition-index";
  if (relativePath === "hyperframes/asset-manifest.json") return "asset-manifest";
  if (relativePath === "hyperframes/generation-manifest.json") return "generation-manifest";
  if (relativePath === "hyperframes/lint.log") return "lint-log";
  if (relativePath === "hyperframes/render.log") return "render-log";
  if (relativePath === "product-analysis.json") return "product-analysis";
  if (relativePath === "product-analysis.png") return "product-analysis-screenshot";
  if (relativePath === "repo-analysis.json") return "repo-analysis";
  if (relativePath === "playwright/demo-project.json") return "playwright-demo-project";
  if (relativePath === "playwright/storyboard.json") return "playwright-storyboard";
  if (relativePath === "playwright/capture-plan.json") return "playwright-capture-plan";
  if (relativePath === "playwright/capture-result.json") return "playwright-capture-result";
  if (relativePath.startsWith("playwright/capture/videos/")) return "playwright-video";
  if (relativePath.startsWith("playwright/capture/screenshots/")) return "playwright-screenshot";
  if (relativePath.startsWith("playwright/") && (relativePath.endsWith(".zip") || relativePath.endsWith(".trace"))) {
    return "playwright-trace";
  }
  if (relativePath.startsWith("hyperframes/assets/")) return "asset";
  return "other";
}
```

Update `mediaTypeForPath` to handle WebM videos:

```ts
if (relativePath.endsWith(".mp4")) return "video/mp4";
if (relativePath.endsWith(".webm")) return "video/webm";
```

- [ ] **Step 4: Run API tests to verify artifact behavior passes**

Run: `pnpm --filter @tinker/api test`

Expected: PASS.

- [ ] **Step 5: Commit artifact changes**

```bash
git add apps/api/src/jobs/artifactIndex.ts apps/api/src/server.test.ts
git commit -m "feat(api): classify Playwright artifacts"
```

---

### Task 5: Final Verification

**Files:**
- Verify: workspace test and typecheck outputs

- [ ] **Step 1: Run contract tests**

Run: `pnpm --filter @tinker/generation-contract test`

Expected: PASS.

- [ ] **Step 2: Run API tests**

Run: `pnpm --filter @tinker/api test`

Expected: PASS.

- [ ] **Step 3: Run demo assembly tests**

Run: `pnpm --filter @tinker/demo-assembly test`

Expected: PASS. No demo-assembly code should have changed; this verifies the existing runner contract still accepts all renderer modes.

- [ ] **Step 4: Run workspace typecheck**

Run: `pnpm -r typecheck`

Expected: PASS.

- [ ] **Step 5: Inspect final diff and status**

Run: `git status --short`

Expected: no uncommitted changes if every prior task was committed.

Run: `git log --oneline -5`

Expected: includes the plan/spec commits and the implementation commits from the tasks above.

---

## Self-Review Notes

- Spec coverage: the plan covers explicit renderer values, omitted renderer defaulting to Playwright, preservation of internal-only `manual-fixture` rejection, `outputDirectory` rejection, API job schema widening, Playwright artifact kinds, path traversal protections through existing artifact serving tests, and final verification commands.
- Scope check: no changes are planned for `apps/web`, `apps/desktop`, `packages/editor`, `packages/ai-edit-ui`, or `packages/rendering`.
- Type consistency: route tests use `ManualFixtureGenerationResult` shapes that match `rendererResults.playwright`, `rendererResults.hyperframes`, and `renderer: "both"` validation from `packages/generation-contract/src/generationResult.ts`.
- Defaulting risk: the route task explicitly omits `renderer` before adding `AiUrlRendererSchema.optional()` so the shared Hyperframes default cannot override the API-owned Playwright default.
