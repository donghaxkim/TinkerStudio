# Testreel Published Video Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the active AI URL Playwright capture/render backend with a local Testreel CLI published-video backend.

**Architecture:** Keep the existing analysis, understanding, strategy, storyboard, job queue, artifact serving, and standalone video preview surfaces. Change the planner contract to emit a Tinker-owned Testreel wrapper, run Testreel through one isolated runner module, normalize the MP4 to `generated/<run>/testreel/final.mp4`, and expose that MP4 as the primary `published-video` artifact. After the Testreel path is tested end to end, remove Playwright-specific assumptions from active demo assembly, API, and web code.

**Tech Stack:** TypeScript, Node.js `spawn`, Zod, pnpm workspaces, local `testreel@0.2.0`, Vitest for API/web/contract tests, script-style `tsx` tests in `@tinker/demo-assembly`.

## Global Constraints

- Make Testreel the sole engine for generated published demo videos.
- Use Testreel as a local project dependency; do not depend on a global `testreel` install and do not use a hosted API.
- Keep upstream product analysis, repo analysis, Product Understanding, Demo Strategy, storyboard, job orchestration, progress reporting, artifact serving, preview, and export flow.
- The immediate output is a polished final MP4, not an editable Tinker timeline.
- Planner output for the active AI URL flow is a `TestreelGenerationPlan`, not Tinker's old `CapturePlan`.
- Do not keep using `playwright-video` for new Testreel output; completed jobs expose a primary `published-video` artifact.
- New generated jobs write `generated/<run>/testreel/recording-plan.json`, `generated/<run>/testreel/recording.json`, `generated/<run>/testreel/output/output.json` when Testreel produces it, and stable `generated/<run>/testreel/final.mp4`.
- No backward compatibility is required for old generated Playwright folders in the new active flow.
- Do not add a second browser verification pass in this PR.
- Checkpoints remain planner-declared expectations unless represented by Testreel `waitFor` gates.
- Testreel process failures fail the generation job at the `capture` stage with trimmed stderr in the job error.
- Missing MP4 output after successful Testreel CLI exit fails assembly with a clear error.
- Cancellation must terminate the spawned Testreel process and Chromium/FFmpeg descendants using a process-group kill pattern on non-Windows platforms.
- Final verification commands:
  - `pnpm --filter @tinker/generation-contract test`
  - `pnpm --filter @tinker/demo-assembly test`
  - `pnpm --filter @tinker/api test`
  - `pnpm --filter @tinker/web test`
  - `pnpm typecheck`
  - `pnpm --filter @tinker/demo-assembly generate:ai-url-job -- --repo https://github.com/getpaykit/paykit --url https://paykit.sh/ --duration 45`

---

## File Structure

- Modify `packages/generation-contract/src/generationResult.ts`: make local completed generation results Testreel/published-video based.
- Modify `packages/generation-contract/src/apiJob.ts`: make API completed results `method: "testreel"` with artifacts and no `DemoProject` requirement.
- Modify `packages/generation-contract/src/generationContract.test.ts` and `packages/generation-contract/src/apiJob.test.ts`: lock the new contracts.
- Create `packages/demo-assembly/src/testreelPlan.ts`: Zod schemas, types, default dimensions, safety validation, and fixture plan creation for Testreel recording definitions.
- Create `packages/demo-assembly/src/testreelPlan.test.ts`: script-style tests for plan parsing, safety, and old `CapturePlan` rejection.
- Modify `packages/demo-assembly/src/aiPlanning.ts`: parse and prompt for `recordingPlan` instead of `capturePlan`.
- Modify `packages/demo-assembly/src/aiPlanning.test.ts`: expect planner output and prompts to use `recordingPlan`/Testreel actions.
- Create `packages/demo-assembly/src/testreelRunner.ts`: write Testreel artifacts, run validation, run recording, capture logs, support cancellation, and copy/select `final.mp4`.
- Create `packages/demo-assembly/src/testreelRunner.test.ts`: script-style tests using fake CLI processes.
- Modify `packages/demo-assembly/src/runAiUrlDemo.ts`: remove active Playwright renderer work and run Testreel after storyboard strategy.
- Modify `packages/demo-assembly/src/runAiUrlDemo.test.ts`: expect `testreel/` artifacts, Testreel phase order, and no `demo-project.json` requirement.
- Modify `packages/demo-assembly/src/runSummary.ts` and `packages/demo-assembly/src/runSummary.test.ts`: report `finalVideoMode: "testreel"` and Testreel evidence paths honestly.
- Modify `packages/demo-assembly/src/coreCoverage.ts` and `packages/demo-assembly/src/coreCoverage.test.ts`: remove `@tinker/browser-capture` types from demo assembly and make final-video refs configurable.
- Modify `packages/demo-assembly/src/localGenerationJob.ts` and `packages/demo-assembly/src/localGenerationJob.test.ts`: return `publishedVideoPath` for completed jobs instead of `projectPath`.
- Modify `packages/demo-assembly/scripts/generateAiUrlJob.ts`: build the right packages and print Testreel artifact paths.
- Modify `packages/demo-assembly/package.json` and `pnpm-lock.yaml`: add Testreel dependencies, add new test files to the test script, and remove old active-path dependencies after deletion.
- Modify `apps/api/src/jobs/artifactIndex.ts` and `apps/api/src/jobs/artifactIndex.test.ts`: classify `testreel/` artifacts and `published-video`.
- Modify `apps/api/src/workers/apiGenerationResult.ts`: build a Testreel API result without reading `demo-project.json`.
- Modify `apps/api/src/server.test.ts`, `apps/api/src/jobs/jobStore.test.ts`, and `apps/api/src/workers/generationWorker.cancel.test.ts`: use Testreel fixture artifacts.
- Modify `apps/web/src/lib/compositionGenerationClient.ts` and tests: add `selectPrimaryVideoArtifact` for `published-video`.
- Modify `apps/web/src/screens/CompositionEditor/CompositionDemoScreen.tsx` and tests: open `published-video`, remove Playwright-specific copy.
- Modify `apps/web/src/screens/CompositionEditor/CompositionEditorScreen.test.tsx` and `apps/web/src/App.test.tsx`: use `testreel/final.mp4` URLs.
- Modify `docs/demo-pipeline.md`: document Testreel as the active pipeline.
- Modify `docs/smooth-playwright-capture.md`: mark the old Playwright capture path as legacy or remove active-flow wording.
- Delete old active demo-assembly Playwright assembly files after Testreel is green: `packages/demo-assembly/src/compileProject.ts`, `compileProject.test.ts`, `captureLineage.ts`, `captureLineage.test.ts`, `editDecisionList.ts`, `editDecisionList.test.ts`, `applyEditDecisionList.ts`, `applyEditDecisionList.test.ts`, `directorPlan.ts`, and `directorPlan.test.ts` if no remaining source imports them.

---

### Task 1: Shared Published-Video Contracts

**Files:**
- Modify: `packages/generation-contract/src/generationResult.ts`
- Modify: `packages/generation-contract/src/apiJob.ts`
- Modify: `packages/generation-contract/src/generationContract.test.ts`
- Modify: `packages/generation-contract/src/apiJob.test.ts`

**Interfaces:**
- Consumes: existing `GenerationResultSchema`, `ApiGenerationResultSchema`, `ApiArtifactKindSchema` exports.
- Produces:
  - `ManualFixtureGenerationResult.renderer: "testreel"`
  - `ManualFixtureGenerationResult.publishedVideoPath: string`
  - `ManualFixtureGenerationResult.rendererResults.testreel.finalVideoPath: string`
  - `ApiGenerationResult.method: "testreel"`
  - `ApiArtifactKind` values: `"published-video"`, `"testreel-recording-plan"`, `"testreel-recording-definition"`, `"testreel-manifest"`, `"testreel-screenshot"`, plus existing product/repo analysis kinds.

- [ ] **Step 1: Write failing generation-contract tests**

Update `packages/generation-contract/src/apiJob.test.ts` so the artifact kind enum and completed result are Testreel-based:

```ts
const publishedVideoArtifact = {
  kind: "published-video",
  relativePath: "testreel/final.mp4",
  url: "/api/jobs/job-test/artifacts/testreel/final.mp4",
  mediaType: "video/mp4",
} as const;

const recordingPlanArtifact = {
  kind: "testreel-recording-plan",
  relativePath: "testreel/recording-plan.json",
  url: "/api/jobs/job-test/artifacts/testreel/recording-plan.json",
  mediaType: "application/json; charset=utf-8",
} as const;

expect(ApiArtifactKindSchema.options).toEqual([
  "product-analysis",
  "product-analysis-screenshot",
  "repo-analysis",
  "published-video",
  "testreel-recording-plan",
  "testreel-recording-definition",
  "testreel-manifest",
  "testreel-screenshot",
  "other",
]);

const completed = parseApiGenerationJob({
  id: "job-test",
  status: "completed",
  request,
  createdAt: "2026-06-11T00:00:00.000Z",
  updatedAt: "2026-06-11T00:00:02.000Z",
  progressEvents: [progressEvent],
  result: {
    method: "testreel",
    artifacts: [recordingPlanArtifact, publishedVideoArtifact],
    warnings: [],
  },
});

expect(completed.result?.method).toBe("testreel");
expect(completed.result?.artifacts.map((artifact) => artifact.kind)).toEqual([
  "testreel-recording-plan",
  "published-video",
]);
expect("project" in completed.result!).toBe(false);

expect(
  ApiGenerationResultSchema.safeParse({
    method: "testreel",
    artifacts: [recordingPlanArtifact],
    warnings: [],
  }).success,
).toBe(false);

expect(
  ApiGenerationResultSchema.safeParse({
    method: "playwright",
    artifacts: [publishedVideoArtifact],
    warnings: [],
  }).success,
).toBe(false);
```

Update `packages/generation-contract/src/generationContract.test.ts` so local completed job results parse without `projectPath` and reject old renderer output:

```ts
const testreelRendererResult = {
  recordingPlanPath: "generated/local-job/ai-url-job/testreel/recording-plan.json",
  recordingPath: "generated/local-job/ai-url-job/testreel/recording.json",
  outputDirectory: "generated/local-job/ai-url-job/testreel/output",
  finalVideoPath: "generated/local-job/ai-url-job/testreel/final.mp4",
  manifestPath: "generated/local-job/ai-url-job/testreel/output/output.json",
  screenshotPaths: ["generated/local-job/ai-url-job/testreel/output/final.png"],
};

const result = GenerationResultSchema.parse({
  jobId: "ai-url-job",
  status: "completed",
  publishedVideoPath: testreelRendererResult.finalVideoPath,
  outputDirectory: "generated/local-job/ai-url-job",
  artifactPaths: [testreelRendererResult.finalVideoPath],
  renderer: "testreel",
  rendererResults: { testreel: testreelRendererResult },
});

assert.equal("status" in result ? result.status : undefined, "completed");
assert.equal("projectPath" in result, false);
assert.equal("captureResultPath" in result, false);

assert.equal(
  GenerationResultSchema.safeParse({
    jobId: "ai-url-job",
    status: "completed",
    projectPath: "generated/local-job/ai-url-job/playwright/demo-project.json",
    captureResultPath: "generated/local-job/ai-url-job/playwright/capture-result.json",
    outputDirectory: "generated/local-job/ai-url-job",
    artifactPaths: ["generated/local-job/ai-url-job/playwright/final.mp4"],
    renderer: "playwright",
    rendererResults: {
      playwright: {
        projectPath: "generated/local-job/ai-url-job/playwright/demo-project.json",
        captureResultPath: "generated/local-job/ai-url-job/playwright/capture-result.json",
      },
    },
  }).success,
  false,
);
```

- [ ] **Step 2: Run the contract tests to verify they fail**

Run: `pnpm --filter @tinker/generation-contract test`

Expected: FAIL because `testreel`, `publishedVideoPath`, and `published-video` are not accepted yet.

- [ ] **Step 3: Implement the local generation result schema**

Replace the Playwright renderer result schema in `packages/generation-contract/src/generationResult.ts` with this Testreel shape:

```ts
const TestreelRendererResultSchema = z
  .object({
    recordingPlanPath: z.string().min(1),
    recordingPath: z.string().min(1),
    outputDirectory: z.string().min(1),
    finalVideoPath: z.string().min(1),
    manifestPath: z.string().min(1).optional(),
    screenshotPaths: z.array(z.string().min(1)).default([]),
  })
  .strict();

const RendererResultsSchema = z
  .object({
    testreel: TestreelRendererResultSchema,
  })
  .strict();

export const ManualFixtureGenerationResultSchema = z
  .object({
    jobId: z.string().min(1),
    status: z.literal("completed"),
    publishedVideoPath: z.string().min(1),
    outputDirectory: z.string().min(1),
    artifactPaths: z.array(z.string().min(1)),
    renderer: z.literal("testreel"),
    rendererResults: RendererResultsSchema,
  })
  .strict()
  .superRefine((result, ctx) => {
    if (result.publishedVideoPath !== result.rendererResults.testreel.finalVideoPath) {
      ctx.addIssue({
        code: "custom",
        path: ["publishedVideoPath"],
        message: "publishedVideoPath must match the Testreel final video path",
      });
    }
  });
```

- [ ] **Step 4: Implement the API job result schema**

In `packages/generation-contract/src/apiJob.ts`, set the active method and artifact result to Testreel:

```ts
export const ApiGenerationMethodSchema = z.literal("testreel");

export const ApiArtifactKindSchema = z.enum([
  "product-analysis",
  "product-analysis-screenshot",
  "repo-analysis",
  "published-video",
  "testreel-recording-plan",
  "testreel-recording-definition",
  "testreel-manifest",
  "testreel-screenshot",
  "other",
]);

export const ApiGenerationResultSchema = z
  .object({
    method: z.literal("testreel"),
    artifacts: z.array(ApiArtifactSchema),
    warnings: z.array(z.string()),
  })
  .strict()
  .superRefine((result, ctx) => {
    if (!result.artifacts.some((artifact) => artifact.kind === "published-video")) {
      ctx.addIssue({
        code: "custom",
        path: ["artifacts"],
        message: "completed Testreel jobs require a published-video artifact",
      });
    }
  });
```

- [ ] **Step 5: Run the contract tests to verify they pass**

Run: `pnpm --filter @tinker/generation-contract test`

Expected: PASS, with API results accepting Testreel artifacts and rejecting Playwright result shapes.

- [ ] **Step 6: Commit the contract change**

Run:

```bash
git add packages/generation-contract/src/generationResult.ts packages/generation-contract/src/apiJob.ts packages/generation-contract/src/generationContract.test.ts packages/generation-contract/src/apiJob.test.ts
git commit -m "feat: switch generation contracts to Testreel output"
```

---

### Task 2: Testreel Planner Contract

**Files:**
- Create: `packages/demo-assembly/src/testreelPlan.ts`
- Create: `packages/demo-assembly/src/testreelPlan.test.ts`
- Modify: `packages/demo-assembly/src/aiPlanning.ts`
- Modify: `packages/demo-assembly/src/aiPlanning.test.ts`
- Modify: `packages/demo-assembly/src/index.ts`
- Modify: `packages/demo-assembly/package.json`

**Interfaces:**
- Consumes: `AiUrlPlannerInput`, `ManualStoryboard`, product/repo/narrative analysis.
- Produces:
  - `TestreelGenerationPlan` with `engine: "testreel"`, `definition`, `expectedCheckpoints`, and optional `notes`.
  - `parseTestreelGenerationPlanJson(value: string): TestreelGenerationPlan`
  - `assertTestreelPlanMatchesProductUrl(plan: TestreelGenerationPlan, productUrl: string): void`
  - `createFixtureTestreelGenerationPlan(input: { productUrl: string; aspectRatio: AspectRatio; title: string }): TestreelGenerationPlan`
  - `AiUrlPlannerResult.recordingPlan: TestreelGenerationPlan`

- [ ] **Step 1: Write failing Testreel plan tests**

Create `packages/demo-assembly/src/testreelPlan.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  assertTestreelPlanMatchesProductUrl,
  createFixtureTestreelGenerationPlan,
  parseTestreelGenerationPlanJson,
} from "./testreelPlan.js";

const plan = {
  engine: "testreel",
  definition: {
    url: "https://example.com/app",
    viewport: { width: 1280, height: 720 },
    outputSize: { width: 1920, height: 1080 },
    outputFormat: "mp4",
    cursor: { enabled: true, size: 48, rippleSize: 100 },
    chrome: { enabled: true, url: true },
    background: { enabled: true, gradient: { from: "#0f172a", to: "#38bdf8" }, padding: 60, borderRadius: 18 },
    steps: [
      { action: "wait", ms: 500 },
      { action: "click", selector: "[data-testid='start-demo']" },
      { action: "type", selector: "[data-testid='workspace-name']", text: "Fixture workspace" },
      { action: "keyboard", key: "Enter" },
      { action: "scroll", y: 720 },
      { action: "screenshot", name: "final" },
    ],
  },
  expectedCheckpoints: [{ id: "final", label: "Final screen", selector: "[data-testid='export-card']" }],
  notes: ["Fixture note"],
} as const;

const parsed = parseTestreelGenerationPlanJson(JSON.stringify(plan));
assert.equal(parsed.engine, "testreel");
assert.equal(parsed.definition.outputFormat, "mp4");
assert.equal(parsed.definition.steps.length, 6);
assertTestreelPlanMatchesProductUrl(parsed, "https://example.com/app");

assert.throws(
  () =>
    parseTestreelGenerationPlanJson(
      JSON.stringify({
        targetUrl: "https://example.com/app",
        viewport: { width: 1280, height: 720 },
        steps: [{ type: "goto", url: "https://example.com/app" }],
        expectedCheckpoints: [],
      }),
    ),
  /Testreel generation plan is invalid/,
);

assert.throws(
  () => parseTestreelGenerationPlanJson(JSON.stringify({ ...plan, definition: { ...plan.definition, url: "https://${HOST}/app" } })),
  /environment variable substitution is not allowed/,
);

assert.throws(
  () => assertTestreelPlanMatchesProductUrl({ ...parsed, definition: { ...parsed.definition, url: "https://evil.example/app" } }, "https://example.com/app"),
  /recording URL must stay on product origin/,
);

const fixture = createFixtureTestreelGenerationPlan({
  productUrl: "https://example.com/app",
  aspectRatio: "9:16",
  title: "Fixture Product",
});
assert.equal(fixture.definition.viewport.width, 720);
assert.equal(fixture.definition.viewport.height, 1280);
assert.equal(fixture.definition.outputSize?.width, 1080);
assert.equal(fixture.definition.outputSize?.height, 1920);
assert.equal(fixture.definition.outputFormat, "mp4");

console.log("testreel plan tests passed");
```

Add it to the `@tinker/demo-assembly` test script immediately before `aiPlanning.test.ts`:

```json
"tsx src/testreelPlan.test.ts && tsx src/aiPlanning.test.ts"
```

- [ ] **Step 2: Update planner tests to expect `recordingPlan`**

In `packages/demo-assembly/src/aiPlanning.test.ts`, replace the fixture `capturePlanFixture` with a `recordingPlanFixture` matching this shape:

```ts
const recordingPlanFixture = {
  engine: "testreel",
  definition: {
    url: "http://127.0.0.1:3000/",
    viewport: { width: 1280, height: 720 },
    outputSize: { width: 1920, height: 1080 },
    outputFormat: "mp4",
    cursor: { enabled: true, size: 48, rippleSize: 100 },
    chrome: { enabled: true, url: true },
    background: { enabled: true, gradient: { from: "#0f172a", to: "#38bdf8" }, padding: 60, borderRadius: 18 },
    steps: [
      { action: "wait", ms: 500 },
      { action: "click", selector: "[data-testid='start-demo']" },
      { action: "type", selector: "[data-testid='workspace-name']", text: "Fixture workspace" },
      { action: "keyboard", key: "Enter" },
      { action: "screenshot", name: "final" },
    ],
  },
  expectedCheckpoints: [{ id: "hero", label: "Hero", selector: "[data-testid='hero']" }],
} as const;
```

Update direct, OpenCode, and Claude planner mock responses from `{ storyboard, capturePlan }` to `{ storyboard, recordingPlan }`. Add assertions that prompt bodies mention Testreel and do not mention `capturePlan`:

```ts
assert.match(directPrompt, /"recordingPlan"/);
assert.match(directPrompt, /Testreel recording definition/);
assert.doesNotMatch(directPrompt, /"capturePlan"/);
assert.equal(directResult.recordingPlan.definition.outputFormat, "mp4");
```

- [ ] **Step 3: Run demo-assembly planner tests to verify they fail**

Run: `pnpm --filter @tinker/demo-assembly test`

Expected: FAIL because `testreelPlan.ts` does not exist and `AiUrlPlannerResult` still requires `capturePlan`.

- [ ] **Step 4: Implement `testreelPlan.ts`**

Create `packages/demo-assembly/src/testreelPlan.ts` with these exported types and functions:

```ts
import { z } from "zod";
import type { AspectRatio } from "./types.js";

const nonEmptyString = z.string().trim().min(1);
const optionalNonEmptyString = nonEmptyString.optional();
const finiteNumber = z.number().finite();
const viewportSchema = z.object({ width: finiteNumber.positive(), height: finiteNumber.positive() }).strict();
const outputFormatSchema = z.enum(["mp4"]);

const clickStepSchema = z
  .object({ action: z.literal("click"), selector: optionalNonEmptyString, text: optionalNonEmptyString, label: optionalNonEmptyString })
  .strict()
  .refine((step) => step.selector !== undefined || step.text !== undefined, "click step requires selector or text");
const typeStepSchema = z.object({ action: z.literal("type"), selector: nonEmptyString, text: nonEmptyString }).strict();
const fillStepSchema = z.object({ action: z.literal("fill"), selector: nonEmptyString, text: nonEmptyString }).strict();
const keyboardStepSchema = z.object({ action: z.literal("keyboard"), key: nonEmptyString }).strict();
const scrollStepSchema = z
  .object({ action: z.literal("scroll"), x: finiteNumber.optional(), y: finiteNumber.optional(), selector: optionalNonEmptyString })
  .strict()
  .refine((step) => step.x !== undefined || step.y !== undefined || step.selector !== undefined, "scroll step requires x, y, or selector");
const hoverStepSchema = z
  .object({ action: z.literal("hover"), selector: optionalNonEmptyString, text: optionalNonEmptyString })
  .strict()
  .refine((step) => step.selector !== undefined || step.text !== undefined, "hover step requires selector or text");
const waitStepSchema = z.object({ action: z.literal("wait"), ms: finiteNumber.nonnegative().max(30_000) }).strict();
const zoomStepSchema = z
  .object({ action: z.literal("zoom"), selector: optionalNonEmptyString, scale: finiteNumber.positive(), duration: finiteNumber.nonnegative().optional() })
  .strict();
const screenshotStepSchema = z.object({ action: z.literal("screenshot"), name: optionalNonEmptyString }).strict();

export const TestreelStepSchema = z.discriminatedUnion("action", [
  clickStepSchema,
  typeStepSchema,
  fillStepSchema,
  keyboardStepSchema,
  scrollStepSchema,
  hoverStepSchema,
  waitStepSchema,
  zoomStepSchema,
  screenshotStepSchema,
]);

export const TestreelRecordingDefinitionSchema = z
  .object({
    url: nonEmptyString,
    viewport: viewportSchema.optional(),
    outputSize: viewportSchema.optional(),
    outputFormat: outputFormatSchema.default("mp4"),
    speed: finiteNumber.positive().optional(),
    waitForSelector: optionalNonEmptyString,
    cursor: z.union([z.boolean(), z.object({ enabled: z.boolean().optional(), size: finiteNumber.positive().optional(), rippleSize: finiteNumber.nonnegative().optional(), rippleColor: optionalNonEmptyString }).strict()]).optional(),
    chrome: z.union([z.boolean(), z.object({ enabled: z.boolean().optional(), url: z.union([z.boolean(), nonEmptyString]).optional() }).passthrough()]).optional(),
    background: z.union([z.boolean(), z.object({ enabled: z.boolean().optional(), color: optionalNonEmptyString, gradient: z.object({ from: nonEmptyString, to: nonEmptyString }).strict().optional(), padding: finiteNumber.nonnegative().optional(), borderRadius: finiteNumber.nonnegative().optional() }).strict()]).optional(),
    steps: z.array(TestreelStepSchema).min(1).max(80),
  })
  .strict();

export const TestreelGenerationPlanSchema = z
  .object({
    engine: z.literal("testreel"),
    definition: TestreelRecordingDefinitionSchema,
    expectedCheckpoints: z
      .array(z.object({ id: nonEmptyString, label: nonEmptyString, selector: optionalNonEmptyString, text: optionalNonEmptyString }).strict())
      .max(20),
    notes: z.array(nonEmptyString).optional(),
  })
  .strict();

export type TestreelStep = z.infer<typeof TestreelStepSchema>;
export type TestreelRecordingDefinition = z.infer<typeof TestreelRecordingDefinitionSchema>;
export type TestreelGenerationPlan = z.infer<typeof TestreelGenerationPlanSchema>;

function formatZodIssues(error: z.ZodError) {
  return error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).join("; ");
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error("Planner returned malformed Testreel generation plan JSON", { cause: error });
  }
}

function assertNoEnvSubstitution(value: unknown, path: string) {
  if (typeof value === "string" && /(\$\{[A-Za-z_][A-Za-z0-9_]*\}|\$[A-Za-z_][A-Za-z0-9_]*)/.test(value)) {
    throw new Error(`Testreel generation plan is invalid: environment variable substitution is not allowed at ${path}`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoEnvSubstitution(entry, `${path}.${index}`));
  } else if (typeof value === "object" && value !== null) {
    for (const [key, entry] of Object.entries(value)) assertNoEnvSubstitution(entry, `${path}.${key}`);
  }
}

export function parseTestreelGenerationPlanJson(value: string): TestreelGenerationPlan {
  const parsed = parseJson(value);
  assertNoEnvSubstitution(parsed, "recordingPlan");
  const result = TestreelGenerationPlanSchema.safeParse(parsed);
  if (!result.success) throw new Error(`Testreel generation plan is invalid: ${formatZodIssues(result.error)}`);
  return result.data;
}

export function assertTestreelPlanMatchesProductUrl(plan: TestreelGenerationPlan, productUrl: string) {
  const expectedOrigin = new URL(productUrl).origin;
  const actualUrl = new URL(plan.definition.url);
  if (actualUrl.origin !== expectedOrigin) {
    throw new Error("Testreel generation plan is invalid: recording URL must stay on product origin");
  }
}

export function viewportForAspectRatio(aspectRatio: AspectRatio) {
  switch (aspectRatio) {
    case "9:16":
      return { width: 720, height: 1280 };
    case "1:1":
      return { width: 1080, height: 1080 };
    case "16:9":
      return { width: 1280, height: 720 };
  }
}

export function outputSizeForAspectRatio(aspectRatio: AspectRatio) {
  switch (aspectRatio) {
    case "9:16":
      return { width: 1080, height: 1920 };
    case "1:1":
      return { width: 1080, height: 1080 };
    case "16:9":
      return { width: 1920, height: 1080 };
  }
}

export function createFixtureTestreelGenerationPlan(input: { productUrl: string; aspectRatio: AspectRatio; title: string }): TestreelGenerationPlan {
  return TestreelGenerationPlanSchema.parse({
    engine: "testreel",
    definition: {
      url: input.productUrl,
      viewport: viewportForAspectRatio(input.aspectRatio),
      outputSize: outputSizeForAspectRatio(input.aspectRatio),
      outputFormat: "mp4",
      cursor: { enabled: true, size: 48, rippleSize: 100 },
      chrome: { enabled: true, url: true },
      background: { enabled: true, gradient: { from: "#0f172a", to: "#38bdf8" }, padding: 60, borderRadius: 18 },
      steps: [
        { action: "wait", ms: 500 },
        { action: "screenshot", name: "hero" },
        { action: "scroll", y: 720 },
        { action: "wait", ms: 300 },
        { action: "screenshot", name: "final" },
      ],
    },
    expectedCheckpoints: [{ id: "final-screen", label: `${input.title} final screen`, selector: "body" }],
    notes: ["Fixture Testreel plan uses safe wait, screenshot, and scroll actions."],
  });
}
```

- [ ] **Step 5: Update `aiPlanning.ts` to parse and prompt for `recordingPlan`**

Make these exact type-level changes:

```ts
import {
  assertTestreelPlanMatchesProductUrl,
  createFixtureTestreelGenerationPlan,
  parseTestreelGenerationPlanJson,
  type TestreelGenerationPlan,
} from "./testreelPlan.js";

export type AiUrlPlannerResult = {
  storyboard: ManualStoryboard;
  recordingPlan: TestreelGenerationPlan;
};
```

Update `findLastPlannerJsonObject` to look for `storyboard` and `recordingPlan`:

```ts
if (isRecord(object) && object.storyboard !== undefined && object.recordingPlan !== undefined) {
  lastPlannerObject = object;
  break;
}
```

Update `parsePlannerResult`:

```ts
function parsePlannerResult(responseBody: unknown): AiUrlPlannerResult {
  const payload = extractPlannerPayload(responseBody);
  if (!isRecord(payload)) throw new Error("Planner response must contain storyboard and recordingPlan");
  return {
    storyboard: parseStoryboardJson(plannerValueToJson(payload.storyboard, "storyboard")),
    recordingPlan: parseTestreelGenerationPlanJson(plannerValueToJson(payload.recordingPlan, "recordingPlan")),
  };
}
```

Update environment, OpenCode, and Claude planner validation:

```ts
assertStoryboardMatchesInput(result.storyboard, input);
assertTestreelPlanMatchesProductUrl(result.recordingPlan, input.productUrl);
```

Replace old prompt shape language with Testreel language:

```ts
task: "Create strict JSON for an evidence-grounded storyboard and Testreel recording plan.",
instructions: [
  "Return one JSON object only with top-level keys storyboard and recordingPlan.",
  strategyDrivenInstruction,
  "The recordingPlan.definition must be a native Testreel recording definition using action keys, not Tinker CapturePlan type keys.",
  "Use Testreel actions wait, click, type, fill, keyboard, scroll, hover, zoom, and screenshot.",
  "Set recordingPlan.engine to testreel, definition.outputFormat to mp4, cursor enabled, chrome enabled, and background enabled.",
  "Do not use environment-variable substitution such as ${VAR} or $VAR in generated definitions; emit concrete values.",
  "Avoid auth, payments, destructive actions, private data, account creation, downloads, extensions, and external navigation.",
]
```

Set `exactTopLevelShape.recordingPlan` to the wrapper described in the approved spec. Remove `parseCapturePlanJson` exports from `aiPlanning.ts` and `index.ts` once all tests are updated.

- [ ] **Step 6: Update the fixture planner**

Change `createFixtureAiUrlPlanner()` to return `recordingPlan`:

```ts
export function createFixtureAiUrlPlanner(): AiUrlPlanner {
  return async (input) => ({
    storyboard: {
      title: input.analysis.title,
      durationCapSeconds: input.durationCapSeconds,
      aspectRatio: input.aspectRatio,
      beats: [
        { id: "hook", type: "hook", goal: input.analysis.headings[0] ?? input.prompt, startHint: 0, endHint: Math.min(3, input.durationCapSeconds) },
        { id: "screen-capture", type: "screen_capture", goal: input.analysis.bodySnippets[0] ?? "Show the product workflow.", startHint: Math.min(3, input.durationCapSeconds), endHint: Math.max(Math.min(input.durationCapSeconds - 2, input.durationCapSeconds), 0) },
        { id: "cta", type: "cta", goal: `Export a polished demo for ${input.analysis.title}.`, startHint: Math.max(input.durationCapSeconds - 2, 0), endHint: input.durationCapSeconds },
      ],
    },
    recordingPlan: createFixtureTestreelGenerationPlan({ productUrl: input.productUrl, aspectRatio: input.aspectRatio, title: input.analysis.title }),
  });
}
```

- [ ] **Step 7: Run planner tests to verify they pass**

Run: `pnpm --filter @tinker/demo-assembly test`

Expected: PASS through `testreelPlan.test.ts` and `aiPlanning.test.ts`, while later run-level tests may still fail until orchestration changes land.

- [ ] **Step 8: Commit planner contract changes**

Run:

```bash
git add packages/demo-assembly/src/testreelPlan.ts packages/demo-assembly/src/testreelPlan.test.ts packages/demo-assembly/src/aiPlanning.ts packages/demo-assembly/src/aiPlanning.test.ts packages/demo-assembly/src/index.ts packages/demo-assembly/package.json
git commit -m "feat: emit Testreel recording plans"
```

---

### Task 3: Testreel CLI Runner

**Files:**
- Create: `packages/demo-assembly/src/testreelRunner.ts`
- Create: `packages/demo-assembly/src/testreelRunner.test.ts`
- Modify: `packages/demo-assembly/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `TestreelGenerationPlan`.
- Produces:
  - `runTestreelRecording(input: RunTestreelRecordingInput): Promise<RunTestreelRecordingResult>`
  - `createSpawnedTestreelCliRunner(command: SpawnedTestreelCliCommand): RunTestreelCli`
  - `RunTestreelRecordingResult.finalVideoPath` always points at `testreel/final.mp4`.

- [ ] **Step 1: Add local dependencies**

Run:

```bash
pnpm --filter @tinker/demo-assembly add testreel@0.2.0 playwright-core@^1.58.2
```

Expected: `packages/demo-assembly/package.json` and `pnpm-lock.yaml` update. `testreel` is in `dependencies`, not a global install requirement.

- [ ] **Step 2: Write failing runner tests**

Create `packages/demo-assembly/src/testreelRunner.test.ts` with tests that verify the runner writes files, invokes validation, invokes recording with `--format mp4`, copies the final MP4, fails on missing MP4, and aborts process groups. Use this core fake-runner test:

```ts
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSpawnedTestreelCliRunner, runTestreelRecording, type RunTestreelCli } from "./testreelRunner.js";
import type { TestreelGenerationPlan } from "./testreelPlan.js";

const outputRoot = await mkdtemp(join(tmpdir(), "tinker-testreel-runner-"));
const plan: TestreelGenerationPlan = {
  engine: "testreel",
  definition: {
    url: "https://example.com",
    viewport: { width: 1280, height: 720 },
    outputSize: { width: 1920, height: 1080 },
    outputFormat: "mp4",
    cursor: { enabled: true },
    chrome: { enabled: true, url: true },
    background: { enabled: true, gradient: { from: "#0f172a", to: "#38bdf8" } },
    steps: [{ action: "wait", ms: 1 }, { action: "screenshot", name: "final" }],
  },
  expectedCheckpoints: [{ id: "final", label: "Final", selector: "body" }],
};

const calls: string[][] = [];
const fakeRunCli: RunTestreelCli = async (args) => {
  calls.push(args);
  if (args[0] === "validate") return { stdout: "validated", stderr: "" };
  const outputFlagIndex = args.indexOf("--output");
  const outputDir = args[outputFlagIndex + 1];
  if (outputDir === undefined) throw new Error("missing output dir");
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, "output.json"), JSON.stringify({ ok: true }));
  await writeFile(join(outputDir, "final-shot.png"), "png");
  await writeFile(join(outputDir, "recording.mp4"), "mp4");
  return { stdout: "recorded", stderr: "" };
};

const result = await runTestreelRecording({ testreelRoot: outputRoot, plan, runCli: fakeRunCli });
assert.deepEqual(calls[0], ["validate", join(outputRoot, "recording.json"), "--quiet"]);
assert.deepEqual(calls[1], [join(outputRoot, "recording.json"), "--output", join(outputRoot, "output"), "--format", "mp4", "--clean", "--quiet"]);
assert.equal(await readFile(join(outputRoot, "recording-plan.json"), "utf8").then((v) => JSON.parse(v).engine), "testreel");
assert.equal(await readFile(join(outputRoot, "recording.json"), "utf8").then((v) => JSON.parse(v).outputFormat), "mp4");
assert.equal(result.finalVideoPath, join(outputRoot, "final.mp4"));
assert.equal(existsSync(result.finalVideoPath), true);
assert.equal(result.manifestPath, join(outputRoot, "output", "output.json"));
assert.deepEqual(result.screenshotPaths, [join(outputRoot, "output", "final-shot.png")]);
assert.ok(result.artifactPaths.includes(join(outputRoot, "recording-plan.json")));
assert.ok(result.artifactPaths.includes(join(outputRoot, "recording.json")));
assert.ok(result.artifactPaths.includes(join(outputRoot, "final.mp4")));
```

Add a missing-MP4 assertion:

```ts
await assert.rejects(
  () =>
    runTestreelRecording({
      testreelRoot: await mkdtemp(join(tmpdir(), "tinker-testreel-runner-missing-mp4-")),
      plan,
      runCli: async (args) => {
        if (args[0] !== "validate") await mkdir(args[args.indexOf("--output") + 1]!, { recursive: true });
        return { stdout: "", stderr: "" };
      },
    }),
  /Testreel completed without producing an MP4/,
);
```

Add the process-group cancellation test on non-Windows:

```ts
if (process.platform !== "win32") {
  const root = await mkdtemp(join(tmpdir(), "tinker-testreel-runner-abort-"));
  const fakeCliPath = join(root, "fake-testreel-cli.cjs");
  const startedPath = join(root, "started.txt");
  const sigtermPath = join(root, "sigterm.txt");
  await writeFile(
    fakeCliPath,
    [
      "#!/usr/bin/env node",
      "const { writeFileSync } = require('node:fs');",
      "const { join } = require('node:path');",
      `writeFileSync(${JSON.stringify(startedPath)}, 'started');`,
      `process.on('SIGTERM', () => { writeFileSync(${JSON.stringify(sigtermPath)}, 'SIGTERM'); process.exit(0); });`,
      "setInterval(() => {}, 1000);",
    ].join("\n"),
  );
  await chmod(fakeCliPath, 0o755);
  const controller = new AbortController();
  const runCli = createSpawnedTestreelCliRunner({ command: process.execPath, argsPrefix: [fakeCliPath], cwd: root });
  const aborted = runCli(["validate", "recording.json", "--quiet"], { signal: controller.signal });
  while (!existsSync(startedPath)) await new Promise((resolve) => setTimeout(resolve, 20));
  controller.abort();
  await assert.rejects(aborted, { name: "AbortError" });
  assert.equal(await readFile(sigtermPath, "utf8"), "SIGTERM");
}

console.log("testreel runner tests passed");
```

Add `tsx src/testreelRunner.test.ts` to the package test script immediately after `tsx src/testreelPlan.test.ts`.

- [ ] **Step 3: Run runner tests to verify they fail**

Run: `pnpm --filter @tinker/demo-assembly test`

Expected: FAIL because `testreelRunner.ts` does not exist.

- [ ] **Step 4: Implement `testreelRunner.ts`**

Create `packages/demo-assembly/src/testreelRunner.ts` with this public surface:

```ts
import { spawn } from "node:child_process";
import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { TestreelGenerationPlan } from "./testreelPlan.js";

export type RunTestreelCli = (args: string[], options?: { signal?: AbortSignal }) => Promise<{ stdout: string; stderr: string }>;
export type SpawnedTestreelCliCommand = { command: string; argsPrefix: string[]; cwd: string };
export type RunTestreelRecordingInput = {
  testreelRoot: string;
  plan: TestreelGenerationPlan;
  signal?: AbortSignal;
  runCli?: RunTestreelCli;
  onPhase?: (phase: "verification" | "capture" | "assembly") => void;
};
export type RunTestreelRecordingResult = {
  recordingPlanPath: string;
  recordingPath: string;
  outputDirectory: string;
  finalVideoPath: string;
  manifestPath?: string;
  screenshotPaths: string[];
  artifactPaths: string[];
  stdout: string;
  stderr: string;
};
```

Implement these behaviors:

```ts
function toPrettyJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function resolveTestreelCliPath() {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve("testreel")), "cli.cjs");
}

function defaultTestreelCli(): RunTestreelCli {
  return createSpawnedTestreelCliRunner({ command: process.execPath, argsPrefix: [resolveTestreelCliPath()], cwd: process.cwd() });
}

function abortError() {
  return new DOMException("Testreel recording aborted.", "AbortError");
}

function trimProcessError(stderr: string) {
  return stderr.replace(/\s+/g, " ").trim().slice(0, 500);
}
```

Use process-group cancellation inside `createSpawnedTestreelCliRunner` by spawning with `detached: process.platform !== "win32"`, killing `-child.pid` on non-Windows, and falling back to `child.kill(signal)`. Reject with `AbortError` when the input signal aborts. If the child exits non-zero, throw `Testreel failed with exit code <code>: <trimmed stderr>`.

Use a recursive file collector for MP4/PNG discovery:

```ts
async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}
```

Select and copy the MP4:

```ts
async function selectMp4(outputDirectory: string) {
  const files = await listFiles(outputDirectory);
  const mp4s = files.filter((file) => file.toLowerCase().endsWith(".mp4"));
  if (mp4s.length === 0) throw new Error("Testreel completed without producing an MP4");
  const withStats = await Promise.all(mp4s.map(async (path) => ({ path, stat: await stat(path) })));
  withStats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs || a.path.localeCompare(b.path));
  return withStats[0]!.path;
}
```

Make `runTestreelRecording` do exactly this:

```ts
export async function runTestreelRecording(input: RunTestreelRecordingInput): Promise<RunTestreelRecordingResult> {
  const runCli = input.runCli ?? defaultTestreelCli();
  const recordingPlanPath = join(input.testreelRoot, "recording-plan.json");
  const recordingPath = join(input.testreelRoot, "recording.json");
  const outputDirectory = join(input.testreelRoot, "output");
  const finalVideoPath = join(input.testreelRoot, "final.mp4");
  await mkdir(input.testreelRoot, { recursive: true });
  await writeFile(recordingPlanPath, toPrettyJson(input.plan));
  await writeFile(recordingPath, toPrettyJson(input.plan.definition));

  input.onPhase?.("verification");
  const validation = await runCli(["validate", recordingPath, "--quiet"], { signal: input.signal });

  input.onPhase?.("capture");
  const recording = await runCli([recordingPath, "--output", outputDirectory, "--format", "mp4", "--clean", "--quiet"], { signal: input.signal });

  input.onPhase?.("assembly");
  const selectedMp4 = await selectMp4(outputDirectory);
  if (selectedMp4 !== finalVideoPath) await copyFile(selectedMp4, finalVideoPath);
  const files = await listFiles(outputDirectory);
  const manifestPath = files.find((file) => file.endsWith("output.json"));
  const screenshotPaths = files.filter((file) => file.toLowerCase().endsWith(".png"));
  const artifactPaths = [recordingPlanPath, recordingPath, ...(manifestPath ? [manifestPath] : []), ...screenshotPaths, finalVideoPath];

  return {
    recordingPlanPath,
    recordingPath,
    outputDirectory,
    finalVideoPath,
    ...(manifestPath ? { manifestPath } : {}),
    screenshotPaths,
    artifactPaths,
    stdout: [validation.stdout, recording.stdout].filter(Boolean).join("\n"),
    stderr: [validation.stderr, recording.stderr].filter(Boolean).join("\n"),
  };
}
```

- [ ] **Step 5: Run runner tests to verify they pass**

Run: `pnpm --filter @tinker/demo-assembly test`

Expected: PASS for `testreelRunner.test.ts`; run-level tests still need updates in Task 4.

- [ ] **Step 6: Commit the runner**

Run:

```bash
git add packages/demo-assembly/src/testreelRunner.ts packages/demo-assembly/src/testreelRunner.test.ts packages/demo-assembly/package.json pnpm-lock.yaml
git commit -m "feat: add Testreel CLI runner"
```

---

### Task 4: AI URL Orchestration Uses Testreel

**Files:**
- Modify: `packages/demo-assembly/src/runAiUrlDemo.ts`
- Modify: `packages/demo-assembly/src/runAiUrlDemo.test.ts`
- Modify: `packages/demo-assembly/src/runSummary.ts`
- Modify: `packages/demo-assembly/src/runSummary.test.ts`
- Modify: `packages/demo-assembly/src/coreCoverage.ts`
- Modify: `packages/demo-assembly/src/coreCoverage.test.ts`
- Modify: `packages/demo-assembly/src/localGenerationJob.ts`
- Modify: `packages/demo-assembly/src/localGenerationJob.test.ts`
- Modify: `packages/demo-assembly/scripts/generateAiUrlJob.ts`

**Interfaces:**
- Consumes: `AiUrlPlannerResult.recordingPlan` and `runTestreelRecording`.
- Produces:
  - `RunAiUrlDemoResult.renderer: "testreel"`
  - `RunAiUrlDemoResult.publishedVideoPath: string`
  - `RunAiUrlDemoResult.rendererResults.testreel`
  - `RunAiUrlDemoPipeline.finalVideoPath` pointing to `testreel/final.mp4`
  - `run-summary.json.execution.finalVideoMode: "testreel"`

- [ ] **Step 1: Update run-level tests first**

In `packages/demo-assembly/src/runAiUrlDemo.test.ts`, replace `CapturePlan` and `CaptureResult` fixtures with a `recordingPlan` and a fake Testreel runner result:

```ts
import type { TestreelGenerationPlan } from "./testreelPlan.js";
import type { RunTestreelRecordingResult } from "./testreelRunner.js";

const recordingPlan: TestreelGenerationPlan = {
  engine: "testreel",
  definition: {
    url: canonicalProductUrl,
    viewport: { width: 1280, height: 720 },
    outputSize: { width: 1920, height: 1080 },
    outputFormat: "mp4",
    cursor: { enabled: true },
    chrome: { enabled: true, url: true },
    background: { enabled: true, gradient: { from: "#0f172a", to: "#38bdf8" } },
    steps: [{ action: "wait", ms: 500 }, { action: "screenshot", name: "final" }],
  },
  expectedCheckpoints: [{ id: "hero", label: "Hero", selector: "[data-testid='hero']" }],
};

async function fakeRunTestreel(testreelRoot: string): Promise<RunTestreelRecordingResult> {
  const recordingPlanPath = join(testreelRoot, "recording-plan.json");
  const recordingPath = join(testreelRoot, "recording.json");
  const outputDirectory = join(testreelRoot, "output");
  const manifestPath = join(outputDirectory, "output.json");
  const screenshotPath = join(outputDirectory, "final.png");
  const finalVideoPath = join(testreelRoot, "final.mp4");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(recordingPlanPath, JSON.stringify(recordingPlan, null, 2));
  await writeFile(recordingPath, JSON.stringify(recordingPlan.definition, null, 2));
  await writeFile(manifestPath, "{}\n");
  await writeFile(screenshotPath, "png");
  await writeFile(finalVideoPath, "mp4");
  return {
    recordingPlanPath,
    recordingPath,
    outputDirectory,
    finalVideoPath,
    manifestPath,
    screenshotPaths: [screenshotPath],
    artifactPaths: [recordingPlanPath, recordingPath, manifestPath, screenshotPath, finalVideoPath],
    stdout: "",
    stderr: "",
  };
}
```

Add a `runTestreel` seam to `RunAiUrlDemoInput` tests and assert:

```ts
assert.deepEqual(phases, ["analysis", "understanding", "strategy", "planning", "verification", "capture", "assembly"]);
assert.equal(result.renderer, "testreel");
assert.equal(result.publishedVideoPath, join(outputRoot, "testreel", "final.mp4"));
assert.equal(result.rendererResults.testreel.finalVideoPath, join(outputRoot, "testreel", "final.mp4"));
assert.equal(existsSync(join(outputRoot, "playwright", "demo-project.json")), false);
assert.equal(existsSync(join(outputRoot, "testreel", "recording-plan.json")), true);
assert.equal(existsSync(join(outputRoot, "testreel", "recording.json")), true);
assert.equal(existsSync(join(outputRoot, "testreel", "final.mp4")), true);
assert.ok(result.artifactPaths.includes(join(outputRoot, "testreel", "final.mp4")));
```

Update local job tests to expect `publishedVideoPath` as the completion artifact:

```ts
expect(result.publishedVideoPath).toBe(join(outputRoot, "testreel", "final.mp4"));
expect(progressEvents.at(-1)?.artifactPath).toBe(join(outputRoot, "testreel", "final.mp4"));
```

- [ ] **Step 2: Run demo-assembly tests to verify they fail**

Run: `pnpm --filter @tinker/demo-assembly test`

Expected: FAIL because orchestration and local job types still require Playwright project/capture paths.

- [ ] **Step 3: Refactor `runSummary.ts` for Testreel execution metadata**

Replace Playwright-specific execution schemas with:

```ts
const RendererSchema = z.literal("testreel");
const ExecutionModeSchema = z.enum(["claude-code", "opencode", "deterministic-fallback", "deterministic"]);
const PlannerModeSchema = z.enum(["claude-code", "opencode"]);
const FinalVideoModeSchema = z.enum(["testreel", "none"]);
const FinalVideoSourceSchema = z.enum(["testreel-cli", "none"]);

export const RunExecutionSchema = z
  .object({
    understandingMode: ExecutionModeSchema,
    strategyMode: ExecutionModeSchema,
    plannerMode: PlannerModeSchema,
    finalVideoMode: FinalVideoModeSchema,
    finalVideoSource: FinalVideoSourceSchema,
    checkpointMode: z.literal("planner-declared"),
    notes: z.array(z.string()),
  })
  .strict();
```

Update `buildRunSummary` evidence from Playwright files to Testreel files:

```ts
const beatEvidence = args.captureSucceeded
  ? [
      ...(args.finalVideoProduced ? ["testreel/final.mp4"] : []),
      "testreel/recording-plan.json",
      "testreel/recording.json",
    ].filter((candidate) => generatedArtifacts.some((artifact) => artifact.endsWith(candidate)))
  : [];
```

Set success when `args.execution.finalVideoMode === "testreel"` and `finalVideoProduced` is true.

- [ ] **Step 4: Remove browser-capture type imports from `coreCoverage.ts`**

Replace external types with local minimal types:

```ts
export type CoreActionTrace = { actions: Array<{ type: string; beatId?: string }> };
export type CoreCaptureLineage = { steps: Array<{ beatId?: string }> };

export type BuildCoreCoverageInput = {
  strategy: DemoStrategy;
  storyboard: Storyboard;
  actionTrace?: CoreActionTrace;
  captureLineage?: CoreCaptureLineage;
  finalVideoProduced: boolean;
  finalVideoRef?: string;
};
```

Use `const finalVideoRef = input.finalVideoRef ?? "testreel/final.mp4";` and push `finalVideoRef` in `refsFor`. This keeps coverage honest as storyboard/final-video evidence when no action trace exists.

- [ ] **Step 5: Replace the active renderer body in `runAiUrlDemo.ts`**

Remove imports from `@tinker/browser-capture`, `@tinker/rendering/node`, `@tinker/project-schema`, `compileProject`, `captureLineage`, `editDecisionList`, `directorPlan`, and `applyEditDecisionList`. Add:

```ts
import { runTestreelRecording, type RunTestreelRecordingResult } from "./testreelRunner.js";
```

Change input seams:

```ts
type RunTestreelDependency = (options: {
  testreelRoot: string;
  plan: AiUrlPlannerResult["recordingPlan"];
  signal?: AbortSignal;
  onPhase?: (phase: "verification" | "capture" | "assembly") => void;
}) => Promise<RunTestreelRecordingResult>;

export type RunAiUrlDemoInput = {
  // existing fields
  runTestreel?: RunTestreelDependency;
};
```

Change result type:

```ts
export type RunAiUrlDemoResult = {
  renderer: "testreel";
  rendererResults: {
    testreel: {
      recordingPlanPath: string;
      recordingPath: string;
      outputDirectory: string;
      finalVideoPath: string;
      manifestPath?: string;
      screenshotPaths: string[];
    };
  };
  publishedVideoPath: string;
  outputRoot: string;
  artifactPaths: string[];
  pipeline: RunAiUrlDemoPipeline;
};
```

After strategy/storyboard, run the planner and Testreel path directly:

```ts
const testreelRoot = join(input.outputRoot, "testreel");
const runTestreel = input.runTestreel ?? ((options) => runTestreelRecording(options));

input.onPhase?.("planning");
const plannerResult = await planner({
  productUrl: analysis.url,
  prompt,
  durationCapSeconds: input.durationCapSeconds,
  aspectRatio: input.aspectRatio,
  analysis,
  demoStrategy: strategy,
  storyboard: strategyStoryboard,
  ...(repoAnalysis === undefined ? {} : { repoAnalysis, repoCheckoutDirectory }),
  ...(narrativeExploration === undefined ? {} : { narrativeExploration }),
  ...(input.signal === undefined ? {} : { signal: input.signal }),
});

const recordingResult = await runTestreel({
  testreelRoot,
  plan: plannerResult.recordingPlan,
  ...(input.signal === undefined ? {} : { signal: input.signal }),
  onPhase: (phase) => input.onPhase?.(phase),
});
```

Build artifact paths and summary:

```ts
const runSummaryPath = join(input.outputRoot, "run-summary.json");
const artifactPaths = mergeArtifactPaths(
  pipelineArtifactPaths,
  [productAnalysisPath, ...(repoAnalysisPath ? [repoAnalysisPath] : []), ...(narrativeExplorationPath ? [narrativeExplorationPath] : []), ...(analysis.screenshotPath ? [analysis.screenshotPath] : [])],
  recordingResult.artifactPaths,
  [runSummaryPath],
);

const execution: RunExecution = {
  understandingMode: phaseMode(understanding.warnings, UNDERSTANDING_FALLBACK_WARNINGS),
  strategyMode: phaseMode(strategy.warnings, [STRATEGY_FALLBACK_WARNING]),
  plannerMode: backend === "claude-code" ? "claude-code" : "opencode",
  finalVideoMode: "testreel",
  finalVideoSource: "testreel-cli",
  checkpointMode: "planner-declared",
  notes: ["Testreel produced the published MP4; checkpoints are planner-declared unless enforced by Testreel wait steps."],
};

const coverage = buildCoreCoverage({
  strategy,
  storyboard: strategyStoryboard,
  finalVideoProduced: true,
  finalVideoRef: "testreel/final.mp4",
});
```

Return the Testreel result:

```ts
return {
  renderer: "testreel",
  publishedVideoPath: recordingResult.finalVideoPath,
  outputRoot: input.outputRoot,
  artifactPaths,
  rendererResults: {
    testreel: {
      recordingPlanPath: recordingResult.recordingPlanPath,
      recordingPath: recordingResult.recordingPath,
      outputDirectory: recordingResult.outputDirectory,
      finalVideoPath: recordingResult.finalVideoPath,
      ...(recordingResult.manifestPath ? { manifestPath: recordingResult.manifestPath } : {}),
      screenshotPaths: recordingResult.screenshotPaths,
    },
  },
  pipeline,
};
```

- [ ] **Step 6: Update `localGenerationJob.ts`**

Build `GenerationResultSchema` with `publishedVideoPath`, not `projectPath`:

```ts
const result = GenerationResultSchema.parse({
  jobId,
  status: "completed",
  publishedVideoPath: demoResult.publishedVideoPath,
  outputDirectory,
  artifactPaths: demoResult.artifactPaths,
  renderer: demoResult.renderer,
  rendererResults: demoResult.rendererResults,
});

emit("completed", "Generation job completed", result.publishedVideoPath);
```

Remove the guard that throws when `projectPath` is absent.

- [ ] **Step 7: Update `generateAiUrlJob.ts`**

Update `packagesToBuild` so it no longer builds the old capture/render-only dependencies for this script:

```ts
const packagesToBuild = [
  "@tinker/generation-contract",
  "@tinker/project-schema",
  "@tinker/product-analysis",
  "@tinker/demo-assembly",
] as const;
```

Update the printed paths:

```ts
const finalMp4 = at("testreel", "final.mp4");
console.log(`recording-plan       : ${at("testreel", "recording-plan.json")}`);
console.log(`recording            : ${at("testreel", "recording.json")}`);
console.log(`testreel manifest    : ${at("testreel", "output", "output.json")}`);
console.log(`final.mp4            : ${existsSync(finalMp4) ? finalMp4 : "(not produced)"}`);
```

- [ ] **Step 8: Run demo-assembly tests to verify they pass**

Run: `pnpm --filter @tinker/demo-assembly test`

Expected: PASS with Testreel artifacts, no `playwright/demo-project.json` requirement, and local generation completion artifact set to `testreel/final.mp4`.

- [ ] **Step 9: Commit orchestration changes**

Run:

```bash
git add packages/demo-assembly/src/runAiUrlDemo.ts packages/demo-assembly/src/runAiUrlDemo.test.ts packages/demo-assembly/src/runSummary.ts packages/demo-assembly/src/runSummary.test.ts packages/demo-assembly/src/coreCoverage.ts packages/demo-assembly/src/coreCoverage.test.ts packages/demo-assembly/src/localGenerationJob.ts packages/demo-assembly/src/localGenerationJob.test.ts packages/demo-assembly/scripts/generateAiUrlJob.ts
git commit -m "feat: run AI URL generation through Testreel"
```

---

### Task 5: API Artifact Index And Worker Result

**Files:**
- Modify: `apps/api/src/jobs/artifactIndex.ts`
- Modify: `apps/api/src/jobs/artifactIndex.test.ts`
- Modify: `apps/api/src/workers/apiGenerationResult.ts`
- Modify: `apps/api/src/workers/generationWorker.ts` only if types require it.
- Modify: `apps/api/src/workers/generationWorker.cancel.test.ts`
- Modify: `apps/api/src/jobs/jobStore.test.ts`
- Modify: `apps/api/src/server.test.ts`

**Interfaces:**
- Consumes: `ManualFixtureGenerationResult.renderer: "testreel"` and Testreel artifact paths.
- Produces: completed API jobs with `result.method: "testreel"`, no `project`, and a served `published-video` artifact.

- [ ] **Step 1: Write failing API tests**

Replace Playwright fixture helpers in `apps/api/src/server.test.ts` with Testreel helpers:

```ts
async function writeTestreelArtifacts(outputRoot: string) {
  const testreelRoot = join(outputRoot, "testreel");
  const outputDirectory = join(testreelRoot, "output");
  const recordingPlanPath = join(testreelRoot, "recording-plan.json");
  const recordingPath = join(testreelRoot, "recording.json");
  const manifestPath = join(outputDirectory, "output.json");
  const screenshotPath = join(outputDirectory, "final.png");
  const finalVideoPath = join(testreelRoot, "final.mp4");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(recordingPlanPath, JSON.stringify({ engine: "testreel" }));
  await writeFile(recordingPath, JSON.stringify({ url: "https://example.com", steps: [{ action: "wait", ms: 1 }] }));
  await writeFile(manifestPath, "{}\n");
  await writeFile(screenshotPath, "png");
  await writeFile(finalVideoPath, "video");
  return { recordingPlanPath, recordingPath, outputDirectory, manifestPath, screenshotPath, finalVideoPath, artifactPaths: [recordingPlanPath, recordingPath, manifestPath, screenshotPath, finalVideoPath] };
}

function testreelManualResult(jobId: string, outputRoot: string, paths: Awaited<ReturnType<typeof writeTestreelArtifacts>>): ManualFixtureGenerationResult {
  return {
    jobId,
    status: "completed",
    publishedVideoPath: paths.finalVideoPath,
    outputDirectory: outputRoot,
    artifactPaths: paths.artifactPaths,
    renderer: "testreel",
    rendererResults: {
      testreel: {
        recordingPlanPath: paths.recordingPlanPath,
        recordingPath: paths.recordingPath,
        outputDirectory: paths.outputDirectory,
        finalVideoPath: paths.finalVideoPath,
        manifestPath: paths.manifestPath,
        screenshotPaths: [paths.screenshotPath],
      },
    },
  };
}
```

Update route assertions:

```ts
expect(JSON.parse(getResponse.body)).toMatchObject({
  id: "job-test",
  status: "completed",
  request: { id: "job-test" },
  result: {
    method: "testreel",
    artifacts: [
      { kind: "testreel-recording-plan", relativePath: "testreel/recording-plan.json" },
      { kind: "testreel-recording-definition", relativePath: "testreel/recording.json" },
      { kind: "testreel-manifest", relativePath: "testreel/output/output.json" },
      { kind: "testreel-screenshot", relativePath: "testreel/output/final.png" },
      { kind: "published-video", relativePath: "testreel/final.mp4" },
    ],
  },
});
```

Update artifact route test to request `/api/jobs/job-test/artifacts/testreel/final.mp4` and assert `video/mp4`.

- [ ] **Step 2: Run API tests to verify they fail**

Run: `pnpm --filter @tinker/api test`

Expected: FAIL because artifact indexing and API result building still require `playwright-demo-project`.

- [ ] **Step 3: Update artifact classification**

In `apps/api/src/jobs/artifactIndex.ts`, replace Playwright classifications with:

```ts
function classifyArtifact(relativePath: string): ApiArtifactKind {
  if (relativePath === "product-analysis.json") return "product-analysis";
  if (relativePath === "product-analysis.png") return "product-analysis-screenshot";
  if (relativePath === "repo-analysis.json") return "repo-analysis";
  if (relativePath === "testreel/final.mp4") return "published-video";
  if (relativePath === "testreel/recording-plan.json") return "testreel-recording-plan";
  if (relativePath === "testreel/recording.json") return "testreel-recording-definition";
  if (relativePath === "testreel/output/output.json") return "testreel-manifest";
  if (relativePath.startsWith("testreel/output/") && relativePath.endsWith(".png")) return "testreel-screenshot";
  return "other";
}
```

Keep `mediaTypeForPath` unchanged because it already covers MP4, JSON, PNG, logs, and text.

- [ ] **Step 4: Update API result conversion**

In `apps/api/src/workers/apiGenerationResult.ts`, remove `DemoProjectSchema` and `readDemoProject`. Build a Testreel API result:

```ts
export async function buildApiGenerationResult(input: BuildApiGenerationResultInput): Promise<ApiGenerationResult> {
  const artifacts = indexArtifacts({
    jobId: input.jobId,
    outputRoot: input.outputRoot,
    artifactPaths: input.generationResult.artifactPaths,
  });

  if (input.generationResult.renderer !== "testreel") {
    throw new Error(`Unsupported API renderer: ${String(input.generationResult.renderer)}`);
  }

  requireArtifact(artifacts, "published-video");
  return { method: "testreel", artifacts, warnings: [] };
}
```

- [ ] **Step 5: Run API tests to verify they pass**

Run: `pnpm --filter @tinker/api test`

Expected: PASS. The API serves only listed Testreel artifacts and rejects traversal paths exactly as before.

- [ ] **Step 6: Commit API changes**

Run:

```bash
git add apps/api/src/jobs/artifactIndex.ts apps/api/src/jobs/artifactIndex.test.ts apps/api/src/workers/apiGenerationResult.ts apps/api/src/workers/generationWorker.ts apps/api/src/workers/generationWorker.cancel.test.ts apps/api/src/jobs/jobStore.test.ts apps/api/src/server.test.ts
git commit -m "feat: expose Testreel published video artifacts"
```

---

### Task 6: Web Preview Uses Published Video

**Files:**
- Modify: `apps/web/src/lib/compositionGenerationClient.ts`
- Modify: `apps/web/src/lib/compositionGenerationClient.test.ts`
- Modify: `apps/web/src/lib/httpCompositionGenerationClient.test.ts`
- Modify: `apps/web/src/lib/useCompositionGenerationJob.test.ts`
- Modify: `apps/web/src/screens/CompositionEditor/CompositionDemoScreen.tsx`
- Modify: `apps/web/src/screens/CompositionEditor/CompositionDemoScreen.test.tsx`
- Modify: `apps/web/src/screens/CompositionEditor/CompositionEditorScreen.test.tsx`
- Modify: `apps/web/src/App.test.tsx`

**Interfaces:**
- Consumes: `ApiGenerationJob.result.artifacts` with `published-video`.
- Produces: standalone video preview/export using the Testreel MP4 artifact URL.

- [ ] **Step 1: Write failing web tests**

Update web fixture jobs so completed jobs look like:

```ts
const publishedVideoArtifact = {
  kind: "published-video" as const,
  relativePath: "testreel/final.mp4",
  url: "/api/jobs/job-1/artifacts/testreel/final.mp4",
  mediaType: "video/mp4",
};

result: {
  method: "testreel",
  artifacts: [publishedVideoArtifact],
  warnings: [],
}
```

In `apps/web/src/lib/compositionGenerationClient.test.ts`, assert a primary video helper:

```ts
expect(selectArtifactUrl(completed, "published-video")).toBe("/api/jobs/job-1/artifacts/testreel/final.mp4");
expect(selectPrimaryVideoArtifact(completed)?.kind).toBe("published-video");
```

In `CompositionDemoScreen.test.tsx`, change the first preview test title and assertions:

```ts
it("opens completed Testreel jobs in the editor shell as a video-only preview", () => {
  expect(screen.getByTestId("composition-standalone-video")).toHaveAttribute("src", "/api/jobs/testreel-job-1/artifacts/testreel/final.mp4");
});
```

Add an error-state assertion with no published artifact:

```ts
expect(screen.getByRole("alert")).toHaveTextContent("Generation completed but returned no published video artifact.");
```

- [ ] **Step 2: Run web tests to verify they fail**

Run: `pnpm --filter @tinker/web test`

Expected: FAIL because the UI still selects `playwright-video` and API response schemas still need old fixtures in tests.

- [ ] **Step 3: Add primary published-video selection helper**

In `apps/web/src/lib/compositionGenerationClient.ts`:

```ts
export function selectPrimaryVideoArtifact(job: ApiGenerationJob): ApiArtifact | undefined {
  return selectArtifact(job, "published-video");
}
```

- [ ] **Step 4: Update `CompositionDemoScreen.tsx`**

Import the helper and switch selection:

```ts
import { selectPrimaryVideoArtifact, type CompositionGenerationClient, type CreateCompositionJobRequest } from "../../lib/compositionGenerationClient.js";
```

Replace the completed job block:

```tsx
if (completedJob) {
  const videoArtifact = selectPrimaryVideoArtifact(completedJob);
  const repoUrl = "repoUrl" in completedJob.request ? completedJob.request.repoUrl : undefined;
  const repo = typeof repoUrl === "string" ? parseGithubRepo(repoUrl) : undefined;
  if (videoArtifact) {
    return <CompositionEditorScreen standaloneVideoUrl={videoArtifact.url} {...(repo === undefined ? {} : { repo })} onBack={onBack} />;
  }
  return (
    <div className="tk-porcelain" role="alert" style={{ padding: 24 }}>
      Generation completed but returned no published video artifact.
    </div>
  );
}
```

Update direct generation copy:

```ts
setDirectError("Add your product / website URL - the video engine records it live.");
```

- [ ] **Step 5: Run web tests to verify they pass**

Run: `pnpm --filter @tinker/web test`

Expected: PASS. `composition-standalone-video` has a `testreel/final.mp4` source and Export opens the same URL.

- [ ] **Step 6: Commit web changes**

Run:

```bash
git add apps/web/src/lib/compositionGenerationClient.ts apps/web/src/lib/compositionGenerationClient.test.ts apps/web/src/lib/httpCompositionGenerationClient.test.ts apps/web/src/lib/useCompositionGenerationJob.test.ts apps/web/src/screens/CompositionEditor/CompositionDemoScreen.tsx apps/web/src/screens/CompositionEditor/CompositionDemoScreen.test.tsx apps/web/src/screens/CompositionEditor/CompositionEditorScreen.test.tsx apps/web/src/App.test.tsx
git commit -m "feat: preview published Testreel videos"
```

---

### Task 7: Delete Old Active Playwright Assembly Path

**Files:**
- Delete if unreferenced: `packages/demo-assembly/src/compileProject.ts`
- Delete if unreferenced: `packages/demo-assembly/src/compileProject.test.ts`
- Delete if unreferenced: `packages/demo-assembly/src/captureLineage.ts`
- Delete if unreferenced: `packages/demo-assembly/src/captureLineage.test.ts`
- Delete if unreferenced: `packages/demo-assembly/src/editDecisionList.ts`
- Delete if unreferenced: `packages/demo-assembly/src/editDecisionList.test.ts`
- Delete if unreferenced: `packages/demo-assembly/src/applyEditDecisionList.ts`
- Delete if unreferenced: `packages/demo-assembly/src/applyEditDecisionList.test.ts`
- Delete if unreferenced: `packages/demo-assembly/src/directorPlan.ts`
- Delete if unreferenced: `packages/demo-assembly/src/directorPlan.test.ts`
- Modify: `packages/demo-assembly/package.json`
- Modify: `docs/demo-pipeline.md`
- Modify: `docs/smooth-playwright-capture.md`

**Interfaces:**
- Consumes: green Testreel path from Tasks 1-6.
- Produces: no active source/test usage of old Playwright capture/render assembly in `@tinker/demo-assembly`, API, or web.

- [ ] **Step 1: Confirm old active path references are gone from source before deleting files**

Run:

```bash
rg "runPlaywrightCapture|verifyCapturePlan|CapturePlan|CaptureResult|compileProject|renderFinalToMp4|action-trace|capture-lineage|render-plan|director-plan|edit-decision-list|playwright-video|playwright-demo-project" packages/demo-assembly/src apps/api/src apps/web/src packages/generation-contract/src
```

Expected: Matches only in files scheduled for deletion or in test strings intentionally proving rejection of old shapes. If a match is in active code, remove that active dependency before continuing.

- [ ] **Step 2: Delete unreferenced demo-assembly Playwright assembly files**

Delete the files listed above if Step 1 shows no active imports. Update the `@tinker/demo-assembly` test script by removing these entries:

```text
tsx src/compileProject.test.ts
tsx src/captureLineage.test.ts
tsx src/editDecisionList.test.ts
tsx src/applyEditDecisionList.test.ts
tsx src/directorPlan.test.ts
```

- [ ] **Step 3: Remove old active dependencies from demo-assembly**

In `packages/demo-assembly/package.json`, remove dependencies that are only needed by the deleted active path:

```json
"@tinker/browser-capture": "workspace:*",
"@tinker/motion": "workspace:*",
"@tinker/rendering": "workspace:*"
```

Keep `@tinker/project-schema` if `packages/demo-assembly/src/types.ts` still imports `AspectRatioSchema`.

Run:

```bash
pnpm install
```

Expected: `pnpm-lock.yaml` reflects the dependency removal and keeps `testreel`/`playwright-core` under `@tinker/demo-assembly`.

- [ ] **Step 4: Update pipeline docs**

In `docs/demo-pipeline.md`, change the pipeline diagram to:

```text
POST /api/jobs
  -> runLocalGenerationJob
  -> runAiUrlDemo
     -> analysis
     -> understanding
     -> strategy + storyboard
     -> planner emits TestreelGenerationPlan
     -> Testreel CLI records and exports MP4
     -> testreel/final.mp4 + run-summary.json
```

In `docs/smooth-playwright-capture.md`, add this opening line:

```md
> Legacy note: this describes the removed Playwright capture polish path. New AI URL published videos are produced by Testreel under `generated/<run>/testreel/`.
```

- [ ] **Step 5: Run deletion-focused tests and search**

Run:

```bash
pnpm --filter @tinker/demo-assembly test
pnpm --filter @tinker/api test
pnpm --filter @tinker/web test
rg "runPlaywrightCapture|verifyCapturePlan|compileProject|renderFinalToMp4|playwright-video|playwright-demo-project" packages/demo-assembly/src apps/api/src apps/web/src packages/generation-contract/src
```

Expected: Tests pass. The final `rg` output is empty or limited to rejection-test literals whose variable names avoid reintroducing active Playwright concepts.

- [ ] **Step 6: Commit deletion changes**

Run:

```bash
git add packages/demo-assembly/package.json pnpm-lock.yaml docs/demo-pipeline.md docs/smooth-playwright-capture.md packages/demo-assembly/src
git commit -m "refactor: remove old Playwright assembly path"
```

---

### Task 8: Final Verification And Smoke

**Files:**
- No planned code edits.
- Generated smoke artifacts: `generated/local-job/ai-url-local-job/testreel/*`.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: evidence that contracts, demo assembly, API, web, typecheck, and one real local Testreel generation path work.

- [ ] **Step 1: Run package tests**

Run:

```bash
pnpm --filter @tinker/generation-contract test
pnpm --filter @tinker/demo-assembly test
pnpm --filter @tinker/api test
pnpm --filter @tinker/web test
```

Expected: all four commands exit 0.

- [ ] **Step 2: Run workspace typecheck**

Run:

```bash
pnpm typecheck
```

Expected: exits 0.

- [ ] **Step 3: Run the local Testreel smoke command**

Run:

```bash
pnpm --filter @tinker/demo-assembly generate:ai-url-job -- --repo https://github.com/getpaykit/paykit --url https://paykit.sh/ --duration 45
```

Expected: command exits 0 and prints `final.mp4` under `generated/local-job/ai-url-local-job/testreel/final.mp4`.

- [ ] **Step 4: Verify smoke artifact layout**

Run:

```bash
test -f generated/local-job/ai-url-local-job/testreel/recording-plan.json
test -f generated/local-job/ai-url-local-job/testreel/recording.json
test -f generated/local-job/ai-url-local-job/testreel/final.mp4
```

Expected: all `test -f` commands exit 0.

- [ ] **Step 5: Verify final source grep**

Run:

```bash
rg "playwright-video|playwright-demo-project|runPlaywrightCapture|renderFinalToMp4|compileProject" packages/demo-assembly/src apps/api/src apps/web/src packages/generation-contract/src
```

Expected: no active source matches. If a rejection test intentionally mentions an old string, keep the assertion but ensure runtime code does not select or emit that artifact kind.

- [ ] **Step 6: Inspect and commit final verification fixes if needed**

Run:

```bash
git status --short
git diff
```

Expected: no unreviewed changes. If verification required source or doc fixes, review the diff, stage only those touched files, and commit with a Conventional Commit message that names the fix. If no files changed after verification, do not create an empty commit.

---

## Self-Review Results

- Spec coverage: planner contract is covered in Task 2; local CLI execution and cancellation are covered in Task 3; orchestration/artifact layout/run-summary are covered in Task 4; API indexing and serving are covered in Task 5; frontend preview/export is covered in Task 6; deletion scope is covered in Task 7; final verification and smoke are covered in Task 8.
- Safety coverage: same-origin URL enforcement and environment substitution rejection are in Task 2; Testreel CLI failure/cancellation/missing-MP4 handling are in Task 3 and Task 4; no second browser verification pass is introduced.
- Type consistency: `recordingPlan`, `publishedVideoPath`, `rendererResults.testreel.finalVideoPath`, and `published-video` are the names used across contract, runner, API, and web tasks.
- Deletion timing: old Playwright assembly files are deleted only after Testreel planner, runner, orchestration, API, and web tests are green.
