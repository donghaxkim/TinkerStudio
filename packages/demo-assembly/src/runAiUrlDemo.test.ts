import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
const defaultRendererResult = await runAiUrlDemo({
  outputRoot: defaultRendererOutputRoot,
  projectId: "ai-url-demo-default-renderer-test",
  createdAt: "2026-06-09T00:00:00.000Z",
  productUrl,
  repoUrl,
  prompt,
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  analyzeWebsite: async (url) => {
    assert.equal(url, productUrl);
    return { ...productAnalysis, screenshotPath: undefined };
  },
  analyzeRepo: async (url, options) => {
    assert.equal(url, repoUrl);
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
assert.equal(existsSync(join(defaultRendererOutputRoot, ".repo-scratch")), false);

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

console.log("run ai url demo tests passed");
