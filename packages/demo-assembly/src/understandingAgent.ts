import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectOpencodeText, defaultRunAiPlannerOpencode, parseJsonObjectsFromText, type AiUrlPlannerOpencodeRun } from "./aiPlanning.js";
import { runClaudeAgent } from "./claudeCodeAgent.js";
import { ProductUnderstandingSchema, deriveProductUnderstanding,
  type DeriveProductUnderstandingInput, type ProductUnderstanding, type UnderstandProduct } from "./productUnderstanding.js";

export const UNDERSTANDING_FALLBACK_NO_REPO =
  "Understanding agent skipped (no repo); used deterministic understanding.";
export const UNDERSTANDING_FALLBACK_INVALID =
  "Understanding agent failed validation; used deterministic understanding.";
export const UNDERSTANDING_FALLBACK_WARNINGS: readonly string[] = [
  UNDERSTANDING_FALLBACK_NO_REPO,
  UNDERSTANDING_FALLBACK_INVALID,
];

const DEEPWIKI_MCP = { mcpServers: { deepwiki: { type: "http", url: "https://mcp.deepwiki.com/mcp" } } };
const ALLOWED_TOOLS = "Read,Grep,Glob,mcp__deepwiki__read_wiki_structure,mcp__deepwiki__read_wiki_contents,mcp__deepwiki__ask_question";

function ownerRepo(repoUrl: string): string | undefined {
  try { const p = new URL(repoUrl).pathname.split("/").filter(Boolean); return p.length >= 2 ? `${p[0]}/${p[1].replace(/\.git$/, "")}` : undefined; } catch { return undefined; }
}

function abortError() {
  return new DOMException("Understanding cancelled.", "AbortError");
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw abortError();
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
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
  let lastError: unknown;
  for (const candidate of parseJsonObjectsFromText(raw).reverse()) {
    try {
      return ProductUnderstandingSchema.parse(normalizeUnderstandingCandidate(candidate));
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error("no valid understanding JSON object in agent output", { cause: lastError });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeConfidence(value: unknown): unknown {
  if (value === "high" || value === "medium" || value === "low") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value >= 0.75 ? "high" : value >= 0.45 ? "medium" : "low";
  return value;
}

function stringifyListEntry(value: unknown): string {
  if (typeof value === "string") return value;
  if (isRecord(value)) {
    for (const key of ["description", "claim", "name", "reason", "note"]) {
      const entry = value[key];
      if (typeof entry === "string" && entry.trim().length > 0) return entry;
    }
  }
  return JSON.stringify(value) ?? String(value);
}

function normalizeSourceType(value: unknown): unknown {
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (normalized.includes("repo") || normalized.includes("code") || normalized.includes("file") || normalized.includes("source")) return "repo";
    if (normalized.includes("web") || normalized.includes("site")) return "website";
    if (normalized.includes("doc")) return "docs";
    if (normalized.includes("prompt") || normalized.includes("user")) return "prompt";
  }
  return "repo";
}

function normalizeProduct(value: unknown, candidate: Record<string, unknown>): unknown {
  if (!isRecord(value)) return value;
  const valueNarrative = isRecord(candidate.valueNarrative) ? candidate.valueNarrative : {};
  const primaryProblem = typeof value.primaryProblem === "string" ? value.primaryProblem : valueNarrative.problem;
  const primaryValueProposition =
    typeof value.primaryValueProposition === "string"
      ? value.primaryValueProposition
      : typeof valueNarrative.viewerTakeaway === "string"
        ? valueNarrative.viewerTakeaway
        : value.oneLine;
  return {
    name: value.name,
    category: value.category ?? "",
    oneLine: value.oneLine ?? "",
    targetUsers: Array.isArray(value.targetUsers) ? value.targetUsers : [],
    primaryProblem: typeof primaryProblem === "string" ? primaryProblem : "",
    primaryValueProposition: typeof primaryValueProposition === "string" ? primaryValueProposition : "",
  };
}

function normalizeUnderstandingCandidate(candidate: unknown): unknown {
  if (!isRecord(candidate)) return candidate;
  return {
    ...candidate,
    version: candidate.version ?? 1,
    product: normalizeProduct(candidate.product, candidate),
    capabilities: Array.isArray(candidate.capabilities)
      ? candidate.capabilities.map((capability, index) =>
          isRecord(capability) ? { ...capability, id: capability.id ?? `capability-${index + 1}` } : capability,
        )
      : candidate.capabilities,
    demoableFlows: Array.isArray(candidate.demoableFlows)
      ? candidate.demoableFlows.map((flow, index) =>
          isRecord(flow) ? { ...flow, id: flow.id ?? `flow-${index + 1}`, confidence: normalizeConfidence(flow.confidence) } : flow,
        )
      : candidate.demoableFlows,
    evidence: Array.isArray(candidate.evidence)
      ? candidate.evidence.map((evidence, index) =>
          isRecord(evidence)
            ? { ...evidence, id: evidence.id ?? `evidence-${index + 1}`, sourceType: normalizeSourceType(evidence.sourceType) }
            : evidence,
        )
      : candidate.evidence,
    constraints: Array.isArray(candidate.constraints) ? candidate.constraints.map(stringifyListEntry) : [],
    unknowns: Array.isArray(candidate.unknowns) ? candidate.unknowns.map(stringifyListEntry) : [],
    confidence: normalizeConfidence(candidate.confidence),
    warnings: Array.isArray(candidate.warnings) ? candidate.warnings.map(stringifyListEntry) : [],
  };
}

export function isUsable(u: ProductUnderstanding): boolean {
  return u.demoableFlows.length >= 1 && u.valueNarrative.problem.trim().length > 0 && u.valueNarrative.viewerTakeaway.trim().length > 0;
}

export function createClaudeUnderstandingAgent(deps: { runAgent?: typeof runClaudeAgent; fallback?: UnderstandProduct } = {}): UnderstandProduct {
  const runAgent = deps.runAgent ?? runClaudeAgent;
  const fallback = deps.fallback ?? (async (i) => deriveProductUnderstanding(i));
  return async (input) => {
    throwIfAborted(input.signal);
    const repo = input.repoUrl ? ownerRepo(input.repoUrl) : undefined;
    if (!repo || !input.repoCheckoutDirectory) {
      const u = await fallback(input);
      throwIfAborted(input.signal);
      return { ...u, warnings: [...u.warnings, UNDERSTANDING_FALLBACK_NO_REPO] };
    }
    let mcpDir: string | undefined;
    try {
      mcpDir = await mkdtemp(join(tmpdir(), "tinker-mcp-"));
      const mcpConfigPath = join(mcpDir, "deepwiki.json");
      await writeFile(mcpConfigPath, JSON.stringify(DEEPWIKI_MCP));
      const prompt = buildUnderstandingPrompt(input, repo);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          throwIfAborted(input.signal);
          const raw = await runAgent(attempt === 0 ? prompt : `${prompt}\n\nReturn ONLY a single valid JSON object matching the schema.`,
            { cwd: input.repoCheckoutDirectory, allowedTools: ALLOWED_TOOLS, mcpConfigPath });
          throwIfAborted(input.signal);
          const u = parseUnderstandingOutput(raw);
          if (isUsable(u)) return u;
        } catch (error) {
          if (isAbortError(error)) {
            throw error;
          }
          throwIfAborted(input.signal);
          /* retry then fall through */
        }
      }
      throwIfAborted(input.signal);
      const u = await fallback(input);
      throwIfAborted(input.signal);
      return { ...u, warnings: [...u.warnings, UNDERSTANDING_FALLBACK_INVALID] };
    } finally {
      if (mcpDir) await rm(mcpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  };
}

export function createOpencodeUnderstandingAgent(deps: { runOpencode?: AiUrlPlannerOpencodeRun; fallback?: UnderstandProduct } = {}): UnderstandProduct {
  const runOpencode = deps.runOpencode ?? defaultRunAiPlannerOpencode;
  const fallback = deps.fallback ?? (async (i) => deriveProductUnderstanding(i));
  return async (input) => {
    throwIfAborted(input.signal);
    const repo = input.repoUrl ? ownerRepo(input.repoUrl) : undefined;
    if (!repo || !input.repoCheckoutDirectory) {
      const u = await fallback(input);
      throwIfAborted(input.signal);
      return { ...u, warnings: [...u.warnings, UNDERSTANDING_FALLBACK_NO_REPO] };
    }

    const prompt = buildUnderstandingPrompt(input, repo);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        throwIfAborted(input.signal);
        const raw = await runOpencode(attempt === 0 ? prompt : `${prompt}\n\nReturn ONLY a single valid JSON object matching the schema.`, {
          cwd: input.repoCheckoutDirectory,
          signal: input.signal,
        });
        throwIfAborted(input.signal);
        const u = parseUnderstandingOutput(collectOpencodeText(raw));
        if (isUsable(u)) return u;
      } catch (error) {
        if (isAbortError(error)) throw error;
        throwIfAborted(input.signal);
      }
    }

    throwIfAborted(input.signal);
    const u = await fallback(input);
    throwIfAborted(input.signal);
    return { ...u, warnings: [...u.warnings, UNDERSTANDING_FALLBACK_INVALID] };
  };
}
