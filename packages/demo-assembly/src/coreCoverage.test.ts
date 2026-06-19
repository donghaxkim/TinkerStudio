import assert from "node:assert/strict";
import { CoreCoverageItemSchema, MEANINGFUL_ACTION_TYPES, buildCoreCoverage, type CoreActionTrace } from "./coreCoverage.js";
import { deriveDemoStrategy } from "./demoStrategy.js";
import { deriveProductUnderstanding } from "./productUnderstanding.js";
import type { ProductAnalysis, RepoAnalysis } from "@tinker/product-analysis";

assert.deepEqual([...MEANINGFUL_ACTION_TYPES].sort(), ["click", "press", "type"]);

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

function trace(actions: Array<{ id: string; type: string; beatId: string }>): CoreActionTrace {
  return {
    actions: actions.map((a) => ({ type: a.type, beatId: a.beatId })),
  };
}

const demoBeat = storyboard.beats.find((b) => b.type === "screen_capture")!;
const hookBeat = storyboard.beats.find((b) => b.type === "hook")!;

// (1) Selected flow CAPTURED only with a meaningful action on the demo beat.
const captured = buildCoreCoverage({
  strategy, storyboard,
  actionTrace: trace([{ id: "click-1", type: "click", beatId: demoBeat.id }]),
  finalVideoProduced: true,
});
CoreCoverageItemSchema.array().parse(captured.items);
const flowItem = captured.items.find((i) => i.sourceType === "selected-flow")!;
assert.equal(flowItem.id, "core-selected-flow");
assert.equal(flowItem.required, true);
assert.equal(flowItem.status, "captured");

// (2) Scroll alone does NOT capture the selected flow → planned + warning, even with final.mp4.
const scrolled = buildCoreCoverage({
  strategy, storyboard,
  actionTrace: trace([{ id: "scroll-1", type: "scroll", beatId: demoBeat.id }]),
  finalVideoProduced: true,
});
const flowScrolled = scrolled.items.find((i) => i.sourceType === "selected-flow")!;
assert.equal(flowScrolled.status, "planned", "scroll is not meaningful proof");
assert.ok(flowScrolled.warnings.some((w) => /interaction/i.test(w)));

// (3) Static hook message beat with final.mp4 and no action → captured + caveat warning.
const hookMsgId = hookBeat.strategyMessageId; // e.g. "message-1"
const hookItem = captured.items.find((i) => i.strategyMessageId === hookMsgId);
assert.ok(hookItem && hookItem.status === "captured");
assert.ok(hookItem.warnings.some((w) => /not pixel verification/i.test(w)));

// (4) No trace at all → mapped beats planned, top-level no-evidence warning.
const noTrace = buildCoreCoverage({ strategy, storyboard, finalVideoProduced: false });
assert.ok(noTrace.items.every((i) => i.status === "planned" || i.status === "missing"));
assert.ok(noTrace.warnings.some((w) => /no capture-lineage|storyboard-only|no .*evidence/i.test(w)));

// (5) Heuristic disclaimer always present; artifactRefs include storyboard refs.
assert.ok(captured.warnings.some((w) => /heuristic/i.test(w)));
assert.ok(captured.items[0].artifactRefs.some((r) => r.startsWith("storyboard.json#")));

// (6) Strategy message with NO mapped storyboard beat → status "missing"; final.mp4 NOT cited.
const storyboardAllMsg2: typeof storyboard = {
  ...storyboard,
  beats: storyboard.beats.map((b) => ({ ...b, strategyMessageId: "message-2" })),
};
const missingCoverage = buildCoreCoverage({
  strategy,
  storyboard: storyboardAllMsg2,
  actionTrace: trace([{ id: "click-1", type: "click", beatId: storyboard.beats[0].id }]),
  finalVideoProduced: true,
});
const missingItem = missingCoverage.items.find((i) => i.id === "core-message-1")!;
assert.ok(missingItem, "core-message-1 item must exist");
assert.equal(missingItem.status, "missing");
assert.ok(!missingItem.artifactRefs.includes("testreel/final.mp4"), "missing item must NOT cite final.mp4");

console.log("coreCoverage.test PASS");
