import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { CapturePlan, CaptureResult } from "@tinker/browser-capture";
import type { ProductAnalysis, RepoAnalysis } from "@tinker/product-analysis";
import { runAiUrlDemo, type AiUrlDemoPhase } from "./runAiUrlDemo.js";

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

const defaultRendererOutputRoot = await mkdtemp(join(tmpdir(), "tinker-ai-url-demo-default-renderer-"));
let defaultRendererAnalyzeCalled = false;
await assert.rejects(
  () =>
    runAiUrlDemo({
      outputRoot: defaultRendererOutputRoot,
      projectId: "ai-url-demo-default-renderer-test",
      createdAt: "2026-06-09T00:00:00.000Z",
      productUrl,
      prompt,
      durationCapSeconds: 10,
      aspectRatio: "16:9",
      analyzeWebsite: async () => {
        defaultRendererAnalyzeCalled = true;
        return productAnalysis;
      },
      planner: async () => {
        throw new Error("planner should not run for unsupported renderer");
      },
      runCapture: async () => captureResult,
    }),
  /Hyperframes renderer is not implemented yet/,
);
assert.equal(defaultRendererAnalyzeCalled, false);

const result = await runAiUrlDemo({
  outputRoot,
  projectId: "ai-url-demo-test",
  createdAt: "2026-06-09T00:00:00.000Z",
  productUrl,
  repoUrl,
  renderer: "playwright",
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
            narration: "Build demos faster with Fixture Product.",
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
    assert.deepEqual(options, { outputDir: join(outputRoot, "playwright", "capture"), headless: true });

    return captureResult;
  },
});

assert.deepEqual(phases, ["analysis", "planning", "verification", "capture", "assembly"]);

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

const projectJson = JSON.parse(await readFile(join(playwrightOutputRoot, "demo-project.json"), "utf8"));
assert.equal(projectJson.metadata.productUrl, productUrl);
assert.equal(projectJson.metadata.prompt, prompt);
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
let noRepoAnalyzerCalled = false;
const noRepoResult = await runAiUrlDemo({
  outputRoot: noRepoOutputRoot,
  projectId: "ai-url-demo-no-repo-test",
  createdAt: "2026-06-09T00:00:00.000Z",
  productUrl,
  renderer: "playwright",
  prompt,
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  analyzeWebsite: async () => ({ ...productAnalysis, screenshotPath: undefined }),
  analyzeRepo: async () => {
    noRepoAnalyzerCalled = true;
    throw new Error("repo analyzer should not run without repoUrl");
  },
  planner: async (input) => {
    assert.equal(input.repoAnalysis, undefined);
    return {
      storyboard: {
        title: "No Repo Demo",
        durationCapSeconds: 10,
        aspectRatio: "16:9",
        beats: [{ id: "hook", type: "hook", goal: "Introduce product." }],
      },
      capturePlan,
    };
  },
  runCapture: async () => captureResult,
});

assert.equal(noRepoAnalyzerCalled, false);
assert.equal(noRepoResult.artifactPaths.includes(join(noRepoOutputRoot, "repo-analysis.json")), false);
assert.equal(existsSync(join(noRepoOutputRoot, "repo-analysis.json")), false);

console.log("run ai url demo tests passed");
