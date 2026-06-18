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

console.log("understandingAgent.test PASS");
