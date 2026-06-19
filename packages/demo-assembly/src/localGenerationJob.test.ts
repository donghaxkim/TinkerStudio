import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GenerationProgressEvent } from "@tinker/generation-contract";
import type { ProductAnalysis, RepoAnalysis } from "@tinker/product-analysis";
import { LocalGenerationJobError, runLocalGenerationJob } from "./localGenerationJob.js";
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

const approvedOutline = {
  title: "Fixture approved outline",
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  summary: "Use the approved scene order.",
  scenes: [
    { id: "scene-1", goal: "Open with the product promise", visual: "Show the hero.", evidence: ["website"] },
    { id: "scene-2", goal: "Show the repo-backed workflow", visual: "Walk through the main UI.", evidence: ["repo", "website"] },
  ],
  generationNotes: ["Keep the approved IDs."],
} as const;

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

const successfulAiUrlRunner: AiUrlDemoRunner = async (input) => {
  assert.equal(input.projectId, "ai-url-job");
  assert.ok(input.outputRoot.endsWith("generated/local-job/ai-url-job"));
  assert.equal(input.productUrl, "http://127.0.0.1:3000/");
  assert.equal(input.repoUrl, "https://github.com/example/product");
  assert.equal(input.renderer, "hyperframes");
  assert.equal(input.hyperframesAgent, "claude");
  assert.equal(input.prompt, "Show the AI URL path.");
  assert.deepEqual(input.approvedOutline, approvedOutline);

  const phases = ["analysis", "planning", "validation", "capture", "assembly"] as const;
  for (const phase of phases) {
    input.onPhase?.(phase);
  }

  return {
    renderer: "hyperframes",
    rendererResults: {
      hyperframes: {
        outputVideoPath: `${input.outputRoot}/hyperframes/output.mp4`,
        generationManifestPath: `${input.outputRoot}/hyperframes/generation-manifest.json`,
        assetManifestPath: `${input.outputRoot}/hyperframes/asset-manifest.json`,
      },
    },
    projectPath: `${input.outputRoot}/hyperframes/output.mp4`,
    captureResultPath: `${input.outputRoot}/hyperframes/generation-manifest.json`,
    outputRoot: input.outputRoot,
    artifactPaths: [
      `${input.outputRoot}/product-analysis.json`,
      `${input.outputRoot}/repo-analysis.json`,
      `${input.outputRoot}/hyperframes/index.html`,
      `${input.outputRoot}/hyperframes/asset-manifest.json`,
      `${input.outputRoot}/hyperframes/generation-manifest.json`,
      `${input.outputRoot}/hyperframes/output.mp4`,
    ],
    captureCounts: {
      clips: 1,
      screenshots: 0,
      events: 0,
      checkpoints: 0,
    },
    pipeline: {
      runInputPath: `${input.outputRoot}/input.json`,
      productUnderstandingPath: `${input.outputRoot}/product-understanding.json`,
      demoStrategyPath: `${input.outputRoot}/demo-strategy.json`,
      storyboardPath: `${input.outputRoot}/storyboard.json`,
      runSummaryPath: `${input.outputRoot}/run-summary.json`,
      warnings: [],
    },
  };
};

const successfulPlaywrightAiUrlRunner: AiUrlDemoRunner = async (input) => {
  assert.equal(input.projectId, "ai-url-playwright-job");
  assert.ok(input.outputRoot.endsWith("generated/local-job/ai-url-playwright-job"));
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

const aiUrlEvents: GenerationProgressEvent[] = [];

const aiUrlResult = await runLocalGenerationJob(
  {
    id: "ai-url-job",
    durationCapSeconds: 10,
    aspectRatio: "16:9",
    mode: "ai-url-planning",
    productUrl: "http://127.0.0.1:3000/",
    repoUrl: "https://github.com/example/product",
    hyperframesAgent: "claude",
    prompt: "Show the AI URL path.",
    approvedOutline,
    outputDirectory: "generated/local-job/ai-url-job",
  },
  {
    now: nextTime,
    onProgress: (event) => aiUrlEvents.push(event),
    runAiUrlDemo: successfulAiUrlRunner,
  },
);

assert.equal(aiUrlResult.jobId, "ai-url-job");
assert.equal(aiUrlResult.status, "completed");
assert.ok(aiUrlResult.projectPath.endsWith("generated/local-job/ai-url-job/hyperframes/output.mp4"));
assert.equal(
  "captureResultPath" in aiUrlResult ? aiUrlResult.captureResultPath : undefined,
  `${aiUrlResult.outputDirectory}/hyperframes/generation-manifest.json`,
);
assert.equal("renderer" in aiUrlResult ? aiUrlResult.renderer : undefined, "hyperframes");
assert.deepEqual(
  "rendererResults" in aiUrlResult ? aiUrlResult.rendererResults : undefined,
  {
    hyperframes: {
      outputVideoPath: aiUrlResult.projectPath,
      generationManifestPath: `${aiUrlResult.outputDirectory}/hyperframes/generation-manifest.json`,
      assetManifestPath: `${aiUrlResult.outputDirectory}/hyperframes/asset-manifest.json`,
    },
  },
);
assert.deepEqual(aiUrlResult.artifactPaths.map((artifactPath) => artifactPath.split("/").at(-1)), [
  "product-analysis.json",
  "repo-analysis.json",
  "index.html",
  "asset-manifest.json",
  "generation-manifest.json",
  "output.mp4",
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
  "AI URL validation started",
  "AI URL capture started",
  "AI URL assembly started",
  "Generation job completed",
]);

const playwrightAiUrlEvents: GenerationProgressEvent[] = [];

const playwrightAiUrlResult = await runLocalGenerationJob(
  {
    id: "ai-url-playwright-job",
    durationCapSeconds: 10,
    aspectRatio: "16:9",
    mode: "ai-url-planning",
    productUrl: "http://127.0.0.1:3000/",
    repoUrl: "https://github.com/example/product",
    renderer: "playwright",
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
assert.ok(playwrightAiUrlResult.projectPath.endsWith("generated/local-job/ai-url-playwright-job/demo-project.json"));
assert.equal(
  "captureResultPath" in playwrightAiUrlResult ? playwrightAiUrlResult.captureResultPath : undefined,
  `${playwrightAiUrlResult.outputDirectory}/capture-result.json`,
);
assert.equal("renderer" in playwrightAiUrlResult ? playwrightAiUrlResult.renderer : undefined, "playwright");
assert.deepEqual(
  "rendererResults" in playwrightAiUrlResult ? playwrightAiUrlResult.rendererResults : undefined,
  {
    playwright: {
      projectPath: playwrightAiUrlResult.projectPath,
      captureResultPath: `${playwrightAiUrlResult.outputDirectory}/capture-result.json`,
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
