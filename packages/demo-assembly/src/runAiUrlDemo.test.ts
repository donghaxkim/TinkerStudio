import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { CapturePlan, CaptureResult } from "@tinker/browser-capture";
import type { ProductAnalysis } from "@tinker/product-analysis";
import { runAiUrlDemo, type AiUrlDemoPhase } from "./runAiUrlDemo.js";

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

const result = await runAiUrlDemo({
  outputRoot,
  projectId: "ai-url-demo-test",
  createdAt: "2026-06-09T00:00:00.000Z",
  productUrl,
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
  planner: async (input) => {
    assert.equal(input.productUrl, canonicalProductUrl);
    assert.equal(input.prompt, prompt);
    assert.equal(input.durationCapSeconds, 10);
    assert.equal(input.aspectRatio, "16:9");
    assert.deepEqual(input.analysis, productAnalysis);

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
    assert.deepEqual(options, { outputDir: join(outputRoot, "capture"), headless: true });

    return captureResult;
  },
});

assert.deepEqual(phases, ["analysis", "planning", "verification", "capture", "assembly"]);

const expectedPaths = [
  join(outputRoot, "demo-project.json"),
  join(outputRoot, "product-analysis.json"),
  join(outputRoot, "storyboard.json"),
  join(outputRoot, "capture-plan.json"),
  join(outputRoot, "capture-result.json"),
];

for (const path of expectedPaths) {
  assert.ok(result.artifactPaths.includes(path), `Expected artifact path ${path}`);
}

const projectJson = JSON.parse(await readFile(join(outputRoot, "demo-project.json"), "utf8"));
assert.equal(projectJson.metadata.productUrl, productUrl);
assert.equal(projectJson.metadata.prompt, prompt);

console.log("run ai url demo tests passed");
