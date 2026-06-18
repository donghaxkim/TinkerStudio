import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runClaudeAgent } from "./claudeCodeAgent.js";
import { ProductUnderstandingSchema, deriveProductUnderstanding,
  type DeriveProductUnderstandingInput, type ProductUnderstanding, type UnderstandProduct } from "./productUnderstanding.js";

const DEEPWIKI_MCP = { mcpServers: { deepwiki: { type: "http", url: "https://mcp.deepwiki.com/mcp" } } };
const ALLOWED_TOOLS = "Read,Grep,Glob,mcp__deepwiki__read_wiki_structure,mcp__deepwiki__read_wiki_contents,mcp__deepwiki__ask_question";

function ownerRepo(repoUrl: string): string | undefined {
  try { const p = new URL(repoUrl).pathname.split("/").filter(Boolean); return p.length >= 2 ? `${p[0]}/${p[1].replace(/\.git$/, "")}` : undefined; } catch { return undefined; }
}

export function buildUnderstandingPrompt(input: DeriveProductUnderstandingInput, repo: string): string {
  return JSON.stringify({
    task: "Investigate this product and output ONE JSON object matching the schema. Be a real product analyst, not a feature lister.",
    systemDirective: input.systemPrompt ?? "",
    instructions: [
      ...(input.systemPrompt ? [`Above all, follow this directive: ${input.systemPrompt}`] : []),
      "The repository is cloned in your working directory — read its README, package.json, and key source with your file tools.",
      `Use the DeepWiki tools on \"${repo}\" (read_wiki_contents, ask_question) for grounded architecture/capability answers.`,
      "Answer the viewer-level story: what PROBLEM it solves, WHO feels it, the concrete SOLUTION MECHANISM, WHY it matters, and the single viewerTakeaway.",
      "For each demoable flow, set proves and viewerTakeaway; rank flows by demo value (rank 1 = strongest).",
      "Cite every claim in the evidence pool with an id; reference ids via evidenceRefs. Do not invent facts; record gaps in unknowns.",
      "Output ONLY the JSON object — no prose, no code fences.",
    ],
    websiteAnalysis: input.websiteAnalysis,
    schema: "ProductUnderstanding v1 with product, valueNarrative{problem,audience,howItSolves,whyItMatters,viewerTakeaway,evidenceRefs}, capabilities[], demoableFlows[{id,rank,rankReason,name,whyItMatters,requiredInputs,expectedOutcome,proves,viewerTakeaway,confidence,evidenceRefs}], evidence[{id,sourceType,source,quoteOrReference,claim}], constraints, unknowns, confidence, warnings",
  }, null, 2);
}

export function parseUnderstandingOutput(raw: string): ProductUnderstanding {
  const start = raw.indexOf("{"); const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in agent output");
  return ProductUnderstandingSchema.parse(JSON.parse(raw.slice(start, end + 1)));
}

export function isUsable(u: ProductUnderstanding): boolean {
  return u.demoableFlows.length >= 1 && u.valueNarrative.problem.trim().length > 0 && u.valueNarrative.viewerTakeaway.trim().length > 0;
}

export function createClaudeUnderstandingAgent(deps: { runAgent?: typeof runClaudeAgent; fallback?: UnderstandProduct } = {}): UnderstandProduct {
  const runAgent = deps.runAgent ?? runClaudeAgent;
  const fallback = deps.fallback ?? (async (i) => deriveProductUnderstanding(i));
  return async (input) => {
    const repo = input.repoUrl ? ownerRepo(input.repoUrl) : undefined;
    if (!repo || !input.repoCheckoutDirectory) {
      const u = await fallback(input);
      return { ...u, warnings: [...u.warnings, "Understanding agent skipped (no repo); used deterministic understanding."] };
    }
    let mcpDir: string | undefined;
    try {
      mcpDir = await mkdtemp(join(tmpdir(), "tinker-mcp-"));
      const mcpConfigPath = join(mcpDir, "deepwiki.json");
      await writeFile(mcpConfigPath, JSON.stringify(DEEPWIKI_MCP));
      const prompt = buildUnderstandingPrompt(input, repo);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const raw = await runAgent(attempt === 0 ? prompt : `${prompt}\n\nReturn ONLY a single valid JSON object matching the schema.`,
            { cwd: input.repoCheckoutDirectory, allowedTools: ALLOWED_TOOLS, mcpConfigPath });
          const u = parseUnderstandingOutput(raw);
          if (isUsable(u)) return u;
        } catch { /* retry then fall through */ }
      }
      const u = await fallback(input);
      return { ...u, warnings: [...u.warnings, "Understanding agent failed validation; used deterministic understanding."] };
    } finally {
      if (mcpDir) await rm(mcpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  };
}
