import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { NarrativeExploration, ProductAnalysis, RepoAnalysis } from "@tinker/product-analysis";
import { runAiUrlDemo, type AiUrlDemoPhase } from "./runAiUrlDemo.js";
import { deriveProductUnderstanding } from "./productUnderstanding.js";
import type { TestreelGenerationPlan } from "./testreelPlan.js";
import type { RunTestreelRecordingResult } from "./testreelRunner.js";

const outputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-"));
const productUrl = "http://127.0.0.1:3000/";
const canonicalProductUrl = "http://127.0.0.1:3000/canonical";
const prompt = "Show the hero and value proposition.";
const phases: AiUrlDemoPhase[] = [];

const productAnalysis: ProductAnalysis = {
  url: canonicalProductUrl,
  title: "Fixture Product",
  headings: ["Build demos faster", "Export polished videos"],
  bodySnippets: ["Fixture Product turns product URLs into editable demo projects."],
  links: [],
  buttons: ["Start demo", "Export"],
  inputs: [{ label: "Workspace", selectorHint: "[data-testid='workspace-name']" }],
  brandHints: {
    colors: ["#0f172a", "#38bdf8"],
    fontFamilies: ["Inter", "system-ui"],
  },
  screenshotPath: join(outputRoot, "product-analysis.png"),
};

const repoUrl = "https://github.com/example/product";
const repoAnalysis: RepoAnalysis = {
  repoUrl,
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

const narrativeExploration: NarrativeExploration = {
  productSummary: "Fixture Product creates repo-aware product demos.",
  bestDemoAngle: "Show a URL becoming an editable demo with deterministic capture.",
  userProblem: "Teams need a demo narrative grounded in the real workflow.",
  promisedOutcome: "The generated storyboard uses the strongest observed workflow.",
  workflowCandidates: [
    {
      name: "URL to demo project",
      whyItMatters: "It proves the core product promise.",
      routeHints: ["/", "Demo builder"],
      visibleEvidence: ["Start demo button"],
      storyboardUse: "main-demo",
    },
  ],
  strongestCopy: ["Build demos faster"],
  avoidNarratives: ["Avoid generic homepage tour."],
  explorationNotes: ["Only same-origin UI was observed."],
};

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

async function fakeRunTestreel(testreelRoot: string, onPhase?: (phase: "verification" | "capture" | "assembly") => void): Promise<RunTestreelRecordingResult> {
  const recordingPlanPath = join(testreelRoot, "recording-plan.json");
  const recordingPath = join(testreelRoot, "recording.json");
  const outputDirectory = join(testreelRoot, "output");
  const manifestPath = join(outputDirectory, "output.json");
  const screenshotPath = join(outputDirectory, "final.png");
  const finalVideoPath = join(testreelRoot, "final.mp4");
  onPhase?.("verification");
  onPhase?.("capture");
  onPhase?.("assembly");
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

const agentSignalOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-agent-signal-"));
const agentSignalController = new AbortController();
const agentSignalUnderstanding = deriveProductUnderstanding({ productUrl, repoUrl, websiteAnalysis: productAnalysis, repoAnalysis });
await runAiUrlDemo({
  outputRoot: agentSignalOutputRoot,
  projectId: "ai-url-demo-agent-signal-test",
  createdAt: "2026-06-09T00:00:00.000Z",
  productUrl,
  repoUrl,
  prompt,
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  signal: agentSignalController.signal,
  analyzeWebsite: async () => ({ ...productAnalysis, screenshotPath: undefined }),
  analyzeRepo: async (_url, options) => {
    await mkdir(options.checkoutDirectory, { recursive: true });
    return repoAnalysis;
  },
  understandProduct: async (input) => {
    assert.equal(input.signal, agentSignalController.signal);
    return agentSignalUnderstanding;
  },
  strategize: async (input) => {
    assert.equal(input.signal, agentSignalController.signal);
    return {
      strategy: {
        version: 1,
        selectedAngle: { title: "Signal", whyThisAngle: "because", targetAudience: "teams", primaryProof: "proof" },
        selectedFlow: { sourceFlowId: agentSignalUnderstanding.demoableFlows[0]!.id, name: "Flow", reason: "reason" },
        messageHierarchy: ["Show the signal-safe flow."],
        successCriteria: [],
        risks: [],
        warnings: [],
      },
      storyboard: {
        version: 1,
        title: "Signal Demo",
        durationTargetSeconds: 10,
        aspectRatio: "16:9",
        beats: [
          {
            id: "beat-1",
            goal: "Introduce product.",
            visual: "Hero",
            narrative: "Narrative",
            strategyMessageId: "message-1",
            proofPointId: agentSignalUnderstanding.capabilities[0]?.id ?? "capability-1",
            expectedUserAction: null,
            importance: "high",
          },
        ],
      },
    };
  },
  planner: async (input) => {
    assert.equal(input.signal, agentSignalController.signal);
    return {
      storyboard: {
        title: "Signal Planner Demo",
        durationCapSeconds: 10,
        aspectRatio: "16:9",
        beats: [{ id: "hook", type: "hook", goal: "Introduce product." }],
      },
      recordingPlan,
    };
  },
  runTestreel: async (options) => {
    assert.equal(options.signal, agentSignalController.signal);
    assert.deepEqual(options.plan, recordingPlan);
    return fakeRunTestreel(options.testreelRoot, options.onPhase);
  },
});

const analysisAbortOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-analysis-abort-"));
const analysisAbortController = new AbortController();
let analysisAbortRepoCalled = false;
const analysisAbortRun = runAiUrlDemo({
  outputRoot: analysisAbortOutputRoot,
  projectId: "ai-url-demo-analysis-abort-test",
  createdAt: "2026-06-09T00:00:00.000Z",
  productUrl,
  repoUrl,
  prompt,
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  signal: analysisAbortController.signal,
  analyzeWebsite: async (_url, options) => {
    assert.equal(options.signal, analysisAbortController.signal);
    return new Promise<ProductAnalysis>((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new DOMException("Analysis cancelled.", "AbortError")), { once: true });
    });
  },
  analyzeRepo: async () => {
    analysisAbortRepoCalled = true;
    return repoAnalysis;
  },
  planner: async () => {
    throw new Error("planner should not run after analysis abort");
  },
  runTestreel: async () => fakeRunTestreel(join(analysisAbortOutputRoot, "testreel")),
});
analysisAbortController.abort();
await assert.rejects(analysisAbortRun, (error) => error instanceof DOMException && error.name === "AbortError");
assert.equal(analysisAbortRepoCalled, false);

const repoAbortOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-repo-abort-"));
const repoAbortController = new AbortController();
let repoAbortPlannerCalled = false;
const repoAbortRun = runAiUrlDemo({
  outputRoot: repoAbortOutputRoot,
  projectId: "ai-url-demo-repo-abort-test",
  createdAt: "2026-06-09T00:00:00.000Z",
  productUrl,
  repoUrl,
  prompt,
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  signal: repoAbortController.signal,
  analyzeWebsite: async () => ({ ...productAnalysis, screenshotPath: undefined }),
  analyzeRepo: async (_url, options) => {
    assert.equal(options.signal, repoAbortController.signal);
    return new Promise<RepoAnalysis>((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new DOMException("Repo analysis cancelled.", "AbortError")), { once: true });
    });
  },
  planner: async () => {
    repoAbortPlannerCalled = true;
    throw new Error("planner should not run after repo abort");
  },
  runTestreel: async () => fakeRunTestreel(join(repoAbortOutputRoot, "testreel")),
});
repoAbortController.abort();
await assert.rejects(repoAbortRun, (error) => error instanceof DOMException && error.name === "AbortError");
assert.equal(repoAbortPlannerCalled, false);

const narrativeSuccessOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-narrative-success-"));
let narrativePlannerSawArtifact = false;
const narrativeSuccessController = new AbortController();
const narrativeSuccessResult = await runAiUrlDemo({
  outputRoot: narrativeSuccessOutputRoot,
  projectId: "ai-url-demo-narrative-success-test",
  createdAt: "2026-06-09T00:00:00.000Z",
  productUrl,
  repoUrl,
  prompt,
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  enableNarrativeExploration: true,
  signal: narrativeSuccessController.signal,
  analyzeWebsite: async () => ({ ...productAnalysis, screenshotPath: undefined }),
  analyzeRepo: async (_url, options) => {
    await mkdir(options.checkoutDirectory, { recursive: true });
    return repoAnalysis;
  },
  exploreNarrativeWebsite: async (url, options) => {
    assert.equal(url, canonicalProductUrl);
    assert.equal(options.enabled, true);
    assert.equal(options.prompt, prompt);
    assert.equal(options.signal, narrativeSuccessController.signal);
    assert.deepEqual(options.productAnalysis, { ...productAnalysis, screenshotPath: undefined });
    assert.deepEqual(options.repoAnalysis, repoAnalysis);
    return narrativeExploration;
  },
  planner: async (input) => {
    narrativePlannerSawArtifact = true;
    assert.deepEqual(input.narrativeExploration, narrativeExploration);
    return {
      storyboard: {
        title: "Narrative Exploration Demo",
        durationCapSeconds: 10,
        aspectRatio: "16:9",
        beats: [{ id: "hook", type: "hook", goal: "Introduce product." }],
      },
      recordingPlan,
    };
  },
  runTestreel: async (options) => fakeRunTestreel(options.testreelRoot, options.onPhase),
});
assert.equal(narrativePlannerSawArtifact, true);
const narrativePath = join(narrativeSuccessOutputRoot, "narrative-exploration.json");
assert.ok(narrativeSuccessResult.artifactPaths.includes(narrativePath));
assert.deepEqual(JSON.parse(await readFile(narrativePath, "utf8")), narrativeExploration);

const narrativeFailureOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-narrative-failure-"));
const narrativeWarnings: string[] = [];
await runAiUrlDemo({
  outputRoot: narrativeFailureOutputRoot,
  projectId: "ai-url-demo-narrative-failure-test",
  createdAt: "2026-06-09T00:00:00.000Z",
  productUrl,
  repoUrl,
  prompt,
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  enableNarrativeExploration: true,
  onWarning: (message) => narrativeWarnings.push(message),
  analyzeWebsite: async () => ({ ...productAnalysis, screenshotPath: undefined }),
  analyzeRepo: async (_url, options) => {
    await mkdir(options.checkoutDirectory, { recursive: true });
    return repoAnalysis;
  },
  exploreNarrativeWebsite: async () => {
    throw new Error("Stagehand unavailable");
  },
  planner: async (input) => {
    assert.equal(input.narrativeExploration, undefined);
    return {
      storyboard: {
        title: "Narrative Fallback Demo",
        durationCapSeconds: 10,
        aspectRatio: "16:9",
        beats: [{ id: "hook", type: "hook", goal: "Introduce product." }],
      },
      recordingPlan,
    };
  },
  runTestreel: async (options) => fakeRunTestreel(options.testreelRoot, options.onPhase),
});
assert.equal(existsSync(join(narrativeFailureOutputRoot, "narrative-exploration.json")), false);
assert.ok(narrativeWarnings.some((message) => message.includes("Narrative exploration failed: Stagehand unavailable")));

const narrativeAbortOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-narrative-abort-"));
const narrativeAbortController = new AbortController();
const narrativeAbortWarnings: string[] = [];
let narrativeAbortPlannerCalled = false;
const narrativeAbortRun = runAiUrlDemo({
  outputRoot: narrativeAbortOutputRoot,
  projectId: "ai-url-demo-narrative-abort-test",
  createdAt: "2026-06-09T00:00:00.000Z",
  productUrl,
  repoUrl,
  prompt,
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  enableNarrativeExploration: true,
  signal: narrativeAbortController.signal,
  onWarning: (message) => narrativeAbortWarnings.push(message),
  analyzeWebsite: async () => ({ ...productAnalysis, screenshotPath: undefined }),
  analyzeRepo: async (_url, options) => {
    await mkdir(options.checkoutDirectory, { recursive: true });
    return repoAnalysis;
  },
  exploreNarrativeWebsite: async (_url, options) => {
    assert.equal(options.signal, narrativeAbortController.signal);
    return new Promise<NarrativeExploration>((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new DOMException("Narrative cancelled.", "AbortError")), { once: true });
    });
  },
  planner: async () => {
    narrativeAbortPlannerCalled = true;
    throw new Error("planner should not run after narrative abort");
  },
  runTestreel: async (options) => fakeRunTestreel(options.testreelRoot, options.onPhase),
});
narrativeAbortController.abort();
await assert.rejects(narrativeAbortRun, (error) => error instanceof DOMException && error.name === "AbortError");
assert.equal(narrativeAbortPlannerCalled, false);
assert.deepEqual(narrativeAbortWarnings, []);

const result = await runAiUrlDemo({
  outputRoot,
  projectId: "ai-url-demo-test",
  createdAt: "2026-06-09T00:00:00.000Z",
  productUrl,
  repoUrl,
  prompt,
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  onPhase: (phase) => phases.push(phase),
  analyzeWebsite: async (url, options) => {
    assert.equal(url, productUrl);
    assert.deepEqual(options, {
      outputDirectory: outputRoot,
      screenshotFileName: "product-analysis.png",
      headless: true,
    });

    return productAnalysis;
  },
  analyzeRepo: async (url, options) => {
    assert.equal(url, repoUrl);
    assert.ok(options.checkoutDirectory.endsWith(".repo-scratch/checkout"));
    await mkdir(options.checkoutDirectory, { recursive: true });
    return repoAnalysis;
  },
  planner: async (input) => {
    assert.equal(input.productUrl, canonicalProductUrl);
    assert.equal(input.prompt, prompt);
    assert.equal(input.durationCapSeconds, 10);
    assert.equal(input.aspectRatio, "16:9");
    assert.deepEqual(input.analysis, productAnalysis);
    assert.deepEqual(input.repoAnalysis, repoAnalysis);
    const repoCheckoutDirectory = input.repoCheckoutDirectory;
    if (repoCheckoutDirectory === undefined) {
      throw new Error("repoCheckoutDirectory should be passed to planner");
    }
    assert.ok(repoCheckoutDirectory.endsWith(".repo-scratch/checkout"));
    assert.equal(existsSync(repoCheckoutDirectory), true);

    return {
      storyboard: {
        title: "Fixture Product Demo",
        durationCapSeconds: 10,
        aspectRatio: "16:9",
        beats: [
          {
            id: "hook",
            type: "hook",
            goal: "Introduce Fixture Product.",
            startHint: 0,
            endHint: 4,
          },
        ],
      },
      recordingPlan,
    };
  },
  runTestreel: async (options) => {
    assert.equal(options.testreelRoot, join(outputRoot, "testreel"));
    assert.deepEqual(options.plan, recordingPlan);
    return fakeRunTestreel(options.testreelRoot, options.onPhase);
  },
});

assert.deepEqual(phases, ["analysis", "understanding", "strategy", "planning", "verification", "capture", "assembly"]);

const expectedPaths = [
  join(outputRoot, "product-analysis.json"),
  join(outputRoot, "repo-analysis.json"),
  join(outputRoot, "testreel", "recording-plan.json"),
  join(outputRoot, "testreel", "recording.json"),
  join(outputRoot, "testreel", "output", "output.json"),
  join(outputRoot, "testreel", "output", "final.png"),
  join(outputRoot, "testreel", "final.mp4"),
];

for (const path of expectedPaths) {
  assert.ok(result.artifactPaths.includes(path), `Expected artifact path ${path}`);
}

// ---- New multi-phase pipeline artifacts (Understanding -> Strategy -> Capture) ----
const pipelinePaths = [
  join(outputRoot, "input.json"),
  join(outputRoot, "product-understanding.json"),
  join(outputRoot, "demo-strategy.json"),
  join(outputRoot, "storyboard.json"),
  join(outputRoot, "run-summary.json"),
];
for (const path of pipelinePaths) {
  assert.ok(result.artifactPaths.includes(path), `Expected pipeline artifact path ${path}`);
  assert.ok(existsSync(path), `Expected pipeline artifact on disk ${path}`);
}
assert.equal(result.pipeline.productUnderstandingPath, join(outputRoot, "product-understanding.json"));
assert.equal(result.pipeline.demoStrategyPath, join(outputRoot, "demo-strategy.json"));
assert.equal(result.pipeline.storyboardPath, join(outputRoot, "storyboard.json"));
assert.equal(result.pipeline.runSummaryPath, join(outputRoot, "run-summary.json"));

// product-understanding.json is evidence-backed and schema-shaped.
const understandingJson = JSON.parse(await readFile(join(outputRoot, "product-understanding.json"), "utf8"));
assert.equal(understandingJson.version, 1);
assert.ok(understandingJson.demoableFlows.length >= 1, "understanding should expose >=1 flow");
assert.ok(understandingJson.evidence.length >= 1, "understanding should cite evidence");

// demo-strategy.json selected a flow that actually exists in the understanding.
const strategyJson = JSON.parse(await readFile(join(outputRoot, "demo-strategy.json"), "utf8"));
assert.ok(
  understandingJson.demoableFlows.some((flow: { id: string }) => flow.id === strategyJson.selectedFlow.sourceFlowId),
  "strategy must select a real understanding flow",
);

// run-summary.json covers every storyboard beat.
const storyboardJson = JSON.parse(await readFile(join(outputRoot, "storyboard.json"), "utf8"));
const runSummaryJson = JSON.parse(await readFile(join(outputRoot, "run-summary.json"), "utf8"));
assert.equal(runSummaryJson.version, 1);
assert.equal(runSummaryJson.storyboardCoverage.length, storyboardJson.beats.length);

assert.ok(runSummaryJson.execution, "run-summary has an execution block");
// backend is OFF in tests (no TINKER_AGENT_BACKEND) → deterministic modes.
assert.equal(runSummaryJson.execution.understandingMode, "deterministic");
assert.equal(runSummaryJson.execution.strategyMode, "deterministic");
assert.equal(runSummaryJson.execution.plannerMode, "opencode");
assert.equal(runSummaryJson.execution.finalVideoMode, "testreel");
assert.equal(runSummaryJson.execution.finalVideoSource, "testreel-cli");
assert.equal(runSummaryJson.execution.checkpointMode, "planner-declared");
// coreCoverage exists with the stricter selected-flow item.
assert.ok(Array.isArray(runSummaryJson.coreCoverage) && runSummaryJson.coreCoverage.length >= 1);
assert.ok(runSummaryJson.coreCoverage.some((i: { sourceType: string; required: boolean }) => i.sourceType === "selected-flow" && i.required === true));

// Strategic storyboard, Testreel artifacts, and the run summary exist on disk
// AND are listed in run-summary.generatedArtifacts (clear, non-ambiguous artifact map).
assert.ok(existsSync(join(outputRoot, "storyboard.json")), "root strategic storyboard.json must exist");
assert.equal(existsSync(join(outputRoot, "playwright", "demo-project.json")), false);
assert.equal(existsSync(join(outputRoot, "testreel", "recording-plan.json")), true);
assert.equal(existsSync(join(outputRoot, "testreel", "recording.json")), true);
assert.equal(existsSync(join(outputRoot, "testreel", "final.mp4")), true);
assert.ok(existsSync(join(outputRoot, "run-summary.json")), "run-summary.json must exist");
for (const listed of ["storyboard.json", "testreel/recording-plan.json", "testreel/recording.json", "testreel/final.mp4", "run-summary.json"]) {
  assert.ok(
    runSummaryJson.generatedArtifacts.includes(listed),
    `run-summary.generatedArtifacts should list ${listed}`,
  );
}

assert.equal(result.renderer, "testreel");
assert.equal(result.publishedVideoPath, join(outputRoot, "testreel", "final.mp4"));
assert.equal(result.rendererResults.testreel.finalVideoPath, join(outputRoot, "testreel", "final.mp4"));
assert.ok(result.artifactPaths.includes(join(outputRoot, "testreel", "final.mp4")));
const repoAnalysisJson = JSON.parse(await readFile(join(outputRoot, "repo-analysis.json"), "utf8"));
assert.deepEqual(repoAnalysisJson, repoAnalysis);
assert.equal(result.artifactPaths.includes(join(outputRoot, ".repo-scratch", "checkout")), false);
assert.equal(result.artifactPaths.some((artifactPath) => artifactPath.startsWith(join(outputRoot, ".repo-scratch"))), false);
assert.equal(existsSync(join(outputRoot, ".repo-scratch")), false);

const mismatchedRepoOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-repo-mismatch-"));
await assert.rejects(
  () =>
    runAiUrlDemo({
      outputRoot: mismatchedRepoOutputRoot,
      projectId: "ai-url-demo-repo-mismatch-test",
      createdAt: "2026-06-09T00:00:00.000Z",
      productUrl,
      repoUrl,
      prompt,
      durationCapSeconds: 10,
      aspectRatio: "16:9",
      analyzeWebsite: async () => ({ ...productAnalysis, screenshotPath: undefined }),
      analyzeRepo: async () => ({ ...repoAnalysis, repoUrl: "https://github.com/example/other" }),
      planner: async () => {
        throw new Error("planner should not run with mismatched repo analysis");
      },
      runTestreel: async (options) => fakeRunTestreel(options.testreelRoot, options.onPhase),
    }),
  /repoUrl must match requested repository URL/,
);
assert.equal(existsSync(join(mismatchedRepoOutputRoot, "repo-analysis.json")), false);
assert.equal(existsSync(join(mismatchedRepoOutputRoot, ".repo-scratch")), false);

const repoFailureOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-repo-failure-"));
const repoAnalysisError = new Error("primary repo analysis failed");
await assert.rejects(
  () =>
    runAiUrlDemo({
      outputRoot: repoFailureOutputRoot,
      projectId: "ai-url-demo-repo-failure-test",
      createdAt: "2026-06-09T00:00:00.000Z",
      productUrl,
      repoUrl,
      prompt,
      durationCapSeconds: 10,
      aspectRatio: "16:9",
      analyzeWebsite: async () => ({ ...productAnalysis, screenshotPath: undefined }),
      analyzeRepo: async (_url, options) => {
        await mkdir(options.checkoutDirectory, { recursive: true });
        throw repoAnalysisError;
      },
      planner: async () => {
        throw new Error("planner should not run after repo analysis failure");
      },
      runTestreel: async (options) => fakeRunTestreel(options.testreelRoot, options.onPhase),
    }),
  (error) => {
    assert.equal(error, repoAnalysisError);
    return true;
  },
);
assert.equal(existsSync(join(repoFailureOutputRoot, ".repo-scratch")), false);

const cleanupMaskOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-cleanup-mask-"));
const maskedRepoAnalysisError = new Error("repo analysis failed before cleanup");
let cleanupMaskRejection: unknown;

try {
  await runAiUrlDemo({
    outputRoot: cleanupMaskOutputRoot,
    projectId: "ai-url-demo-cleanup-mask-test",
    createdAt: "2026-06-09T00:00:00.000Z",
    productUrl,
    repoUrl,
    prompt,
    durationCapSeconds: 10,
    aspectRatio: "16:9",
    analyzeWebsite: async () => ({ ...productAnalysis, screenshotPath: undefined }),
    analyzeRepo: async (_url, options) => {
      await mkdir(options.checkoutDirectory, { recursive: true });
      await chmod(cleanupMaskOutputRoot, 0o500);
      throw maskedRepoAnalysisError;
    },
    planner: async () => {
      throw new Error("planner should not run after repo analysis failure");
    },
    runTestreel: async (options) => fakeRunTestreel(options.testreelRoot, options.onPhase),
  });
} catch (error) {
  cleanupMaskRejection = error;
} finally {
  await chmod(cleanupMaskOutputRoot, 0o700);
  await rm(cleanupMaskOutputRoot, { recursive: true, force: true });
}

assert.equal(cleanupMaskRejection, maskedRepoAnalysisError);

const noRepoOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-no-repo-"));
let noRepoWebsiteAnalyzerCalled = false;
let noRepoPlannerCalled = false;
await assert.rejects(
  () =>
    runAiUrlDemo({
      outputRoot: noRepoOutputRoot,
      projectId: "ai-url-demo-no-repo-test",
      createdAt: "2026-06-09T00:00:00.000Z",
      productUrl,
      prompt,
      durationCapSeconds: 10,
      aspectRatio: "16:9",
      analyzeWebsite: async () => {
        noRepoWebsiteAnalyzerCalled = true;
        return { ...productAnalysis, screenshotPath: undefined };
      },
      planner: async () => {
        noRepoPlannerCalled = true;
        throw new Error("planner should not run without repoUrl");
      },
      runTestreel: async (options) => fakeRunTestreel(options.testreelRoot, options.onPhase),
    }),
  /repoUrl is required for AI URL demo generation/,
);

assert.equal(noRepoWebsiteAnalyzerCalled, false);
assert.equal(noRepoPlannerCalled, false);

// understandProduct receives repoCheckoutDirectory; prompt is optional (undefined is accepted).
const repoCheckoutDirOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-repo-checkout-dir-"));
let sawCheckout = false;
await runAiUrlDemo({
  outputRoot: repoCheckoutDirOutputRoot,
  projectId: "ai-url-demo-repo-checkout-dir-test",
  createdAt: "2026-06-09T00:00:00.000Z",
  productUrl,
  repoUrl,
  prompt: undefined,
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  analyzeWebsite: async () => ({ ...productAnalysis, screenshotPath: undefined }),
  analyzeRepo: async (_url, options) => {
    await mkdir(options.checkoutDirectory, { recursive: true });
    return repoAnalysis;
  },
  understandProduct: async (i) => {
    sawCheckout = typeof i.repoCheckoutDirectory === "string";
    return deriveProductUnderstanding(i);
  },
  planner: async () => ({
    storyboard: {
      title: "Repo Checkout Directory Demo",
      durationCapSeconds: 10,
      aspectRatio: "16:9",
      beats: [{ id: "hook", type: "hook", goal: "Introduce product." }],
    },
    recordingPlan,
  }),
  runTestreel: async (options) => fakeRunTestreel(options.testreelRoot, options.onPhase),
});
assert.equal(sawCheckout, true, "understandProduct gets the repo checkout dir");

console.log("run ai url demo tests passed");
