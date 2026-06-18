import assert from "node:assert/strict";
import {
  DemoStrategySchema,
  StoryboardSchema,
  deriveDemoStrategy,
  selectFlow,
} from "./demoStrategy.js";
import { deriveProductUnderstanding } from "./productUnderstanding.js";
import type { ProductAnalysis, RepoAnalysis } from "@tinker/product-analysis";

const websiteAnalysis: ProductAnalysis = {
  url: "https://example.com/",
  title: "LongCut",
  headings: ["Turn long videos into highlights"],
  bodySnippets: ["LongCut analyzes long videos and produces shareable highlights."],
  links: [],
  buttons: ["Analyze", "Export"],
  inputs: [{ label: "YouTube URL", placeholder: "https://youtube.com/...", selectorHint: "[data-testid='url']" }],
  brandHints: { colors: ["#111"], fontFamilies: ["Inter"] },
};

const repoAnalysis: RepoAnalysis = {
  repoUrl: "https://github.com/example/longcut",
  productName: "LongCut",
  summary: "LongCut turns long-form video into highlight reels.",
  features: ["Highlight detection", "Transcript chat"],
  likelyRoutes: ["/"],
  demoIdeas: ["Open the transcript chat", "Paste a YouTube URL and generate highlights"],
  importantTerms: ["video"],
  setupNotes: [],
  sourceHints: [],
};

const understanding = deriveProductUnderstanding({
  productUrl: "https://example.com/",
  repoUrl: repoAnalysis.repoUrl,
  prompt: "Show how a user pastes a YouTube URL and generates highlights.",
  websiteAnalysis,
  repoAnalysis,
});

// ---- selectFlow honours the prompt over document order ----
// "Open the transcript chat" comes first in demoIdeas, but the prompt is about the
// YouTube URL flow, so the strategist must select that one.
const chosen = selectFlow(understanding.demoableFlows, "Show how a user pastes a YouTube URL and generates highlights.");
assert.ok(/youtube url/i.test(chosen.name), `expected the URL flow to win, got "${chosen.name}"`);

// ---- deriveDemoStrategy: schema-valid strategy + storyboard ----
const { strategy, storyboard } = deriveDemoStrategy({
  understanding,
  prompt: "Show how a user pastes a YouTube URL and generates highlights.",
  durationCapSeconds: 45,
  aspectRatio: "16:9",
});

DemoStrategySchema.parse(strategy);
StoryboardSchema.parse(storyboard);

assert.equal(strategy.version, 1);
assert.equal(strategy.selectedFlow.sourceFlowId, chosen.id);
assert.equal(strategy.selectedFlow.name, chosen.name);
assert.ok(strategy.messageHierarchy.length >= 1, "message hierarchy must not be empty");
assert.ok(strategy.successCriteria.some((criterion) => /45s/.test(criterion)), "duration criterion should be present");

// ---- Storyboard lineage: beats reference real strategy messages + capabilities ----
assert.equal(storyboard.durationTargetSeconds, 45);
assert.equal(storyboard.aspectRatio, "16:9");
assert.ok(storyboard.beats.length >= 3, "expected a multi-beat story");

const messageIds = new Set(strategy.messageHierarchy.map((_message, index) => `message-${index + 1}`));
const capabilityIds = new Set(understanding.capabilities.map((capability) => capability.id));
for (const beat of storyboard.beats) {
  assert.ok(messageIds.has(beat.strategyMessageId), `beat ${beat.id} references unknown message ${beat.strategyMessageId}`);
  assert.ok(capabilityIds.has(beat.proofPointId), `beat ${beat.id} references unknown capability ${beat.proofPointId}`);
  assert.ok(
    beat.startHint !== undefined && beat.endHint !== undefined && beat.endHint > beat.startHint,
    `beat ${beat.id} should have ordered timing`,
  );
  assert.ok(beat.endHint <= 45, `beat ${beat.id} must end within the duration`);
}

// Beats stay in chronological order.
for (let index = 1; index < storyboard.beats.length; index += 1) {
  const previous = storyboard.beats[index - 1];
  const current = storyboard.beats[index];
  assert.ok((current.startHint ?? 0) >= (previous.startHint ?? 0), "beats must be ordered by start time");
}

console.log("demoStrategy.test PASS");
