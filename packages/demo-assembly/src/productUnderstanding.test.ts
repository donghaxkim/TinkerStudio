import assert from "node:assert/strict";
import type { ProductAnalysis, RepoAnalysis } from "@tinker/product-analysis";
import {
  ProductUnderstandingSchema,
  deriveProductUnderstanding,
} from "./productUnderstanding.js";

const websiteAnalysis: ProductAnalysis = {
  url: "https://example.com/",
  title: "LongCut",
  headings: ["Turn long videos into highlights", "Paste a YouTube URL to start"],
  bodySnippets: ["LongCut analyzes long videos and produces shareable highlights."],
  links: [],
  buttons: ["Analyze", "Export highlights"],
  inputs: [{ label: "YouTube URL", placeholder: "https://youtube.com/watch?v=...", selectorHint: "[data-testid='url']" }],
  brandHints: { colors: ["#111"], fontFamilies: ["Inter"] },
};

const repoAnalysis: RepoAnalysis = {
  repoUrl: "https://github.com/example/longcut",
  commit: "deadbee",
  productName: "LongCut",
  summary: "LongCut turns long-form video into highlight reels and summaries.",
  features: ["Highlight detection", "Transcript chat", "Notes export"],
  likelyRoutes: ["/", "/workspace"],
  demoIdeas: ["Paste a YouTube URL and generate highlights", "Open the transcript chat"],
  importantTerms: ["video", "highlights"],
  setupNotes: ["Source-only analysis."],
  sourceHints: [{ path: "README.md", reason: "Product summary." }],
};

// ---- Case 1: full repo + website -> high confidence, grounded capabilities/flows ----
const understanding = deriveProductUnderstanding({
  productUrl: "https://example.com/",
  repoUrl: repoAnalysis.repoUrl,
  prompt: "Show how a user pastes a YouTube URL and gets highlights.",
  websiteAnalysis,
  repoAnalysis,
});

// Shape is schema-valid.
ProductUnderstandingSchema.parse(understanding);
assert.equal(understanding.version, 1);

// Product narrative is grounded in real sources, not invented.
assert.equal(understanding.product.name, "LongCut");
assert.ok(understanding.product.oneLine.includes("highlight"), "oneLine should come from the repo summary");
assert.equal(understanding.product.category, "video");

// Capabilities come from repo features.
assert.deepEqual(
  understanding.capabilities.map((capability) => capability.name),
  ["Highlight detection", "Transcript chat", "Notes export"],
);
assert.ok(
  understanding.capabilities.every((capability) => capability.evidence.length >= 1),
  "every capability must cite evidence",
);

// Flows come from repo demo ideas, corroborated by visible affordances -> high confidence.
assert.ok(understanding.demoableFlows.length >= 1, "at least one demoable flow");
assert.ok(
  understanding.demoableFlows.some((flow) => flow.confidence === "high"),
  "a corroborated flow should be high confidence",
);
// A flow whose idea mentions an input keyword (URL/paste) captures the website input.
const urlFlow = understanding.demoableFlows.find((flow) => /youtube url/i.test(flow.name));
assert.ok(urlFlow, "the YouTube URL flow should exist");
assert.ok(urlFlow.requiredInputs.length >= 1, "the URL flow should require a sample input");

// Evidence spans repo + website + prompt.
const evidenceSources = new Set(understanding.evidence.map((entry) => entry.sourceType));
assert.ok(evidenceSources.has("repo"), "evidence should include repo");
assert.ok(evidenceSources.has("website"), "evidence should include website");
assert.ok(evidenceSources.has("prompt"), "evidence should include the prompt");

// Unknowns are honestly recorded.
assert.ok(understanding.unknowns.length >= 1, "unknowns must not be empty");
assert.equal(understanding.confidence, "high");

// ---- Case 2: website only -> fallback flow + warnings, lower confidence ----
const websiteOnly = deriveProductUnderstanding({
  productUrl: "https://example.com/",
  prompt: "Give me a quick product tour.",
  websiteAnalysis: { ...websiteAnalysis, buttons: [], inputs: [] },
});
ProductUnderstandingSchema.parse(websiteOnly);
assert.ok(websiteOnly.demoableFlows.length >= 1, "must always yield at least one flow for strategy to pick");
assert.ok(
  websiteOnly.warnings.some((warning) => /repository/i.test(warning)),
  "missing repo should be warned",
);
assert.notEqual(websiteOnly.confidence, "high");

console.log("productUnderstanding.test PASS");
