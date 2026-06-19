import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";
import type { CapturePlan, CaptureResult } from "@tinker/browser-capture";
import type { DemoOutline } from "@tinker/generation-contract";
import { DemoProjectSchema } from "@tinker/project-schema";
import type { NarrativeExploration, ProductAnalysis, RepoAnalysis } from "@tinker/product-analysis";
import { runAiUrlDemo, type AiUrlDemoPhase } from "./runAiUrlDemo.js";
import { deriveProductUnderstanding } from "./productUnderstanding.js";

const outputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-"));
const playwrightOutputRoot = join(outputRoot, "playwright");
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

const approvedOutline: DemoOutline = {
  title: "Fixture approved demo",
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  summary: "Use the approved outline as strong guidance.",
  scenes: [
    { id: "scene-1", goal: "Open with the product promise", visual: "Show the hero.", evidence: ["website"] },
    { id: "scene-2", goal: "Show the workflow", visual: "Click through the main product flow.", evidence: ["repo", "website"] },
  ],
  generationNotes: ["Report gaps rather than failing."],
};

const capturePlan: CapturePlan = {
  targetUrl: canonicalProductUrl,
  viewport: { width: 1280, height: 720 },
  steps: [
    { type: "goto", url: canonicalProductUrl },
    { type: "waitForSelector", selector: "[data-testid='hero']" },
  ],
  expectedCheckpoints: [{ id: "hero", label: "Hero", selector: "[data-testid='hero']" }],
};

const captureResult: CaptureResult = {
  clips: [
    {
      id: "capture-video-main",
      type: "video",
      uri: "videos/main.webm",
      source: "captured",
      mimeType: "video/webm",
      duration: 10,
      width: 1280,
      height: 720,
      sizeBytes: 1234,
    },
  ],
  screenshots: [],
  events: [],
  checkpoints: [{ id: "hero", label: "Hero", selector: "[data-testid='hero']", passed: true }],
  metadata: {
    startedAt: "2026-06-09T00:00:00.000Z",
    completedAt: "2026-06-09T00:00:10.000Z",
    targetUrl: canonicalProductUrl,
    viewport: { width: 1280, height: 720 },
  },
};

const captureResultWithRenderPlanAction: CaptureResult = {
  ...captureResult,
  events: [{ type: "click", time: 1.5, x: 420, y: 260, label: "Start demo" }],
  actionTrace: {
    version: 1,
    targetUrl: canonicalProductUrl,
    viewport: { width: 1280, height: 720 },
    fps: 25,
    startedAt: "2026-06-09T00:00:00.000Z",
    completedAt: "2026-06-09T00:00:10.000Z",
    actions: [
      {
        id: "click-1",
        type: "click",
        description: "Start demo",
        selector: "[data-testid='start-demo']",
        startTime: 1.5,
        endTime: 1.55,
        clickPoint: { x: 420, y: 260 },
        targetBox: { x: 360, y: 230, width: 120, height: 60 },
        status: "success",
      },
    ],
  },
};

async function writeValidHyperframesArtifacts(hyperframesDir: string) {
  await mkdir(hyperframesDir, { recursive: true });
  await writeFile(join(hyperframesDir, "index.html"), "<html><body>Fixture Product</body></html>\n");
  await writeFile(join(hyperframesDir, "asset-manifest.json"), `${JSON.stringify({ assets: [] }, null, 2)}\n`);
  await writeFile(
    join(hyperframesDir, "generation-manifest.json"),
    `${JSON.stringify(
      {
        renderer: "hyperframes",
        productUrl: canonicalProductUrl,
        sourceRepoUrl: repoUrl,
        durationCapSeconds: 10,
        aspectRatio: "16:9",
        sourceGrounding: ["repo", "website-analysis"],
        outputVideoPath: "output.mp4",
      },
      null,
      2,
    )}\n`,
  );
}

async function waitForPath(path: string) {
  const startedAt = Date.now();
  while (!existsSync(path)) {
    if (Date.now() - startedAt > 5_000) {
      throw new Error(`Timed out waiting for ${path}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

const invalidRendererOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-invalid-renderer-"));
let invalidRendererAnalyzeCalled = false;
let invalidRendererRepoAnalyzeCalled = false;
await assert.rejects(
  () =>
    runAiUrlDemo({
      outputRoot: invalidRendererOutputRoot,
      projectId: "ai-url-demo-invalid-renderer-test",
      createdAt: "2026-06-09T00:00:00.000Z",
      productUrl,
      repoUrl,
      renderer: "remotion" as never,
      prompt,
      durationCapSeconds: 10,
      aspectRatio: "16:9",
      analyzeWebsite: async () => {
        invalidRendererAnalyzeCalled = true;
        return productAnalysis;
      },
      analyzeRepo: async () => {
        invalidRendererRepoAnalyzeCalled = true;
        return repoAnalysis;
      },
      generateHyperframes: async () => {
        throw new Error("generateHyperframes should not run for invalid renderer");
      },
      planner: async () => {
        throw new Error("planner should not run for invalid renderer");
      },
      runCapture: async () => {
        throw new Error("runCapture should not run for invalid renderer");
      },
    }),
  /Unknown AI URL renderer: remotion/,
);
assert.equal(invalidRendererAnalyzeCalled, false);
assert.equal(invalidRendererRepoAnalyzeCalled, false);

const defaultRendererOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-default-renderer-"));
const defaultRendererCalls: string[] = [];
const defaultRendererController = new AbortController();
const defaultRendererResult = await runAiUrlDemo({
  outputRoot: defaultRendererOutputRoot,
  projectId: "ai-url-demo-default-renderer-test",
  createdAt: "2026-06-09T00:00:00.000Z",
  productUrl,
  repoUrl,
  prompt,
  approvedOutline,
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  signal: defaultRendererController.signal,
  analyzeWebsite: async (url, options) => {
    assert.equal(url, productUrl);
    assert.equal(options.signal, defaultRendererController.signal);
    return { ...productAnalysis, screenshotPath: undefined };
  },
  analyzeRepo: async (url, options) => {
    assert.equal(url, repoUrl);
    assert.equal(options.signal, defaultRendererController.signal);
    assert.ok(options.checkoutDirectory.endsWith(".repo-scratch/checkout"));
    await mkdir(options.checkoutDirectory, { recursive: true });
    return repoAnalysis;
  },
  generateHyperframes: async (input) => {
    defaultRendererCalls.push("generate");
    assert.equal(input.hyperframesDir, join(defaultRendererOutputRoot, "hyperframes"));
    assert.equal(existsSync(input.repoCheckoutDirectory), true);
    assert.ok(input.repoCheckoutDirectory.endsWith(".repo-scratch/checkout"));
    await writeValidHyperframesArtifacts(input.hyperframesDir);
  },
  runHyperframes: async (input) => {
    defaultRendererCalls.push("render");
    assert.equal(input.hyperframesDir, join(defaultRendererOutputRoot, "hyperframes"));
    assert.equal(input.outputVideoPath, join(defaultRendererOutputRoot, "hyperframes", "output.mp4"));
    assert.equal(input.signal, defaultRendererController.signal);
    await writeFile(input.outputVideoPath, "fake mp4\n");
    return {
      lintLogPath: join(input.hyperframesDir, "lint.log"),
      renderLogPath: join(input.hyperframesDir, "render.log"),
      outputVideoPath: input.outputVideoPath,
    };
  },
  repairHyperframes: async () => {
    throw new Error("repair should not run for valid generated Hyperframes artifacts");
  },
  runCapture: async () => {
    throw new Error("runCapture should not run for default Hyperframes renderer");
  },
});
assert.deepEqual(defaultRendererCalls, ["generate", "render"]);
assert.equal(defaultRendererResult.renderer, "hyperframes");
assert.equal(defaultRendererResult.projectPath, join(defaultRendererOutputRoot, "hyperframes", "output.mp4"));
assert.equal(
  defaultRendererResult.rendererResults.hyperframes?.outputVideoPath,
  join(defaultRendererOutputRoot, "hyperframes", "output.mp4"),
);
assert.ok(defaultRendererResult.artifactPaths.includes(join(defaultRendererOutputRoot, "hyperframes", "index.html")));
assert.ok(defaultRendererResult.artifactPaths.includes(join(defaultRendererOutputRoot, "hyperframes", "output.mp4")));
assert.equal(existsSync(join(defaultRendererOutputRoot, ".repo-scratch")), false);

const agentSignalOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-agent-signal-"));
const agentSignalController = new AbortController();
const agentSignalUnderstanding = deriveProductUnderstanding({ productUrl, repoUrl, websiteAnalysis: productAnalysis, repoAnalysis });
await runAiUrlDemo({
  outputRoot: agentSignalOutputRoot,
  projectId: "ai-url-demo-agent-signal-test",
  createdAt: "2026-06-09T00:00:00.000Z",
  productUrl,
  repoUrl,
  renderer: "playwright",
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
      capturePlan,
    };
  },
  runCapture: async (plan, options) => {
    assert.equal(options.signal, agentSignalController.signal);
    assert.equal(plan.targetUrl, canonicalProductUrl);
    return captureResultWithRenderPlanAction;
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
  renderer: "playwright",
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
  runCapture: async () => captureResult,
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
  renderer: "playwright",
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
  runCapture: async () => captureResult,
});
repoAbortController.abort();
await assert.rejects(repoAbortRun, (error) => error instanceof DOMException && error.name === "AbortError");
assert.equal(repoAbortPlannerCalled, false);

if (process.platform !== "win32") {
  const finalVideoAbortOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-final-video-abort-"));
  const finalVideoAbortToolRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-final-video-abort-tools-"));
  const fakeBinDirectory = join(finalVideoAbortToolRoot, "fake-bin");
  const ffmpegStartedPath = join(finalVideoAbortToolRoot, "ffmpeg-started.txt");
  const ffmpegSigtermPath = join(finalVideoAbortToolRoot, "ffmpeg-sigterm.txt");
  await mkdir(fakeBinDirectory, { recursive: true });
  const fakeFfmpegPath = join(fakeBinDirectory, "ffmpeg");
  await writeFile(
    fakeFfmpegPath,
    [
      "#!/usr/bin/env node",
      "const { writeFileSync } = require('node:fs');",
      `writeFileSync(${JSON.stringify(ffmpegStartedPath)}, 'started');`,
      `process.on('SIGTERM', () => { writeFileSync(${JSON.stringify(ffmpegSigtermPath)}, 'SIGTERM'); process.exit(0); });`,
      "setInterval(() => {}, 1000);",
    ].join("\n"),
  );
  await chmod(fakeFfmpegPath, 0o755);

  const finalVideoAbortController = new AbortController();
  const originalPath = process.env.PATH;
  try {
    process.env.PATH = `${fakeBinDirectory}${delimiter}${originalPath ?? ""}`;
    const runPromise = runAiUrlDemo({
      outputRoot: finalVideoAbortOutputRoot,
      projectId: "ai-url-demo-final-video-abort-test",
      createdAt: "2026-06-09T00:00:00.000Z",
      productUrl,
      repoUrl,
      renderer: "playwright",
      prompt,
      durationCapSeconds: 10,
      aspectRatio: "16:9",
      signal: finalVideoAbortController.signal,
      analyzeWebsite: async () => ({ ...productAnalysis, screenshotPath: undefined }),
      analyzeRepo: async (_url, options) => {
        await mkdir(options.checkoutDirectory, { recursive: true });
        return repoAnalysis;
      },
      planner: async () => ({
        storyboard: {
          title: "Final Video Abort Demo",
          durationCapSeconds: 10,
          aspectRatio: "16:9",
          beats: [{ id: "hook", type: "hook", goal: "Introduce product." }],
        },
        capturePlan,
      }),
      runCapture: async (_plan, options) => {
        const videoPath = join(options.outputDir, "videos", "main.webm");
        await mkdir(join(options.outputDir, "videos"), { recursive: true });
        await writeFile(videoPath, "fake webm bytes");
        return captureResult;
      },
    });

    await waitForPath(ffmpegStartedPath);
    finalVideoAbortController.abort();
    await assert.rejects(runPromise, (error) => error instanceof DOMException && error.name === "AbortError");
    await waitForPath(ffmpegSigtermPath);
  } finally {
    process.env.PATH = originalPath;
    await rm(finalVideoAbortToolRoot, { recursive: true, force: true });
  }
}

const hyperframesScreenshotOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-hyperframes-screenshot-"));
let hyperframesScreenshotGeneratorCalled = false;
await runAiUrlDemo({
  outputRoot: hyperframesScreenshotOutputRoot,
  projectId: "ai-url-demo-hyperframes-screenshot-test",
  createdAt: "2026-06-09T00:00:00.000Z",
  productUrl,
  repoUrl,
  renderer: "hyperframes",
  prompt,
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  analyzeWebsite: async () => {
    const screenshotPath = join(hyperframesScreenshotOutputRoot, "product-analysis.png");
    await writeFile(screenshotPath, "fake png\n");
    return { ...productAnalysis, screenshotPath };
  },
  analyzeRepo: async (_url, options) => {
    await mkdir(options.checkoutDirectory, { recursive: true });
    return repoAnalysis;
  },
  generateHyperframes: async (input) => {
    hyperframesScreenshotGeneratorCalled = true;
    assert.equal(input.websiteAnalysis.screenshotPath, "product-analysis.png");
    assert.equal(existsSync(join(input.hyperframesDir, "product-analysis.png")), true);
    await writeValidHyperframesArtifacts(input.hyperframesDir);
  },
  runHyperframes: async (input) => {
    await writeFile(input.outputVideoPath, "fake mp4\n");
    return {
      lintLogPath: join(input.hyperframesDir, "lint.log"),
      renderLogPath: join(input.hyperframesDir, "render.log"),
      outputVideoPath: input.outputVideoPath,
    };
  },
  repairHyperframes: async () => {
    throw new Error("repair should not run for Hyperframes screenshot handoff test");
  },
  runCapture: async () => {
    throw new Error("runCapture should not run for Hyperframes screenshot handoff test");
  },
});
assert.equal(hyperframesScreenshotGeneratorCalled, true);

const mismatchedHyperframesOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-hyperframes-output-mismatch-"));
await assert.rejects(
  () =>
    runAiUrlDemo({
      outputRoot: mismatchedHyperframesOutputRoot,
      projectId: "ai-url-demo-hyperframes-output-mismatch-test",
      createdAt: "2026-06-09T00:00:00.000Z",
      productUrl,
      repoUrl,
      renderer: "hyperframes",
      prompt,
      durationCapSeconds: 10,
      aspectRatio: "16:9",
      maxHyperframesRepairAttempts: 0,
      analyzeWebsite: async () => ({ ...productAnalysis, screenshotPath: undefined }),
      analyzeRepo: async (_url, options) => {
        await mkdir(options.checkoutDirectory, { recursive: true });
        return repoAnalysis;
      },
      generateHyperframes: async (input) => {
        await writeValidHyperframesArtifacts(input.hyperframesDir);
      },
      runHyperframes: async (input) => {
        const mismatchedOutputPath = join(input.hyperframesDir, "other-output.mp4");
        await writeFile(mismatchedOutputPath, "fake mismatched mp4\n");
        return {
          lintLogPath: join(input.hyperframesDir, "lint.log"),
          renderLogPath: join(input.hyperframesDir, "render.log"),
          outputVideoPath: mismatchedOutputPath,
        };
      },
      repairHyperframes: async () => {
        throw new Error("repair should not run after mismatched render output path");
      },
      runCapture: async () => {
        throw new Error("runCapture should not run for Hyperframes output mismatch test");
      },
    }),
  /Hyperframes render output path must match generated outputVideoPath/,
);

const narrativeSuccessOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-narrative-success-"));
let narrativePlannerSawArtifact = false;
const narrativeSuccessController = new AbortController();
const narrativeSuccessResult = await runAiUrlDemo({
  outputRoot: narrativeSuccessOutputRoot,
  projectId: "ai-url-demo-narrative-success-test",
  createdAt: "2026-06-09T00:00:00.000Z",
  productUrl,
  repoUrl,
  renderer: "playwright",
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
      capturePlan,
    };
  },
  runCapture: async () => captureResult,
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
  renderer: "playwright",
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
      capturePlan,
    };
  },
  runCapture: async () => captureResult,
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
  renderer: "playwright",
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
  runCapture: async () => captureResult,
});
narrativeAbortController.abort();
await assert.rejects(narrativeAbortRun, (error) => error instanceof DOMException && error.name === "AbortError");
assert.equal(narrativeAbortPlannerCalled, false);
assert.deepEqual(narrativeAbortWarnings, []);

const bothOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-both-renderers-"));
const bothCalls: string[] = [];
const bothResult = await runAiUrlDemo({
  outputRoot: bothOutputRoot,
  projectId: "ai-url-demo-both-renderers-test",
  createdAt: "2026-06-09T00:00:00.000Z",
  productUrl,
  repoUrl,
  renderer: "both",
  prompt,
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  analyzeWebsite: async () => ({ ...productAnalysis, screenshotPath: undefined }),
  analyzeRepo: async (_url, options) => {
    await mkdir(options.checkoutDirectory, { recursive: true });
    return repoAnalysis;
  },
  generateHyperframes: async (input) => {
    bothCalls.push("hyperframes:generate");
    assert.equal(existsSync(input.repoCheckoutDirectory), true);
    await writeValidHyperframesArtifacts(input.hyperframesDir);
  },
  runHyperframes: async (input) => {
    bothCalls.push("hyperframes:render");
    await writeFile(input.outputVideoPath, "fake mp4\n");
    return {
      lintLogPath: join(input.hyperframesDir, "lint.log"),
      renderLogPath: join(input.hyperframesDir, "render.log"),
      outputVideoPath: input.outputVideoPath,
    };
  },
  repairHyperframes: async () => {
    throw new Error("repair should not run for valid both-renderer artifacts");
  },
  planner: async (input) => {
    bothCalls.push("playwright:plan");
    assert.equal(existsSync(input.repoCheckoutDirectory ?? ""), true);
    return {
      storyboard: {
        title: "Both Renderers Demo",
        durationCapSeconds: 10,
        aspectRatio: "16:9",
        beats: [{ id: "hook", type: "hook", goal: "Introduce product." }],
      },
      capturePlan,
    };
  },
  runCapture: async () => {
    bothCalls.push("playwright:capture");
    return captureResult;
  },
});

assert.deepEqual(bothCalls, ["playwright:plan", "playwright:capture", "hyperframes:generate", "hyperframes:render"]);
assert.equal(bothResult.renderer, "both");
assert.ok(bothResult.rendererResults.hyperframes);
assert.ok(bothResult.rendererResults.playwright);
assert.ok(bothResult.artifactPaths.some((artifactPath) => artifactPath.startsWith(join(bothOutputRoot, "hyperframes"))));
assert.ok(bothResult.artifactPaths.some((artifactPath) => artifactPath.startsWith(join(bothOutputRoot, "playwright"))));
assert.equal(new Set(bothResult.artifactPaths).size, bothResult.artifactPaths.length);
assert.deepEqual(bothResult.captureCounts, { clips: 2, screenshots: 0, events: 0, checkpoints: 1 });
assert.equal(existsSync(join(bothOutputRoot, ".repo-scratch")), false);

const bothPlaywrightFailureOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-both-playwright-failure-"));
const bothPlaywrightFailureCalls: string[] = [];
await assert.rejects(
  () =>
    runAiUrlDemo({
      outputRoot: bothPlaywrightFailureOutputRoot,
      projectId: "ai-url-demo-both-playwright-failure-test",
      createdAt: "2026-06-09T00:00:00.000Z",
      productUrl,
      repoUrl,
      renderer: "both",
      prompt,
      durationCapSeconds: 10,
      aspectRatio: "16:9",
      analyzeWebsite: async () => ({ ...productAnalysis, screenshotPath: undefined }),
      analyzeRepo: async (_url, options) => {
        await mkdir(options.checkoutDirectory, { recursive: true });
        return repoAnalysis;
      },
      generateHyperframes: async (input) => {
        bothPlaywrightFailureCalls.push("hyperframes:generate");
        await writeValidHyperframesArtifacts(input.hyperframesDir);
      },
      runHyperframes: async (input) => {
        bothPlaywrightFailureCalls.push("hyperframes:render");
        await writeFile(input.outputVideoPath, "fake mp4\n");
        return {
          lintLogPath: join(input.hyperframesDir, "lint.log"),
          renderLogPath: join(input.hyperframesDir, "render.log"),
          outputVideoPath: input.outputVideoPath,
        };
      },
      repairHyperframes: async () => {
        throw new Error("repair should not run for valid both-renderer artifacts before Playwright failure");
      },
      planner: async () => {
        bothPlaywrightFailureCalls.push("playwright:plan");
        throw new Error("Playwright planning failed");
      },
      runCapture: async () => {
        throw new Error("runCapture should not run after Playwright planning failure");
      },
    }),
  /Playwright planning failed/,
);
assert.deepEqual(bothPlaywrightFailureCalls, ["playwright:plan"]);
assert.equal(existsSync(join(bothPlaywrightFailureOutputRoot, ".repo-scratch")), false);

const bothHyperframesFailureOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-both-hyperframes-failure-"));
const bothHyperframesFailureCalls: string[] = [];
await assert.rejects(
  () =>
    runAiUrlDemo({
      outputRoot: bothHyperframesFailureOutputRoot,
      projectId: "ai-url-demo-both-hyperframes-failure-test",
      createdAt: "2026-06-09T00:00:00.000Z",
      productUrl,
      repoUrl,
      renderer: "both",
      prompt,
      durationCapSeconds: 10,
      aspectRatio: "16:9",
      analyzeWebsite: async () => ({ ...productAnalysis, screenshotPath: undefined }),
      analyzeRepo: async (_url, options) => {
        await mkdir(options.checkoutDirectory, { recursive: true });
        return repoAnalysis;
      },
      planner: async () => {
        bothHyperframesFailureCalls.push("playwright:plan");
        return {
          storyboard: {
            title: "Both Renderers Hyperframes Failure Demo",
            durationCapSeconds: 10,
            aspectRatio: "16:9",
            beats: [{ id: "hook", type: "hook", goal: "Introduce product." }],
          },
          capturePlan,
        };
      },
      runCapture: async () => {
        bothHyperframesFailureCalls.push("playwright:capture");
        return captureResult;
      },
      generateHyperframes: async (input) => {
        bothHyperframesFailureCalls.push("hyperframes:generate");
        await writeValidHyperframesArtifacts(input.hyperframesDir);
      },
      runHyperframes: async () => {
        bothHyperframesFailureCalls.push("hyperframes:render");
        throw new Error("Hyperframes render failed after Playwright");
      },
      repairHyperframes: async () => {
        throw new Error("repair should not run when both-mode Hyperframes retries are disabled");
      },
      maxHyperframesRepairAttempts: 0,
    }),
  /Hyperframes render failed after Playwright/,
);
assert.deepEqual(bothHyperframesFailureCalls, ["playwright:plan", "playwright:capture", "hyperframes:generate", "hyperframes:render"]);
assert.equal(existsSync(join(bothHyperframesFailureOutputRoot, ".repo-scratch")), false);

const repairOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-hyperframes-repair-"));
const repairCalls: Array<{ failureStage: string; logText: string }> = [];
let renderAttempts = 0;
const repairedResult = await runAiUrlDemo({
  outputRoot: repairOutputRoot,
  projectId: "ai-url-demo-hyperframes-repair-test",
  createdAt: "2026-06-09T00:00:00.000Z",
  productUrl,
  repoUrl,
  renderer: "hyperframes",
  hyperframesAgent: "opencode",
  prompt,
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  analyzeWebsite: async () => ({ ...productAnalysis, screenshotPath: undefined }),
  analyzeRepo: async (_url, options) => {
    await mkdir(options.checkoutDirectory, { recursive: true });
    return repoAnalysis;
  },
  generateHyperframes: async (input) => {
    assert.equal(input.hyperframesAgent, "opencode");
    await writeValidHyperframesArtifacts(input.hyperframesDir);
  },
  runHyperframes: async (input) => {
    renderAttempts += 1;
    if (renderAttempts === 1) {
      await writeFile(join(input.hyperframesDir, "render.log"), "actual render stack trace\nmissing component export\n");
      throw new Error("Hyperframes render failed; see render.log");
    }

    await writeFile(input.outputVideoPath, "fake repaired mp4\n");
    return {
      lintLogPath: join(input.hyperframesDir, "lint.log"),
      renderLogPath: join(input.hyperframesDir, "render.log"),
      outputVideoPath: input.outputVideoPath,
    };
  },
  repairHyperframes: async (input) => {
    repairCalls.push({ failureStage: input.failureStage, logText: input.logText });
    assert.equal(existsSync(input.repoCheckoutDirectory), true);
    assert.equal(input.hyperframesAgent, "opencode");
  },
  runCapture: async () => {
    throw new Error("runCapture should not run for Hyperframes repair test");
  },
});

assert.equal(renderAttempts, 2);
assert.deepEqual(repairCalls, [{ failureStage: "render", logText: "actual render stack trace\nmissing component export\n" }]);
assert.equal(repairedResult.rendererResults.hyperframes?.outputVideoPath, join(repairOutputRoot, "hyperframes", "output.mp4"));
assert.equal(existsSync(join(repairOutputRoot, ".repo-scratch")), false);

const lintPathRenderFailureOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-lint-path-render-failure-"));
const lintPathRenderRepairCalls: Array<{ failureStage: string; logText: string }> = [];
let lintPathRenderAttempts = 0;
await runAiUrlDemo({
  outputRoot: lintPathRenderFailureOutputRoot,
  projectId: "ai-url-demo-lint-path-render-failure-test",
  createdAt: "2026-06-09T00:00:00.000Z",
  productUrl,
  repoUrl,
  renderer: "hyperframes",
  prompt,
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  analyzeWebsite: async () => ({ ...productAnalysis, screenshotPath: undefined }),
  analyzeRepo: async (_url, options) => {
    await mkdir(options.checkoutDirectory, { recursive: true });
    return repoAnalysis;
  },
  generateHyperframes: async (input) => {
    await writeValidHyperframesArtifacts(input.hyperframesDir);
  },
  runHyperframes: async (input) => {
    lintPathRenderAttempts += 1;
    if (lintPathRenderAttempts === 1) {
      await writeFile(join(input.hyperframesDir, "render.log"), "render failed under lint-named output path\n");
      throw new Error(`Hyperframes render failed for ${input.outputVideoPath}; see render.log`);
    }

    await writeFile(input.outputVideoPath, "fake repaired mp4\n");
    return {
      lintLogPath: join(input.hyperframesDir, "lint.log"),
      renderLogPath: join(input.hyperframesDir, "render.log"),
      outputVideoPath: input.outputVideoPath,
    };
  },
  repairHyperframes: async (input) => {
    lintPathRenderRepairCalls.push({ failureStage: input.failureStage, logText: input.logText });
  },
  runCapture: async () => {
    throw new Error("runCapture should not run for lint-path render failure test");
  },
});

assert.equal(lintPathRenderAttempts, 2);
assert.deepEqual(lintPathRenderRepairCalls, [
  { failureStage: "render", logText: "render failed under lint-named output path\n" },
]);

const oversizedRepairLogOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-hyperframes-repair-log-"));
const oversizedRenderLog = `render failure detail\n${"x".repeat(25_000)}`;
const oversizedRepairLogTexts: string[] = [];
let oversizedRepairRenderAttempts = 0;
await runAiUrlDemo({
  outputRoot: oversizedRepairLogOutputRoot,
  projectId: "ai-url-demo-hyperframes-repair-log-test",
  createdAt: "2026-06-09T00:00:00.000Z",
  productUrl,
  repoUrl,
  renderer: "hyperframes",
  prompt,
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  analyzeWebsite: async () => ({ ...productAnalysis, screenshotPath: undefined }),
  analyzeRepo: async (_url, options) => {
    await mkdir(options.checkoutDirectory, { recursive: true });
    return repoAnalysis;
  },
  generateHyperframes: async (input) => {
    await writeValidHyperframesArtifacts(input.hyperframesDir);
  },
  runHyperframes: async (input) => {
    oversizedRepairRenderAttempts += 1;
    if (oversizedRepairRenderAttempts === 1) {
      await writeFile(join(input.hyperframesDir, "render.log"), oversizedRenderLog);
      throw new Error("Hyperframes render failed; see render.log");
    }

    await writeFile(input.outputVideoPath, "fake repaired mp4\n");
    return {
      lintLogPath: join(input.hyperframesDir, "lint.log"),
      renderLogPath: join(input.hyperframesDir, "render.log"),
      outputVideoPath: input.outputVideoPath,
    };
  },
  repairHyperframes: async (input) => {
    oversizedRepairLogTexts.push(input.logText);
  },
  runCapture: async () => {
    throw new Error("runCapture should not run for oversized repair log test");
  },
});

assert.deepEqual(oversizedRepairLogTexts, [oversizedRenderLog.slice(0, 20_000)]);

const validationRendererTextOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-validation-renderer-text-"));
const validationRendererTextRepairStages: string[] = [];
let validationRendererTextRenderAttempts = 0;
await runAiUrlDemo({
  outputRoot: validationRendererTextOutputRoot,
  projectId: "ai-url-demo-validation-renderer-text-test",
  createdAt: "2026-06-09T00:00:00.000Z",
  productUrl,
  repoUrl,
  renderer: "hyperframes",
  prompt,
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  analyzeWebsite: async () => ({ ...productAnalysis, screenshotPath: undefined }),
  analyzeRepo: async (_url, options) => {
    await mkdir(options.checkoutDirectory, { recursive: true });
    return repoAnalysis;
  },
  generateHyperframes: async (input) => {
    await writeValidHyperframesArtifacts(input.hyperframesDir);
    await writeFile(
      join(input.hyperframesDir, "generation-manifest.json"),
      `${JSON.stringify(
        {
          renderer: "playwright",
          productUrl: canonicalProductUrl,
          sourceRepoUrl: repoUrl,
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
  runHyperframes: async (input) => {
    validationRendererTextRenderAttempts += 1;
    await writeFile(input.outputVideoPath, "fake repaired mp4\n");
    return {
      lintLogPath: join(input.hyperframesDir, "lint.log"),
      renderLogPath: join(input.hyperframesDir, "render.log"),
      outputVideoPath: input.outputVideoPath,
    };
  },
  repairHyperframes: async (input) => {
    validationRendererTextRepairStages.push(input.failureStage);
    assert.match(input.logText, /renderer/);
    await writeValidHyperframesArtifacts(input.hyperframesDir);
  },
  runCapture: async () => {
    throw new Error("runCapture should not run for validation renderer text test");
  },
});

assert.deepEqual(validationRendererTextRepairStages, ["validation"]);
assert.equal(validationRendererTextRenderAttempts, 1);

const validationThenLintRepairOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-validation-then-lint-"));
const validationThenLintRepairStages: string[] = [];
let validationThenLintRenderAttempts = 0;
await runAiUrlDemo({
  outputRoot: validationThenLintRepairOutputRoot,
  projectId: "ai-url-demo-validation-then-lint-repair-test",
  createdAt: "2026-06-09T00:00:00.000Z",
  productUrl,
  repoUrl,
  renderer: "hyperframes",
  prompt,
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  analyzeWebsite: async () => ({ ...productAnalysis, screenshotPath: undefined }),
  analyzeRepo: async (_url, options) => {
    await mkdir(options.checkoutDirectory, { recursive: true });
    return repoAnalysis;
  },
  generateHyperframes: async (input) => {
    await writeValidHyperframesArtifacts(input.hyperframesDir);
    await writeFile(
      join(input.hyperframesDir, "generation-manifest.json"),
      `${JSON.stringify(
        {
          renderer: "hyperframes",
          productUrl: canonicalProductUrl,
          sourceRepoUrl: repoUrl,
          durationCapSeconds: 10,
          aspectRatio: "16:9",
          sourceGrounding: ["repo", "website-analysis"],
          outputVideoPath: "output.mp4",
          evidence: "invalid extra key that should be repaired first",
        },
        null,
        2,
      )}\n`,
    );
  },
  runHyperframes: async (input) => {
    validationThenLintRenderAttempts += 1;
    if (validationThenLintRenderAttempts === 1) {
      await writeFile(join(input.hyperframesDir, "lint.log"), "root_missing_composition_id\nmissing_timeline_registry\n");
      throw new Error("Hyperframes lint failed; see lint.log");
    }

    await writeFile(input.outputVideoPath, "fake repaired mp4\n");
    return {
      lintLogPath: join(input.hyperframesDir, "lint.log"),
      renderLogPath: join(input.hyperframesDir, "render.log"),
      outputVideoPath: input.outputVideoPath,
    };
  },
  repairHyperframes: async (input) => {
    validationThenLintRepairStages.push(input.failureStage);
    if (input.failureStage === "validation") {
      assert.match(input.logText, /evidence/);
      await writeValidHyperframesArtifacts(input.hyperframesDir);
      return;
    }

    assert.equal(input.failureStage, "lint");
    assert.match(input.logText, /root_missing_composition_id/);
  },
  runCapture: async () => {
    throw new Error("runCapture should not run for validation-then-lint repair test");
  },
});

assert.deepEqual(validationThenLintRepairStages, ["validation", "lint"]);
assert.equal(validationThenLintRenderAttempts, 2);

const negativeRepairAttemptsOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-negative-repairs-"));
let negativeRepairRenderAttempts = 0;
const negativeRepairAttemptsResult = await runAiUrlDemo({
  outputRoot: negativeRepairAttemptsOutputRoot,
  projectId: "ai-url-demo-negative-repairs-test",
  createdAt: "2026-06-09T00:00:00.000Z",
  productUrl,
  repoUrl,
  renderer: "hyperframes",
  prompt,
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  maxHyperframesRepairAttempts: -1,
  analyzeWebsite: async () => ({ ...productAnalysis, screenshotPath: undefined }),
  analyzeRepo: async (_url, options) => {
    await mkdir(options.checkoutDirectory, { recursive: true });
    return repoAnalysis;
  },
  generateHyperframes: async (input) => {
    await writeValidHyperframesArtifacts(input.hyperframesDir);
  },
  runHyperframes: async (input) => {
    negativeRepairRenderAttempts += 1;
    await writeFile(input.outputVideoPath, "fake mp4\n");
    return {
      lintLogPath: join(input.hyperframesDir, "lint.log"),
      renderLogPath: join(input.hyperframesDir, "render.log"),
      outputVideoPath: input.outputVideoPath,
    };
  },
  repairHyperframes: async () => {
    throw new Error("repair should not run when repair attempts clamp to zero");
  },
  runCapture: async () => {
    throw new Error("runCapture should not run for negative repair attempts test");
  },
});

assert.equal(negativeRepairRenderAttempts, 1);
assert.equal(
  negativeRepairAttemptsResult.rendererResults.hyperframes?.outputVideoPath,
  join(negativeRepairAttemptsOutputRoot, "hyperframes", "output.mp4"),
);

const result = await runAiUrlDemo({
  outputRoot,
  projectId: "ai-url-demo-test",
  createdAt: "2026-06-09T00:00:00.000Z",
  productUrl,
  repoUrl,
  renderer: "playwright",
  prompt,
  approvedOutline,
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
    assert.deepEqual(input.approvedOutline, approvedOutline);
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
      capturePlan,
    };
  },
  runCapture: async (plan, options) => {
    assert.deepEqual(plan, capturePlan);
    assert.deepEqual(options, { outputDir: join(outputRoot, "playwright", "capture"), headless: true, smooth: true });

    return captureResultWithRenderPlanAction;
  },
});

assert.deepEqual(phases, ["analysis", "understanding", "strategy", "planning", "verification", "capture", "assembly"]);

const expectedPaths = [
  join(playwrightOutputRoot, "demo-project.json"),
  join(outputRoot, "product-analysis.json"),
  join(outputRoot, "repo-analysis.json"),
  join(playwrightOutputRoot, "storyboard.json"),
  join(playwrightOutputRoot, "capture-plan.json"),
  join(playwrightOutputRoot, "capture-result.json"),
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

const runInputJson = JSON.parse(await readFile(join(outputRoot, "input.json"), "utf8"));
assert.deepEqual(runInputJson.approvedOutline, approvedOutline);

const approvedLineageJson = JSON.parse(await readFile(join(playwrightOutputRoot, "approved-outline-lineage.json"), "utf8"));
assert.equal(approvedLineageJson.approvedOutlinePresent, true);
assert.deepEqual(
  approvedLineageJson.items.map((item: { sceneId: string }) => item.sceneId),
  ["scene-1", "scene-2"],
);
assert.deepEqual(runSummaryJson.approvedOutlineCoverage.items, approvedLineageJson.items);
assert.ok(runSummaryJson.generatedArtifacts.includes("playwright/approved-outline-lineage.json"));
for (const warning of approvedLineageJson.warnings) {
  assert.ok(runSummaryJson.warnings.includes(warning), `run-summary warnings should include ${warning}`);
}

assert.ok(runSummaryJson.execution, "run-summary has an execution block");
// backend is OFF in tests (no TINKER_AGENT_BACKEND) → deterministic modes.
assert.equal(runSummaryJson.execution.understandingMode, "deterministic");
assert.equal(runSummaryJson.execution.strategyMode, "deterministic");
// render-plan zooms are materialized into demo-project.json before EDL trimming.
assert.equal(runSummaryJson.execution.directorPlanApplied, "none");
assert.equal(runSummaryJson.execution.renderPlanApplied, "full");
assert.ok(runSummaryJson.execution.cameraSource.length > 0);
// coreCoverage exists with the stricter selected-flow item.
assert.ok(Array.isArray(runSummaryJson.coreCoverage) && runSummaryJson.coreCoverage.length >= 1);
assert.ok(runSummaryJson.coreCoverage.some((i: { sourceType: string; required: boolean }) => i.sourceType === "selected-flow" && i.required === true));

// Both storyboards (strategic root + playwright capture) and the run summary exist on disk
// AND are listed in run-summary.generatedArtifacts (clear, non-ambiguous artifact map).
assert.ok(existsSync(join(outputRoot, "storyboard.json")), "root strategic storyboard.json must exist");
assert.ok(existsSync(join(playwrightOutputRoot, "storyboard.json")), "playwright capture storyboard.json must exist");
assert.ok(existsSync(join(outputRoot, "run-summary.json")), "run-summary.json must exist");
for (const listed of ["storyboard.json", "playwright/storyboard.json", "run-summary.json"]) {
  assert.ok(
    runSummaryJson.generatedArtifacts.includes(listed),
    `run-summary.generatedArtifacts should list ${listed}`,
  );
}

// capture-lineage.json is a first-class artifact mapping every capture step to a beat.
const captureLineageJson = JSON.parse(await readFile(join(playwrightOutputRoot, "capture-lineage.json"), "utf8"));
assert.equal(captureLineageJson.version, 1);
assert.ok(captureLineageJson.steps.length >= 1, "capture-lineage should have step entries");
assert.ok(
  captureLineageJson.steps.every((step: { beatId?: string }) => typeof step.beatId === "string" && step.beatId.length > 0),
  "every capture-lineage step should reference a beat",
);
assert.ok(runSummaryJson.generatedArtifacts.includes("playwright/capture-lineage.json"));

// action-trace.json entries carry best-effort storyboard-beat lineage.
const actionTraceJson = JSON.parse(await readFile(join(playwrightOutputRoot, "action-trace.json"), "utf8"));
assert.ok(
  actionTraceJson.actions.every((action: { beatId?: string }) => typeof action.beatId === "string" && action.beatId.length > 0),
  "every traced action should be stamped with a storyboard beatId",
);

const projectJson = JSON.parse(await readFile(join(playwrightOutputRoot, "demo-project.json"), "utf8"));
assert.equal(projectJson.metadata.productUrl, productUrl);
assert.equal(projectJson.metadata.prompt, prompt);
assert.ok(
  projectJson.zooms.some((zoom: { id: string }) => zoom.id.startsWith("render-plan-")),
  "demo-project.json should include materialized render-plan zooms",
);
const parsedProject = DemoProjectSchema.parse(projectJson);
assert.equal(result.renderer, "playwright");
assert.equal(result.rendererResults.playwright?.projectPath, join(playwrightOutputRoot, "demo-project.json"));
assert.equal(result.projectPath, join(playwrightOutputRoot, "demo-project.json"));
assert.equal(parsedProject.metadata.productUrl, productUrl);
const repoAnalysisJson = JSON.parse(await readFile(join(outputRoot, "repo-analysis.json"), "utf8"));
assert.deepEqual(repoAnalysisJson, repoAnalysis);
assert.equal(projectJson.metadata.sourceRepoUrl, repoUrl);
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
      renderer: "playwright",
      prompt,
      durationCapSeconds: 10,
      aspectRatio: "16:9",
      analyzeWebsite: async () => ({ ...productAnalysis, screenshotPath: undefined }),
      analyzeRepo: async () => ({ ...repoAnalysis, repoUrl: "https://github.com/example/other" }),
      planner: async () => {
        throw new Error("planner should not run with mismatched repo analysis");
      },
      runCapture: async () => captureResult,
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
      renderer: "playwright",
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
      runCapture: async () => captureResult,
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
    renderer: "playwright",
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
    runCapture: async () => captureResult,
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
      renderer: "playwright",
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
      runCapture: async () => captureResult,
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
  renderer: "hyperframes",
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
  generateHyperframes: async (input) => {
    await writeValidHyperframesArtifacts(input.hyperframesDir);
  },
  runHyperframes: async (input) => {
    await writeFile(input.outputVideoPath, "fake mp4\n");
    return {
      lintLogPath: join(input.hyperframesDir, "lint.log"),
      renderLogPath: join(input.hyperframesDir, "render.log"),
      outputVideoPath: input.outputVideoPath,
    };
  },
  repairHyperframes: async () => {
    throw new Error("repair should not run for repo-checkout-dir test");
  },
  runCapture: async () => {
    throw new Error("runCapture should not run for repo-checkout-dir test");
  },
});
assert.equal(sawCheckout, true, "understandProduct gets the repo checkout dir");

console.log("run ai url demo tests passed");
