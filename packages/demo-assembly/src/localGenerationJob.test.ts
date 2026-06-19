import assert from "node:assert/strict";
import type { GenerationProgressEvent } from "@tinker/generation-contract";
import { LocalGenerationJobError, runLocalGenerationJob } from "./localGenerationJob.js";
import type { RunAiUrlDemoInput, RunAiUrlDemoResult } from "./runAiUrlDemo.js";

type AiUrlDemoRunner = (input: RunAiUrlDemoInput) => Promise<RunAiUrlDemoResult>;

const times = [
  "2026-06-09T00:00:00.000Z",
  "2026-06-09T00:00:01.000Z",
  "2026-06-09T00:00:02.000Z",
  "2026-06-09T00:00:03.000Z",
  "2026-06-09T00:00:04.000Z",
  "2026-06-09T00:00:05.000Z",
];

function nextTime() {
  return times.shift() ?? "2026-06-09T00:00:06.000Z";
}

const successfulPlaywrightAiUrlRunner: AiUrlDemoRunner = async (input) => {
  assert.equal(input.projectId, "ai-url-playwright-job");
  assert.ok(input.outputRoot.endsWith("generated/local-job/ai-url-playwright-job"));
  assert.equal(input.productUrl, "http://127.0.0.1:3000/");
  assert.equal(input.repoUrl, "https://github.com/example/product");
  assert.equal("renderer" in input, false);
  assert.equal("hyperframesAgent" in input, false);
  assert.equal(input.prompt, "Show the AI URL path.");

  const phases = ["analysis", "planning", "verification", "capture", "assembly"] as const;
  for (const phase of phases) {
    input.onPhase?.(phase);
  }

  return {
    renderer: "playwright",
    rendererResults: {
      playwright: {
        projectPath: `${input.outputRoot}/playwright/demo-project.json`,
        captureResultPath: `${input.outputRoot}/playwright/capture-result.json`,
      },
    },
    projectPath: `${input.outputRoot}/playwright/demo-project.json`,
    captureResultPath: `${input.outputRoot}/playwright/capture-result.json`,
    outputRoot: input.outputRoot,
    artifactPaths: [
      `${input.outputRoot}/product-analysis.json`,
      `${input.outputRoot}/playwright/storyboard.json`,
      `${input.outputRoot}/playwright/capture-plan.json`,
      `${input.outputRoot}/playwright/capture-result.json`,
      `${input.outputRoot}/playwright/demo-project.json`,
      `${input.outputRoot}/playwright/final.mp4`,
    ],
    captureCounts: { clips: 1, screenshots: 1, events: 3, checkpoints: 2 },
    pipeline: {
      runInputPath: `${input.outputRoot}/input.json`,
      productUnderstandingPath: `${input.outputRoot}/product-understanding.json`,
      demoStrategyPath: `${input.outputRoot}/demo-strategy.json`,
      storyboardPath: `${input.outputRoot}/storyboard.json`,
      runSummaryPath: `${input.outputRoot}/run-summary.json`,
      finalVideoPath: `${input.outputRoot}/playwright/final.mp4`,
      warnings: [],
    },
  };
};

const events: GenerationProgressEvent[] = [];

function manualStatuses(events: GenerationProgressEvent[]) {
  return events.map((event) => ("status" in event ? event.status : undefined));
}

await assert.rejects(
  () =>
    runLocalGenerationJob(
      {
        id: "manual-fixture-job",
        durationCapSeconds: 12,
        aspectRatio: "16:9",
        mode: "manual-fixture",
        prompt: "Show the local job path.",
        outputDirectory: "generated/local-job/manual-fixture-job",
      },
      {
        now: nextTime,
        onProgress: (event) => events.push(event),
      },
    ),
  LocalGenerationJobError,
);

assert.deepEqual(manualStatuses(events), ["failed"]);

const playwrightAiUrlEvents: GenerationProgressEvent[] = [];

const playwrightAiUrlResult = await runLocalGenerationJob(
  {
    id: "ai-url-playwright-job",
    durationCapSeconds: 10,
    aspectRatio: "16:9",
    mode: "ai-url-planning",
    productUrl: "http://127.0.0.1:3000/",
    repoUrl: "https://github.com/example/product",
    prompt: "Show the AI URL path.",
    outputDirectory: "generated/local-job/ai-url-playwright-job",
  },
  {
    now: nextTime,
    onProgress: (event) => playwrightAiUrlEvents.push(event),
    runAiUrlDemo: successfulPlaywrightAiUrlRunner,
  },
);

assert.equal(playwrightAiUrlResult.jobId, "ai-url-playwright-job");
assert.equal(playwrightAiUrlResult.status, "completed");
assert.ok(playwrightAiUrlResult.projectPath.endsWith("generated/local-job/ai-url-playwright-job/playwright/demo-project.json"));
assert.equal(
  "captureResultPath" in playwrightAiUrlResult ? playwrightAiUrlResult.captureResultPath : undefined,
  `${playwrightAiUrlResult.outputDirectory}/playwright/capture-result.json`,
);
assert.equal("renderer" in playwrightAiUrlResult ? playwrightAiUrlResult.renderer : undefined, "playwright");
assert.deepEqual(
  "rendererResults" in playwrightAiUrlResult ? playwrightAiUrlResult.rendererResults : undefined,
  {
    playwright: {
      projectPath: playwrightAiUrlResult.projectPath,
      captureResultPath: `${playwrightAiUrlResult.outputDirectory}/playwright/capture-result.json`,
    },
  },
);
assert.deepEqual(playwrightAiUrlEvents.map((event) => event.message), [
  "Generation job queued",
  "Generation job running",
  "AI URL analysis started",
  "AI URL planning started",
  "AI URL verification started",
  "AI URL capture started",
  "AI URL assembly started",
  "Generation job completed",
]);

const invalidEvents: GenerationProgressEvent[] = [];
let aiRunnerCalledForInvalidDuration = false;

await assert.rejects(
  () =>
    runLocalGenerationJob(
      {
        id: "invalid-job",
        durationCapSeconds: 0,
        aspectRatio: "16:9",
        mode: "ai-url-planning",
        productUrl: "http://127.0.0.1:3000/",
        repoUrl: "https://github.com/example/product",
      },
      {
        now: () => "2026-06-09T00:00:10.000Z",
        onProgress: (event) => invalidEvents.push(event),
        runAiUrlDemo: async () => {
          aiRunnerCalledForInvalidDuration = true;
          throw new Error("AI runner should not run for invalid requests");
        },
      },
    ),
  LocalGenerationJobError,
);

assert.equal(aiRunnerCalledForInvalidDuration, false);
assert.deepEqual(manualStatuses(invalidEvents), ["failed"]);

const unsafeEvents: GenerationProgressEvent[] = [];
let aiRunnerCalledForUnsafeOutput = false;

await assert.rejects(
  () =>
    runLocalGenerationJob(
      {
        id: "unsafe-output-job",
        durationCapSeconds: 12,
        aspectRatio: "16:9",
        mode: "ai-url-planning",
        productUrl: "http://127.0.0.1:3000/",
        repoUrl: "https://github.com/example/product",
        outputDirectory: "../outside-generated",
      },
      {
        now: () => "2026-06-09T00:00:11.000Z",
        onProgress: (event) => unsafeEvents.push(event),
        runAiUrlDemo: async () => {
          aiRunnerCalledForUnsafeOutput = true;
          throw new Error("AI runner should not run for unsafe output directories");
        },
      },
    ),
  LocalGenerationJobError,
);

assert.equal(aiRunnerCalledForUnsafeOutput, false);
assert.deepEqual(manualStatuses(unsafeEvents), ["failed"]);

const planningFailureEvents: GenerationProgressEvent[] = [];
let aiRunnerCalledWithoutRepo = false;

await assert.rejects(
  () =>
    runLocalGenerationJob(
      {
        id: "ai-url-job",
        durationCapSeconds: 10,
        aspectRatio: "16:9",
        mode: "ai-url-planning",
        productUrl: "http://127.0.0.1:3000/",
        prompt: "Make a short demo of the main value prop.",
        outputDirectory: "generated/local-job/ai-url-job",
      },
      {
        now: () => "2026-06-09T00:00:12.000Z",
        onProgress: (event) => planningFailureEvents.push(event),
        runAiUrlDemo: async () => {
          aiRunnerCalledWithoutRepo = true;
          throw new Error("AI runner should not run without repoUrl");
        },
      },
    ),
  (error: unknown) => {
    assert.ok(error instanceof LocalGenerationJobError);
    assert.equal("stage" in error.generationError ? error.generationError.stage : undefined, "validation");
    return true;
  },
);

assert.equal(aiRunnerCalledWithoutRepo, false);
assert.equal(manualStatuses(planningFailureEvents).at(-1), "failed");

console.log("local generation job tests passed");
