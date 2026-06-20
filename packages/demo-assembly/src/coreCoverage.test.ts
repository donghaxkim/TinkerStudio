import assert from "node:assert/strict";
import { CoreCoverageItemSchema, buildCoreCoverage } from "./coreCoverage.js";
import { deriveDemoStrategy } from "./demoStrategy.js";
import { deriveProductUnderstanding } from "./productUnderstanding.js";
import type { ProductAnalysis, RepoAnalysis } from "@tinker/product-analysis";

const websiteAnalysis: ProductAnalysis = {
  url: "https://x.dev/", title: "X", headings: ["Do the thing"], bodySnippets: ["X does it."],
  links: [], buttons: ["Start"], inputs: [{ label: "URL", selectorHint: "[data-testid='url']" }],
  brandHints: { colors: [], fontFamilies: [] },
};
const repoAnalysis: RepoAnalysis = {
  repoUrl: "https://github.com/x/x", productName: "X", summary: "X does the thing.",
  features: ["Do the thing"], likelyRoutes: ["/"], demoIdeas: ["Paste a URL and run it"],
  importantTerms: ["thing"], setupNotes: [], sourceHints: [],
};
const understanding = deriveProductUnderstanding({ productUrl: "https://x.dev/", repoUrl: repoAnalysis.repoUrl, websiteAnalysis, repoAnalysis });
const { strategy, storyboard } = deriveDemoStrategy({ understanding, durationCapSeconds: 40, aspectRatio: "16:9" });

const hookBeat = storyboard.beats.find((b) => b.type === "hook")!;

// (1) Selected flow remains planned without per-beat verified interaction evidence.
const coverage = buildCoreCoverage({ strategy, storyboard, finalVideoProduced: true });
CoreCoverageItemSchema.array().parse(coverage.items);
const flowItem = coverage.items.find((i) => i.sourceType === "selected-flow")!;
assert.equal(flowItem.id, "core-selected-flow");
assert.equal(flowItem.required, true);
assert.equal(flowItem.status, "planned");
assert.ok(flowItem.warnings.some((w) => /not per-beat verified/i.test(w)));

// (2) Static hook message beat with final.mp4 → captured + caveat warning.
const hookMsgId = hookBeat.strategyMessageId; // e.g. "message-1"
const hookItem = coverage.items.find((i) => i.strategyMessageId === hookMsgId);
assert.ok(hookItem && hookItem.status === "captured");
assert.ok(hookItem.warnings.some((w) => /not pixel verification/i.test(w)));

// (3) No final video → mapped beats planned.
const noTrace = buildCoreCoverage({ strategy, storyboard, finalVideoProduced: false });
assert.ok(noTrace.items.every((i) => i.status === "planned" || i.status === "missing"));

// (4) Heuristic disclaimer always present; artifactRefs include storyboard refs.
assert.ok(coverage.warnings.some((w) => /heuristic/i.test(w)));
assert.ok(coverage.items[0].artifactRefs.some((r) => r.startsWith("storyboard.json#")));

// (5) Strategy message with NO mapped storyboard beat → status "missing"; final.mp4 NOT cited.
const storyboardAllMsg2: typeof storyboard = {
  ...storyboard,
  beats: storyboard.beats.map((b) => ({ ...b, strategyMessageId: "message-2" })),
};
const missingCoverage = buildCoreCoverage({
  strategy,
  storyboard: storyboardAllMsg2,
  finalVideoProduced: true,
});
const missingItem = missingCoverage.items.find((i) => i.id === "core-message-1")!;
assert.ok(missingItem, "core-message-1 item must exist");
assert.equal(missingItem.status, "missing");
assert.ok(!missingItem.artifactRefs.includes("testreel/final.mp4"), "missing item must NOT cite final.mp4");

console.log("coreCoverage.test PASS");
