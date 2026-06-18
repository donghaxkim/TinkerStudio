import assert from "node:assert/strict";
import type { CapturePlan } from "@tinker/browser-capture";
import { CaptureLineageSchema, beatIndexForPosition, buildCaptureLineage } from "./captureLineage.js";
import { deriveDemoStrategy } from "./demoStrategy.js";
import { deriveProductUnderstanding } from "./productUnderstanding.js";
import type { ProductAnalysis } from "@tinker/product-analysis";

// beatIndexForPosition: degenerate inputs never throw and stay in range.
assert.equal(beatIndexForPosition(0, 0, 4), 0);
assert.equal(beatIndexForPosition(3, 6, 0), 0);
assert.equal(beatIndexForPosition(0, 6, 4), 0);
assert.equal(beatIndexForPosition(5, 6, 4), 3);
for (let i = 0; i < 6; i += 1) {
  const b = beatIndexForPosition(i, 6, 4);
  assert.ok(b >= 0 && b <= 3, `index ${i} mapped out of range: ${b}`);
}

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
const understanding = deriveProductUnderstanding({ productUrl: "https://example.com/", prompt: "Show it.", websiteAnalysis });
const { storyboard } = deriveDemoStrategy({ understanding, prompt: "Show it.", durationCapSeconds: 30, aspectRatio: "16:9" });

const capturePlan: CapturePlan = {
  targetUrl: "https://example.com/",
  viewport: { width: 1280, height: 720 },
  steps: [
    { type: "goto", url: "https://example.com/" },
    { type: "waitForSelector", selector: "[data-testid='hero']" },
    { type: "scroll", y: 400 },
    { type: "click", selector: "[data-testid='cta']" },
    { type: "type", selector: "[data-testid='email']", text: "demo@tinker.dev" },
  ],
  expectedCheckpoints: [],
};

const lineage = buildCaptureLineage(capturePlan, storyboard);
CaptureLineageSchema.parse(lineage);
assert.equal(lineage.version, 1);

// One lineage entry per capture step, indexed in order.
assert.equal(lineage.steps.length, capturePlan.steps.length);
lineage.steps.forEach((step, index) => assert.equal(step.stepIndex, index));

// Every step maps to a real storyboard beat, and selectors are carried through.
const beatIds = new Set(storyboard.beats.map((beat) => beat.id));
for (const step of lineage.steps) {
  assert.ok(beatIds.has(step.beatId), `lineage step references unknown beat ${step.beatId}`);
  assert.ok(step.intent.length > 0, "lineage step should carry an intent");
}
assert.equal(lineage.steps[3].selector, "[data-testid='cta']");
assert.equal(lineage.steps[0].selector, undefined);

// note records that the mapping is derived, not planner-emitted.
assert.match(lineage.note, /not planner-emitted/);

console.log("captureLineage.test PASS");
