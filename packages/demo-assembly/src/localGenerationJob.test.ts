import assert from "node:assert/strict";
import type { GenerationProgressEvent } from "@tinker/generation-contract";
import { LocalGenerationJobError, runLocalGenerationJob } from "./localGenerationJob.js";
import type { RunAiUrlDemoInput, RunAiUrlDemoResult } from "./runAiUrlDemo.js";

type AiUrlDemoRunner = (input: RunAiUrlDemoInput) => Promise<RunAiUrlDemoResult>;
const removedAgentField = "hyper" + "framesAgent";

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

const successfulTestreelAiUrlRunner: AiUrlDemoRunner = async (input) => {
  assert.equal(input.projectId, "ai-url-testreel-job");
  assert.ok(input.outputRoot.endsWith("generated/local-job/ai-url-testreel-job"));
  assert.equal(input.productUrl, "http://127.0.0.1:3000/");
  assert.equal(input.repoUrl, "https://github.com/example/product");
  assert.equal("renderer" in input, false);
  assert.equal(removedAgentField in input, false);
  assert.equal(input.prompt, "Show the AI URL path.");

  const phases = ["analysis", "understanding", "strategy", "planning", "verification", "capture", "assembly"] as const;
  for (const phase of phases) {
    input.onPhase?.(phase);
  }

  return {
    renderer: "testreel",
    rendererResults: {
      testreel: {
        recordingPlanPath: `${input.outputRoot}/testreel/recording-plan.json`,
        recordingPath: `${input.outputRoot}/testreel/recording.json`,
        outputDirectory: `${input.outputRoot}/testreel/output`,
        finalVideoPath: `${input.outputRoot}/testreel/final.mp4`,
        manifestPath: `${input.outputRoot}/testreel/output/output.json`,
        screenshotPaths: [`${input.outputRoot}/testreel/output/final.png`],
      },
    },
    publishedVideoPath: `${input.outputRoot}/testreel/final.mp4`,
    outputRoot: input.outputRoot,
    artifactPaths: [
      `${input.outputRoot}/product-analysis.json`,
      `${input.outputRoot}/testreel/recording-plan.json`,
      `${input.outputRoot}/testreel/recording.json`,
      `${input.outputRoot}/testreel/output/output.json`,
      `${input.outputRoot}/testreel/output/final.png`,
      `${input.outputRoot}/testreel/final.mp4`,
    ],
    pipeline: {
      runInputPath: `${input.outputRoot}/input.json`,
      productUnderstandingPath: `${input.outputRoot}/product-understanding.json`,
      demoStrategyPath: `${input.outputRoot}/demo-strategy.json`,
      storyboardPath: `${input.outputRoot}/storyboard.json`,
      runSummaryPath: `${input.outputRoot}/run-summary.json`,
      finalVideoPath: `${input.outputRoot}/testreel/final.mp4`,
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

const testreelAiUrlEvents: GenerationProgressEvent[] = [];

const testreelAiUrlResult = await runLocalGenerationJob(
  {
    id: "ai-url-testreel-job",
    durationCapSeconds: 10,
    aspectRatio: "16:9",
    mode: "ai-url-planning",
    productUrl: "http://127.0.0.1:3000/",
    repoUrl: "https://github.com/example/product",
    prompt: "Show the AI URL path.",
    outputDirectory: "generated/local-job/ai-url-testreel-job",
  },
  {
    now: nextTime,
    onProgress: (event) => testreelAiUrlEvents.push(event),
    runAiUrlDemo: successfulTestreelAiUrlRunner,
  },
);

assert.equal(testreelAiUrlResult.jobId, "ai-url-testreel-job");
assert.equal(testreelAiUrlResult.status, "completed");
assert.equal(
  "publishedVideoPath" in testreelAiUrlResult ? testreelAiUrlResult.publishedVideoPath : undefined,
  `${testreelAiUrlResult.outputDirectory}/testreel/final.mp4`,
);
assert.equal("renderer" in testreelAiUrlResult ? testreelAiUrlResult.renderer : undefined, "testreel");
assert.deepEqual(
  "rendererResults" in testreelAiUrlResult ? testreelAiUrlResult.rendererResults : undefined,
  {
    testreel: {
      recordingPlanPath: `${testreelAiUrlResult.outputDirectory}/testreel/recording-plan.json`,
      recordingPath: `${testreelAiUrlResult.outputDirectory}/testreel/recording.json`,
      outputDirectory: `${testreelAiUrlResult.outputDirectory}/testreel/output`,
      finalVideoPath: `${testreelAiUrlResult.outputDirectory}/testreel/final.mp4`,
      manifestPath: `${testreelAiUrlResult.outputDirectory}/testreel/output/output.json`,
      screenshotPaths: [`${testreelAiUrlResult.outputDirectory}/testreel/output/final.png`],
    },
  },
);
const completedEvent = testreelAiUrlEvents.at(-1);
assert.equal(completedEvent !== undefined && "artifactPath" in completedEvent ? completedEvent.artifactPath : undefined, `${testreelAiUrlResult.outputDirectory}/testreel/final.mp4`);
assert.deepEqual(testreelAiUrlEvents.map((event) => event.message), [
  "Generation job queued",
  "Generation job running",
  "AI URL analysis started",
  "AI URL understanding started",
  "AI URL strategy started",
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
