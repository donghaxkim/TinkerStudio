// Real Understanding agent against a public repo. Run:
//   TINKER_AGENT_BACKEND=claude-code pnpm --filter @tinker/demo-assembly smoke:understanding:claude
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClaudeUnderstandingAgent } from "./understandingAgent.js";
import { ProductUnderstandingSchema } from "./productUnderstanding.js";
import type { ProductAnalysis } from "@tinker/product-analysis";

const websiteAnalysis: ProductAnalysis = { url: "https://paykit.sh/", title: "PayKit",
  headings: ["The billing framework for TypeScript"], bodySnippets: ["Define plans in code."],
  links: [], buttons: ["Upgrade to Pro", "Manage billing"], inputs: [], brandHints: { colors: [], fontFamilies: [] } };

// NOTE: a real clone is needed for file tools; for the smoke we point cwd at an empty temp dir,
// so the agent leans on DeepWiki + websiteAnalysis. (A fuller smoke clones getpaykit/paykit first.)
const cwd = await mkdtemp(join(tmpdir(), "tinker-uainderstand-smoke-"));
console.log("[smoke] running real Understanding agent (claude + DeepWiki MCP)...");
const agent = createClaudeUnderstandingAgent();
const u = await agent({ productUrl: "https://paykit.sh/", repoUrl: "https://github.com/getpaykit/paykit", websiteAnalysis, repoCheckoutDirectory: cwd });
ProductUnderstandingSchema.parse(u);
assert.ok(u.valueNarrative.problem.trim().length > 0, "problem populated");
assert.ok(u.valueNarrative.viewerTakeaway.trim().length > 0, "viewerTakeaway populated");
assert.ok(u.demoableFlows.length >= 1 && u.demoableFlows[0].rank === 1, "ranked flows");
const ids = new Set(u.evidence.map((e) => e.id));
for (const f of u.demoableFlows) for (const r of f.evidenceRefs) assert.ok(ids.has(r), `evidenceRef ${r} resolves`);
console.log("\n[smoke] PASS");
console.log(`  problem        : ${u.valueNarrative.problem}`);
console.log(`  viewerTakeaway : ${u.valueNarrative.viewerTakeaway}`);
console.log(`  top flow       : ${u.demoableFlows[0].name} — proves: ${u.demoableFlows[0].proves}`);
