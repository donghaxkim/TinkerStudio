import assert from "node:assert/strict";
import type { GenerationProgressEvent } from "@tinker/generation-contract";
import { LocalGenerationJobError, runLocalGenerationJob, type ManualDemoRunner } from "./localGenerationJob.js";
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

const successfulManualRunner: ManualDemoRunner = async (input) => {
  assert.equal(input.projectId, "manual-fixture-job");
  assert.ok(input.outputRoot.endsWith("generated/local-job/manual-fixture-job"));
  assert.equal(input.prompt, "Show the local job path.");

  input.onPhase?.("capture");
  input.onPhase?.("assembly");

  return {
    projectPath: `${input.outputRoot}/demo-project.json`,
    captureResultPath: `${input.outputRoot}/capture-result.json`,
    outputRoot: input.outputRoot,
    artifactPaths: [`${input.outputRoot}/capture-result.json`, `${input.outputRoot}/capture/videos/main.webm`],
    captureCounts: {
      clips: 1,
      screenshots: 0,
      events: 2,
      checkpoints: 1,
    },
  };
};

const successfulAiUrlRunner: AiUrlDemoRunner = async (input) => {
  assert.equal(input.projectId, "ai-url-job");
  assert.ok(input.outputRoot.endsWith("generated/local-job/ai-url-job"));
  assert.equal(input.productUrl, "http://127.0.0.1:3000/");
  assert.equal(input.repoUrl, "https://github.com/example/product");
  assert.equal(input.prompt, "Show the AI URL path.");

  const phases = ["analysis", "planning", "verification", "capture", "assembly"] as const;
  for (const phase of phases) {
    input.onPhase?.(phase);
  }

  return {
    projectPath: `${input.outputRoot}/demo-project.json`,
    captureResultPath: `${input.outputRoot}/capture-result.json`,
    outputRoot: input.outputRoot,
    artifactPaths: [
      `${input.outputRoot}/product-analysis.json`,
      `${input.outputRoot}/storyboard.json`,
      `${input.outputRoot}/capture-plan.json`,
      `${input.outputRoot}/capture-result.json`,
      `${input.outputRoot}/demo-project.json`,
    ],
    captureCounts: {
      clips: 1,
      screenshots: 1,
      events: 3,
      checkpoints: 2,
    },
  };
};

const events: GenerationProgressEvent[] = [];

function manualStatuses(events: GenerationProgressEvent[]) {
  return events.map((event) => ("status" in event ? event.status : undefined));
}

const result = await runLocalGenerationJob(
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
    runManualDemo: successfulManualRunner,
  },
);

assert.equal(result.jobId, "manual-fixture-job");
assert.equal(result.status, "completed");
assert.ok(result.projectPath.endsWith("generated/local-job/manual-fixture-job/demo-project.json"));
assert.deepEqual(manualStatuses(events), [
  "queued",
  "running",
  "capturing",
  "assembling",
  "completed",
]);

const aiUrlEvents: GenerationProgressEvent[] = [];

const aiUrlResult = await runLocalGenerationJob(
  {
    id: "ai-url-job",
    durationCapSeconds: 10,
    aspectRatio: "16:9",
    mode: "ai-url-planning",
    productUrl: "http://127.0.0.1:3000/",
    repoUrl: "https://github.com/example/product",
    prompt: "Show the AI URL path.",
    outputDirectory: "generated/local-job/ai-url-job",
  },
  {
    now: nextTime,
    onProgress: (event) => aiUrlEvents.push(event),
    runManualDemo: successfulManualRunner,
    runAiUrlDemo: successfulAiUrlRunner,
  },
);

assert.equal(aiUrlResult.jobId, "ai-url-job");
assert.equal(aiUrlResult.status, "completed");
assert.ok(aiUrlResult.projectPath.endsWith("generated/local-job/ai-url-job/demo-project.json"));
assert.deepEqual(aiUrlResult.artifactPaths.map((artifactPath) => artifactPath.split("/").at(-1)), [
  "product-analysis.json",
  "storyboard.json",
  "capture-plan.json",
  "capture-result.json",
  "demo-project.json",
]);
assert.deepEqual(manualStatuses(aiUrlEvents), [
  "queued",
  "running",
  "running",
  "running",
  "running",
  "capturing",
  "assembling",
  "completed",
]);
assert.deepEqual(aiUrlEvents.map((event) => event.message), [
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
let manualRunnerCalled = false;

await assert.rejects(
  () =>
    runLocalGenerationJob(
      {
        id: "invalid-job",
        durationCapSeconds: 0,
        aspectRatio: "16:9",
        mode: "manual-fixture",
      },
      {
        now: () => "2026-06-09T00:00:10.000Z",
        onProgress: (event) => invalidEvents.push(event),
        runManualDemo: async () => {
          manualRunnerCalled = true;
          throw new Error("Manual runner should not run for invalid requests");
        },
      },
    ),
  LocalGenerationJobError,
);

assert.equal(manualRunnerCalled, false);
assert.deepEqual(manualStatuses(invalidEvents), ["failed"]);

const unsafeEvents: GenerationProgressEvent[] = [];

await assert.rejects(
  () =>
    runLocalGenerationJob(
      {
        id: "unsafe-output-job",
        durationCapSeconds: 12,
        aspectRatio: "16:9",
        mode: "manual-fixture",
        outputDirectory: "../outside-generated",
      },
      {
        now: () => "2026-06-09T00:00:11.000Z",
        onProgress: (event) => unsafeEvents.push(event),
        runManualDemo: successfulManualRunner,
      },
    ),
  LocalGenerationJobError,
);

assert.deepEqual(manualStatuses(unsafeEvents), ["failed"]);

const planningFailureEvents: GenerationProgressEvent[] = [];

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
        runAiUrlDemo: async (input) => {
          input.onPhase?.("analysis");
          input.onPhase?.("planning");
          throw new Error("Planner returned malformed storyboard JSON");
        },
      },
    ),
  (error: unknown) => {
    assert.ok(error instanceof LocalGenerationJobError);
    assert.equal("stage" in error.generationError ? error.generationError.stage : undefined, "planning");
    return true;
  },
);

assert.equal(manualStatuses(planningFailureEvents).at(-1), "failed");

console.log("local generation job tests passed");
