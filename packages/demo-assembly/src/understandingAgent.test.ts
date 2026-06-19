import assert from "node:assert/strict";
import { createClaudeUnderstandingAgent } from "./understandingAgent.js";
import { ProductUnderstandingSchema } from "./productUnderstanding.js";
import type { ProductAnalysis } from "@tinker/product-analysis";

const websiteAnalysis: ProductAnalysis = { url: "https://x.dev/", title: "X", headings: ["H"], bodySnippets: ["b"], links: [], buttons: ["Go"], inputs: [], brandHints: { colors: [], fontFamilies: [] } };
const input = { productUrl: "https://x.dev/", repoUrl: "https://github.com/o/r", websiteAnalysis, repoCheckoutDirectory: "/tmp/checkout" };

const valid = JSON.stringify({ version:1, product:{name:"X",category:"",oneLine:"",targetUsers:["devs"],primaryProblem:"P",primaryValueProposition:"V"},
  valueNarrative:{problem:"P",audience:"devs",howItSolves:"M",whyItMatters:"W",viewerTakeaway:"T",evidenceRefs:["evidence-1"]},
  capabilities:[], demoableFlows:[{id:"flow-1",rank:1,rankReason:"r",name:"F",whyItMatters:"w",requiredInputs:[],expectedOutcome:"o",proves:"pr",viewerTakeaway:"vt",confidence:"high",evidenceRefs:["evidence-1"]}],
  evidence:[{id:"evidence-1",sourceType:"repo",source:"README.md",quoteOrReference:"q",claim:"c"}], constraints:[], unknowns:[], confidence:"high", warnings:[] });

// (a) valid JSON → parsed agent output
const agentA = createClaudeUnderstandingAgent({ runAgent: async () => "here you go:\n" + valid });
const outA = await agentA(input);
ProductUnderstandingSchema.parse(outA);
assert.equal(outA.valueNarrative.viewerTakeaway, "T");

// (b) malformed twice → falls back to deterministic + warning
let calls = 0;
const agentB = createClaudeUnderstandingAgent({ runAgent: async () => { calls += 1; return "not json"; } });
const outB = await agentB(input);
assert.equal(calls, 2, "one retry then fallback");
assert.ok(outB.warnings.some((w) => /agent/i.test(w)), "fallback warns");
ProductUnderstandingSchema.parse(outB);

// (c) no repoUrl → deterministic fallback without calling the agent
let called = false;
const agentC = createClaudeUnderstandingAgent({ runAgent: async () => { called = true; return valid; } });
const outC = await agentC({ ...input, repoUrl: undefined, repoCheckoutDirectory: undefined });
assert.equal(called, false, "no repo → skip agent");
ProductUnderstandingSchema.parse(outC);

// (d) valid JSON that fails the usability gate (demoableFlows: []) → retry then fallback
const unusable = JSON.stringify({ ...JSON.parse(valid), demoableFlows: [] });
let callsD = 0;
const agentD = createClaudeUnderstandingAgent({ runAgent: async () => { callsD += 1; return unusable; } });
const outD = await agentD(input);
assert.equal(callsD, 2, "two attempts before fallback");
assert.ok(outD.warnings.some((w) => /agent/i.test(w)), "fallback warns about agent");
ProductUnderstandingSchema.parse(outD);
assert.ok(outD.demoableFlows.length >= 1, "fallback has at least one demoableFlow");

console.log("understandingAgent.test PASS");

import { UNDERSTANDING_FALLBACK_INVALID, UNDERSTANDING_FALLBACK_WARNINGS } from "./understandingAgent.js";
// The malformed-output fallback emits the exported constant verbatim.
const agentConst = createClaudeUnderstandingAgent({ runAgent: async () => "not json" });
const outConst = await agentConst(input);
assert.ok(outConst.warnings.includes(UNDERSTANDING_FALLBACK_INVALID), "fallback emits the exported constant");
assert.ok(UNDERSTANDING_FALLBACK_WARNINGS.includes(UNDERSTANDING_FALLBACK_INVALID));
console.log("understandingAgent fallback-constants PASS");

let abortFallbackCalled = false;
const abortAgent = createClaudeUnderstandingAgent({
  runAgent: async () => {
    throw new DOMException("aborted", "AbortError");
  },
  fallback: async () => {
    abortFallbackCalled = true;
    throw new Error("fallback should not run after abort");
  },
});
await assert.rejects(() => abortAgent(input), { name: "AbortError" });
assert.equal(abortFallbackCalled, false);
console.log("understandingAgent abort PASS");
