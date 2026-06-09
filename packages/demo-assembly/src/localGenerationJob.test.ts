import assert from "node:assert/strict";
import type { GenerationProgressEvent } from "@tinker/generation-contract";
import { LocalGenerationJobError, runLocalGenerationJob, type ManualDemoRunner } from "./localGenerationJob.js";

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

const events: GenerationProgressEvent[] = [];

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
assert.deepEqual(events.map((event) => event.status), [
  "queued",
  "running",
  "capturing",
  "assembling",
  "completed",
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
assert.deepEqual(invalidEvents.map((event) => event.status), ["failed"]);

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

assert.deepEqual(unsafeEvents.map((event) => event.status), ["failed"]);

console.log("local generation job tests passed");
