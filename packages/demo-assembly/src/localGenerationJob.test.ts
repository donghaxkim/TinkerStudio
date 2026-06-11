import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GenerationProgressEvent } from "@tinker/generation-contract";
import type { ProductAnalysis, RepoAnalysis } from "@tinker/product-analysis";
import { LocalGenerationJobError, runLocalGenerationJob, type ManualDemoRunner } from "./localGenerationJob.js";
import { runAiUrlDemo, type RunAiUrlDemoInput, type RunAiUrlDemoResult } from "./runAiUrlDemo.js";

type AiUrlDemoRunner = (input: RunAiUrlDemoInput) => Promise<RunAiUrlDemoResult>;

const productAnalysis: ProductAnalysis = {
  url: "http://127.0.0.1:3000/canonical",
  title: "Fixture Product",
  headings: ["Build demos faster"],
  bodySnippets: ["Fixture Product turns product URLs into editable demo projects."],
  links: [],
  buttons: ["Start demo"],
  inputs: [],
  brandHints: {
    colors: ["#0f172a"],
    fontFamilies: ["Inter"],
  },
};

const repoAnalysis: RepoAnalysis = {
  repoUrl: "https://github.com/example/product",
  commit: "abcdef1",
  productName: "Fixture Product",
  summary: "Fixture Product turns source context into better product demos.",
  features: ["Repo-aware planning"],
  likelyRoutes: ["/"],
  demoIdeas: ["Show repo-aware planning."],
  importantTerms: ["storyboard"],
  setupNotes: ["Source-only repo analysis."],
  sourceHints: [{ path: "README.md", reason: "Product summary." }],
};

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
  assert.equal(input.renderer, "playwright");
  assert.equal(input.prompt, "Show the AI URL path.");

  const phases = ["analysis", "planning", "verification", "capture", "assembly"] as const;
  for (const phase of phases) {
    input.onPhase?.(phase);
  }

  return {
    renderer: "playwright",
    rendererResults: {
      playwright: {
        projectPath: `${input.outputRoot}/demo-project.json`,
        captureResultPath: `${input.outputRoot}/capture-result.json`,
      },
    },
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
    renderer: "playwright",
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
assert.equal(
  "captureResultPath" in aiUrlResult ? aiUrlResult.captureResultPath : undefined,
  `${aiUrlResult.outputDirectory}/capture-result.json`,
);
assert.equal("renderer" in aiUrlResult ? aiUrlResult.renderer : undefined, "playwright");
assert.deepEqual(
  "rendererResults" in aiUrlResult ? aiUrlResult.rendererResults : undefined,
  {
    playwright: {
      projectPath: aiUrlResult.projectPath,
      captureResultPath: `${aiUrlResult.outputDirectory}/capture-result.json`,
    },
  },
);
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

const hyperframesValidationFailureEvents: GenerationProgressEvent[] = [];

await assert.rejects(
  () =>
    runLocalGenerationJob(
      {
        id: "ai-url-hyperframes-validation-failure-job",
        durationCapSeconds: 10,
        aspectRatio: "16:9",
        mode: "ai-url-planning",
        productUrl: "http://127.0.0.1:3000/",
        repoUrl: "https://github.com/example/product",
        renderer: "hyperframes",
        prompt: "Make a short demo of the main value prop.",
        outputDirectory: "generated/local-job/ai-url-hyperframes-validation-failure-job",
      },
      {
        now: () => "2026-06-09T00:00:13.000Z",
        onProgress: (event) => hyperframesValidationFailureEvents.push(event),
        runAiUrlDemo: (input) =>
          runAiUrlDemo({
            ...input,
            maxHyperframesRepairAttempts: 0,
            analyzeWebsite: async () => productAnalysis,
            analyzeRepo: async (_repoUrl, options) => {
              await mkdir(options.checkoutDirectory, { recursive: true });
              return repoAnalysis;
            },
            generateHyperframes: async (input) => {
              await mkdir(input.hyperframesDir, { recursive: true });
              await writeFile(join(input.hyperframesDir, "index.html"), "<html><body>Fixture Product</body></html>\n");
              await writeFile(join(input.hyperframesDir, "asset-manifest.json"), `${JSON.stringify({ assets: [] }, null, 2)}\n`);
              await writeFile(
                join(input.hyperframesDir, "generation-manifest.json"),
                `${JSON.stringify(
                  {
                    renderer: "playwright",
                    productUrl: productAnalysis.url,
                    sourceRepoUrl: repoAnalysis.repoUrl,
                    durationCapSeconds: 10,
                    aspectRatio: "16:9",
                    sourceGrounding: ["repo", "website-analysis"],
                    outputVideoPath: "output.mp4",
                  },
                  null,
                  2,
                )}\n`,
              );
            },
            runHyperframes: async () => {
              throw new Error("runHyperframes should not run after artifact validation failure");
            },
            repairHyperframes: async () => {
              throw new Error("repair should not run when repair attempts are exhausted");
            },
          }),
      },
    ),
  (error: unknown) => {
    assert.ok(error instanceof LocalGenerationJobError);
    assert.equal("stage" in error.generationError ? error.generationError.stage : undefined, "validation");
    assert.match(error.generationError.message, /renderer/);
    return true;
  },
);

const finalHyperframesValidationFailureEvent = hyperframesValidationFailureEvents.at(-1);
assert.equal(
  finalHyperframesValidationFailureEvent && "status" in finalHyperframesValidationFailureEvent
    ? finalHyperframesValidationFailureEvent.status
    : undefined,
  "failed",
);

console.log("local generation job tests passed");
