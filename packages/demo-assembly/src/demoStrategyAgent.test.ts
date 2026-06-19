import assert from "node:assert/strict";
import { buildStrategyPrompt, createClaudeStrategyAgent } from "./demoStrategyAgent.js";
import { deriveProductUnderstanding } from "./productUnderstanding.js";
import { DemoStrategySchema, StoryboardSchema } from "./demoStrategy.js";
import type { ProductAnalysis } from "@tinker/product-analysis";

const websiteAnalysis: ProductAnalysis = { url: "https://x.dev/", title: "X", headings: ["H"], bodySnippets: ["b"], links: [], buttons: ["Go"], inputs: [], brandHints: { colors: [], fontFamilies: [] } };
const understanding = deriveProductUnderstanding({ productUrl: "https://x.dev/", websiteAnalysis });
const baseInput = { understanding, durationCapSeconds: 40, aspectRatio: "16:9" as const };

const approvedOutline = {
  title: "Approved X demo",
  durationCapSeconds: 40,
  aspectRatio: "16:9",
  summary: "Use the approved story.",
  scenes: [{ id: "scene-1", goal: "Open with X", visual: "Show the hero.", evidence: ["website"] }],
  generationNotes: ["Keep scene IDs."],
} as const;

const strategyPrompt = JSON.parse(buildStrategyPrompt({ ...baseInput, approvedOutline }));
assert.equal(strategyPrompt.approvedOutline.title, "Approved X demo");
assert.equal(strategyPrompt.approvedOutline.scenes[0].id, "scene-1");
assert.ok(
  strategyPrompt.instructions.some((instruction: string) => instruction.includes("approved outline as the preferred story structure")),
  "strategy prompt should instruct the agent to prefer the approved outline",
);

const valid = JSON.stringify({
  strategy: { version:1, selectedAngle:{title:"A",whyThisAngle:"because",targetAudience:"devs",primaryProof:"P"},
    selectedFlow:{sourceFlowId: understanding.demoableFlows[0].id, name: understanding.demoableFlows[0].name, reason:"r"},
    messageHierarchy:["m1"], successCriteria:["s"], risks:[], warnings:[] },
  storyboard: { version:1, title:"X demo", durationTargetSeconds:40, aspectRatio:"16:9",
    beats:[{id:"beat-1",goal:"g",visual:"v",narrative:"n",strategyMessageId:"message-1",proofPointId: understanding.capabilities[0]?.id ?? "capability-1",expectedUserAction:null,importance:"high"}] },
});

const ok = createClaudeStrategyAgent({ runSynthesis: async () => valid });
const r = await ok(baseInput);
DemoStrategySchema.parse(r.strategy); StoryboardSchema.parse(r.storyboard);

let n = 0;
const bad = createClaudeStrategyAgent({ runSynthesis: async () => { n += 1; return "nope"; } });
const rb = await bad(baseInput);
assert.equal(n, 2, "retry then fallback");
DemoStrategySchema.parse(rb.strategy); // deterministic fallback shape
console.log("demoStrategyAgent.test PASS");

import { STRATEGY_FALLBACK_WARNING } from "./demoStrategyAgent.js";
const sFallback = createClaudeStrategyAgent({ runSynthesis: async () => "nope" });
const sOut = await sFallback(baseInput);
assert.ok(sOut.strategy.warnings.includes(STRATEGY_FALLBACK_WARNING), "strategy fallback emits the exported constant");
console.log("demoStrategyAgent fallback-constant PASS");

let abortFallbackCalled = false;
const abortStrategy = createClaudeStrategyAgent({
  runSynthesis: async () => {
    throw new DOMException("aborted", "AbortError");
  },
  fallback: async () => {
    abortFallbackCalled = true;
    throw new Error("fallback should not run after abort");
  },
});
await assert.rejects(() => abortStrategy(baseInput), { name: "AbortError" });
assert.equal(abortFallbackCalled, false);
console.log("demoStrategyAgent abort PASS");
