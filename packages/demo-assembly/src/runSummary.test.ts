import assert from "node:assert/strict";
import { join } from "node:path";
import {
  RunInputSchema,
  RunSummarySchema,
  buildRunInput,
  buildRunSummary,
} from "./runSummary.js";
import { deriveDemoStrategy } from "./demoStrategy.js";
import { deriveProductUnderstanding } from "./productUnderstanding.js";
import type { ProductAnalysis } from "@tinker/product-analysis";

const websiteAnalysis: ProductAnalysis = {
  url: "https://example.com/",
  title: "Demo Product",
  headings: ["Do the thing"],
  bodySnippets: ["Demo Product does the thing."],
  links: [],
  buttons: ["Start"],
  inputs: [],
  brandHints: { colors: [], fontFamilies: [] },
};

const understanding = deriveProductUnderstanding({
  productUrl: "https://example.com/",
  prompt: "Show the main flow.",
  websiteAnalysis,
});
const { storyboard } = deriveDemoStrategy({
  understanding,
  prompt: "Show the main flow.",
  durationCapSeconds: 30,
  aspectRatio: "16:9",
});

// ---- input.json shape ----
const input = buildRunInput({
  projectId: "run-123",
  createdAt: "2026-06-17T00:00:00.000Z",
  productUrl: "https://example.com/",
  repoUrl: "https://github.com/example/product",
  prompt: "Show the main flow.",
  durationCapSeconds: 30,
  aspectRatio: "16:9",
  renderer: "playwright",
});
RunInputSchema.parse(input);
assert.equal(input.version, 1);
assert.equal(input.renderer, "playwright");
assert.equal(input.repoUrl, "https://github.com/example/product");

// repoUrl is omitted when absent (not stored as undefined string).
const inputNoRepo = buildRunInput({
  projectId: "run-124",
  createdAt: "2026-06-17T00:00:00.000Z",
  productUrl: "https://example.com/",
  prompt: "",
  durationCapSeconds: 30,
  aspectRatio: "9:16",
  renderer: "hyperframes",
});
RunInputSchema.parse(inputNoRepo);
assert.equal("repoUrl" in inputNoRepo, false);

// ---- run-summary.json: success path with final.mp4 ----
const outputRoot = "/tmp/generated/run-123";
const artifactPaths = [
  join(outputRoot, "product-understanding.json"),
  join(outputRoot, "demo-strategy.json"),
  join(outputRoot, "storyboard.json"),
  join(outputRoot, "playwright", "capture-plan.json"),
  join(outputRoot, "playwright", "capture-result.json"),
  join(outputRoot, "playwright", "action-trace.json"),
  join(outputRoot, "playwright", "render-plan.json"),
  join(outputRoot, "playwright", "final.mp4"),
];

const summary = buildRunSummary({
  renderer: "playwright",
  outputRoot,
  storyboard,
  artifactPaths,
  captureSucceeded: true,
  finalVideoProduced: true,
  warnings: ["a warning"],
});
RunSummarySchema.parse(summary);
assert.equal(summary.status, "success");
assert.equal(summary.nextRecommendedAction, "review final.mp4");
// Paths are made run-relative.
assert.ok(summary.generatedArtifacts.includes("playwright/final.mp4"));
assert.ok(summary.generatedArtifacts.includes("storyboard.json"));
// Coverage maps every storyboard beat and cites the produced video.
assert.equal(summary.storyboardCoverage.length, storyboard.beats.length);
assert.ok(summary.storyboardCoverage.every((coverage) => coverage.status === "captured"));
assert.ok(summary.storyboardCoverage[0].evidence.includes("playwright/final.mp4"));

// ---- run-summary.json: capture succeeded but ffmpeg unavailable ----
const noVideoSummary = buildRunSummary({
  renderer: "playwright",
  outputRoot,
  storyboard,
  artifactPaths: artifactPaths.filter((path) => !path.endsWith("final.mp4")),
  captureSucceeded: true,
  finalVideoProduced: false,
  warnings: [],
});
RunSummarySchema.parse(noVideoSummary);
assert.equal(noVideoSummary.status, "success");
assert.match(noVideoSummary.nextRecommendedAction, /ffmpeg/);
assert.ok(!noVideoSummary.storyboardCoverage[0].evidence.includes("playwright/final.mp4"));

console.log("runSummary.test PASS");
