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
  understanding.capabilities.every((capability) => capability.evidenceRefs.length >= 1),
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

// ---- Task 1: expanded schema smoke test ----
// A fully-expanded object validates and evidenceRefs resolve into the evidence pool.
const expanded = {
  version: 1,
  product: { name: "X", category: "", oneLine: "", targetUsers: ["devs"], primaryProblem: "P", primaryValueProposition: "V" },
  valueNarrative: { problem: "P", audience: "devs", howItSolves: "M", whyItMatters: "W", viewerTakeaway: "T", evidenceRefs: ["evidence-1"] },
  capabilities: [{ id: "capability-1", name: "C", description: "", evidenceRefs: ["evidence-1"] }],
  demoableFlows: [{ id: "flow-1", rank: 1, rankReason: "best", name: "F", whyItMatters: "w",
    requiredInputs: [], expectedOutcome: "o", proves: "pr", viewerTakeaway: "vt", confidence: "high", evidenceRefs: ["evidence-1"] }],
  evidence: [{ id: "evidence-1", sourceType: "repo", source: "README.md", quoteOrReference: "q", claim: "c" }],
  constraints: [], unknowns: [], confidence: "high", warnings: [],
};
const parsed = ProductUnderstandingSchema.parse(expanded);
const ids = new Set(parsed.evidence.map((e) => e.id));
for (const ref of parsed.valueNarrative.evidenceRefs) assert.ok(ids.has(ref), `dangling ref ${ref}`);
for (const flow of parsed.demoableFlows) for (const ref of flow.evidenceRefs) assert.ok(ids.has(ref));
assert.equal(parsed.demoableFlows[0].rank, 1);
assert.equal(parsed.valueNarrative.viewerTakeaway, "T");
console.log("productUnderstanding schema (expanded) PASS");

// ---- Task 2: deriveProductUnderstanding emits expanded shape ----
// every capability/flow references real evidence ids
const poolIds = new Set(understanding.evidence.map((e) => e.id));
for (const cap of understanding.capabilities) for (const r of cap.evidenceRefs) assert.ok(poolIds.has(r));
for (const flow of understanding.demoableFlows) {
  assert.ok(poolIds.has(flow.evidenceRefs[0]), "flow cites a real evidence id");
  assert.ok(typeof flow.rank === "number");
  assert.ok(typeof flow.proves === "string" && typeof flow.viewerTakeaway === "string");
}
// value narrative is populated from the strongest grounding available
assert.ok(understanding.valueNarrative.problem.length > 0 || understanding.warnings.length > 0);
assert.ok(understanding.demoableFlows[0].rank === 1, "first flow is rank 1");
console.log("productUnderstanding derive (expanded) PASS");
