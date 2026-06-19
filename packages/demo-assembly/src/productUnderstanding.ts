// Product Understanding phase (first pass)
//
// Lightweight, DETERMINISTIC mapping from the structured website + repo analysis
// (plus the user prompt) into an evidence-backed `product-understanding.json`.
//
// This is intentionally NOT an autonomous agent: it is a pure function over the
// already-collected analysis artifacts. Every claim it makes cites the source it
// came from, and anything it cannot ground is recorded as an `unknown` rather than
// invented. A future LLM-backed understander can replace `deriveProductUnderstanding`
// behind the `UnderstandProduct` seam without changing the artifact contract.

import type { ProductAnalysis, RepoAnalysis } from "@tinker/product-analysis";
import { z } from "zod";

const nonEmpty = z.string().trim().min(1);
const ConfidenceSchema = z.enum(["high", "medium", "low"]);

export const ProductUnderstandingEvidenceSchema = z
  .object({
    id: nonEmpty,
    sourceType: z.enum(["repo", "website", "prompt", "docs"]),
    source: z.string(),
    claim: nonEmpty,
    quoteOrReference: z.string(),
  })
  .strict();

export const ValueNarrativeSchema = z
  .object({
    problem: z.string(),
    audience: z.string(),
    howItSolves: z.string(),
    whyItMatters: z.string(),
    viewerTakeaway: z.string(),
    evidenceRefs: z.array(z.string()),
  })
  .strict();

export const ProductCapabilitySchema = z
  .object({ id: nonEmpty, name: nonEmpty, description: z.string(), evidenceRefs: z.array(z.string()) })
  .strict();

export const DemoableFlowSchema = z
  .object({
    id: nonEmpty,
    rank: z.number().int().min(1),
    rankReason: z.string(),
    name: nonEmpty,
    whyItMatters: z.string(),
    requiredInputs: z.array(z.string()),
    expectedOutcome: z.string(),
    proves: z.string(),
    viewerTakeaway: z.string(),
    confidence: ConfidenceSchema,
    evidenceRefs: z.array(z.string()),
  })
  .strict();

export const ProductUnderstandingSchema = z
  .object({
    version: z.literal(1),
    product: z
      .object({
        name: nonEmpty,
        category: z.string(),
        oneLine: z.string(),
        targetUsers: z.array(z.string()),
        primaryProblem: z.string(),
        primaryValueProposition: z.string(),
      })
      .strict(),
    valueNarrative: ValueNarrativeSchema,
    capabilities: z.array(ProductCapabilitySchema),
    demoableFlows: z.array(DemoableFlowSchema).min(1),
    constraints: z.array(z.string()),
    unknowns: z.array(z.string()),
    evidence: z.array(ProductUnderstandingEvidenceSchema),
    confidence: ConfidenceSchema,
    warnings: z.array(z.string()),
  })
  .strict();

export type ProductUnderstandingEvidence = z.infer<typeof ProductUnderstandingEvidenceSchema>;
export type ValueNarrative = z.infer<typeof ValueNarrativeSchema>;
export type ProductCapability = z.infer<typeof ProductCapabilitySchema>;
export type DemoableFlow = z.infer<typeof DemoableFlowSchema>;
export type ProductUnderstanding = z.infer<typeof ProductUnderstandingSchema>;

export type DeriveProductUnderstandingInput = {
  productUrl: string;
  repoUrl?: string;
  prompt?: string;
  /** Optional user-edited directive for the LLM understanding agent (ignored by the deterministic path). */
  systemPrompt?: string;
  websiteAnalysis: ProductAnalysis;
  repoAnalysis?: RepoAnalysis;
  repoCheckoutDirectory?: string;
  signal?: AbortSignal;
};

/** Seam for a future LLM-backed understander; the default is deterministic. */
export type UnderstandProduct = (input: DeriveProductUnderstandingInput) => Promise<ProductUnderstanding>;

const INPUT_KEYWORDS = ["enter", "type", "paste", "input", "url", "link", "search", "upload", "import", "query", "prompt"];

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return "";
}

function flowLikelyNeedsInput(text: string): boolean {
  const lower = text.toLowerCase();
  return INPUT_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function describeWebsiteInputs(websiteAnalysis: ProductAnalysis): string[] {
  return websiteAnalysis.inputs
    .map((input) => firstNonEmpty(input.label, input.placeholder, input.selectorHint))
    .filter((value) => value.length > 0);
}

/**
 * Build an evidence-backed ProductUnderstanding purely from the collected analysis.
 * Deterministic and side-effect free. Throws only if the result somehow violates the
 * schema (it should not), which keeps the artifact contract honest.
 */
export function deriveProductUnderstanding(input: DeriveProductUnderstandingInput): ProductUnderstanding {
  const { websiteAnalysis, repoAnalysis, repoUrl, productUrl, prompt } = input;
  const evidence: ProductUnderstandingEvidence[] = [];
  const warnings: string[] = [];
  const unknowns: string[] = [];
  const constraints: string[] = [];

  const websiteSource = websiteAnalysis.url || productUrl;
  const repoSource = repoAnalysis?.repoUrl ?? repoUrl ?? "repository";

  let evidenceCounter = 0;
  function addEvidence(
    sourceType: ProductUnderstandingEvidence["sourceType"],
    source: string,
    claim: string,
    quoteOrReference: string,
  ): string {
    if (!claim.trim()) {
      return "";
    }
    evidenceCounter += 1;
    const id = `evidence-${evidenceCounter}`;
    evidence.push({ id, sourceType, source, claim, quoteOrReference });
    return id;
  }

  // ---- Product narrative (grounded fields filled, weak fields left as unknowns) ----
  const name = firstNonEmpty(repoAnalysis?.productName, websiteAnalysis.title) || "Unknown product";
  if (name === "Unknown product") {
    warnings.push("Product name could not be determined from the repository or website analysis.");
  }

  const oneLine = firstNonEmpty(repoAnalysis?.summary, websiteAnalysis.bodySnippets[0], websiteAnalysis.headings[0]);
  const primaryValueProposition = firstNonEmpty(websiteAnalysis.headings[0], repoAnalysis?.summary, oneLine);
  const category = firstNonEmpty(repoAnalysis?.importantTerms?.[0]);

  if (repoAnalysis?.productName) {
    addEvidence("repo", repoSource, `Product is named "${repoAnalysis.productName}".`, "repoAnalysis.productName");
  } else if (websiteAnalysis.title) {
    addEvidence("website", websiteSource, `Page title is "${websiteAnalysis.title}".`, websiteAnalysis.title);
  }
  if (repoAnalysis?.summary) {
    addEvidence("repo", repoSource, repoAnalysis.summary, "repoAnalysis.summary");
  }
  for (const heading of websiteAnalysis.headings.slice(0, 3)) {
    addEvidence("website", websiteSource, `Visible heading: "${heading}".`, heading);
  }
  const promptText = prompt?.trim() ?? "";
  if (promptText) {
    addEvidence("prompt", "user prompt", `User asked: ${promptText}`, promptText);
  }

  // ---- Capabilities (repo features first, falling back to visible UI affordances) ----
  const capabilities: ProductCapability[] = [];
  let capabilityCounter = 0;
  function addCapability(capName: string, description: string, capEvidenceRefs: string[]): void {
    if (!capName.trim() || capabilities.some((existing) => existing.name.toLowerCase() === capName.trim().toLowerCase())) {
      return;
    }
    capabilityCounter += 1;
    capabilities.push({ id: `capability-${capabilityCounter}`, name: capName.trim(), description, evidenceRefs: capEvidenceRefs });
  }

  for (const feature of repoAnalysis?.features ?? []) {
    const ref = addEvidence("repo", repoSource, feature, "repoAnalysis.features");
    addCapability(feature, feature, ref ? [ref] : []);
  }
  if (capabilities.length === 0) {
    for (const button of websiteAnalysis.buttons.slice(0, 5)) {
      const ref = addEvidence("website", websiteSource, `Button labelled "${button}".`, button);
      addCapability(button, `Visible action labelled "${button}".`, ref ? [ref] : []);
    }
  }

  // ---- Demoable flows (repo demo ideas, corroborated by visible affordances) ----
  const websiteInputs = describeWebsiteInputs(websiteAnalysis);
  const flows: DemoableFlow[] = [];
  let flowCounter = 0;
  function addFlow(
    flowName: string,
    whyItMatters: string,
    flowEvidenceRefs: string[],
    confidence: DemoableFlow["confidence"],
  ): void {
    const trimmed = flowName.trim();
    if (!trimmed || flows.some((existing) => existing.name.toLowerCase() === trimmed.toLowerCase())) {
      return;
    }
    flowCounter += 1;
    const requiredInputs = flowLikelyNeedsInput(trimmed) ? websiteInputs.slice(0, 2) : [];
    const rankReason = `Confidence ${confidence}; grounded in analysis.`;
    flows.push({
      id: `flow-${flowCounter}`,
      rank: flowCounter, // will be re-assigned after sorting
      rankReason,
      name: trimmed,
      whyItMatters,
      requiredInputs,
      expectedOutcome: `"${trimmed}" runs in the product and its result is visible on screen.`,
      proves: `Shows that ${trimmed} works end to end.`,
      viewerTakeaway: `${name} handles ${trimmed} for you.`,
      confidence,
      evidenceRefs: flowEvidenceRefs,
    });
  }

  const hasVisibleAffordances = websiteAnalysis.buttons.length > 0 || websiteInputs.length > 0;
  for (const idea of repoAnalysis?.demoIdeas ?? []) {
    // High when the repo idea is corroborated by something the page actually shows.
    const confidence: DemoableFlow["confidence"] = hasVisibleAffordances ? "high" : "medium";
    const repoRef = addEvidence("repo", repoSource, idea, "repoAnalysis.demoIdeas");
    const refs: string[] = repoRef ? [repoRef] : [];
    if (hasVisibleAffordances) {
      const websiteRef = addEvidence(
        "website",
        websiteSource,
        "Product exposes interactive controls that can drive this flow.",
        [...websiteAnalysis.buttons.slice(0, 3), ...websiteInputs.slice(0, 2)].join(", "),
      );
      if (websiteRef) refs.push(websiteRef);
    }
    addFlow(idea, "Surfaced as a demo-worthy flow in the repository analysis.", refs, confidence);
  }

  if (flows.length === 0) {
    const headline = firstNonEmpty(websiteAnalysis.headings[0], websiteAnalysis.title, name);
    let fallbackRef: string;
    if (websiteAnalysis.title) {
      fallbackRef = addEvidence("website", websiteSource, `Landing experience for "${websiteAnalysis.title}".`, websiteAnalysis.title);
    } else {
      fallbackRef = addEvidence("prompt", "user prompt", promptText || "Demo the product.", promptText || "(no prompt)");
    }
    addFlow(
      `Walk through ${headline}`,
      "Fallback flow: no explicit demo flow was found, so guide the viewer through the visible product surface.",
      fallbackRef ? [fallbackRef] : [],
      hasVisibleAffordances ? "medium" : "low",
    );
    warnings.push("No explicit demoable flow was found in the analysis; using a fallback walkthrough flow.");
  }

  // Sort flows: high → medium → low, then assign final rank by position.
  const confidenceOrder = { high: 0, medium: 1, low: 2 };
  flows.sort((a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence]);
  for (let i = 0; i < flows.length; i++) {
    flows[i] = { ...flows[i], rank: i + 1 };
  }

  // ---- Honest unknowns / constraints ----
  const targetUsers: string[] = [];
  unknowns.push("Target users are not explicitly stated in the analyzed sources.");
  unknowns.push("The selected flow's completion within the demo duration (and without authentication) is unverified.");
  if (repoAnalysis === undefined) {
    unknowns.push("No repository analysis was available; understanding is grounded only in the live website.");
    warnings.push("No repository analysis was provided.");
  }
  if (!hasVisibleAffordances) {
    unknowns.push("The website analysis exposed no buttons or inputs, so interactive flows are inferred, not confirmed.");
    warnings.push("Website analysis found no interactive affordances (buttons/inputs).");
  }
  if (flows.some((flow) => flow.requiredInputs.length > 0)) {
    constraints.push("At least one flow needs sample input data; provide safe public sample values during capture.");
  }
  constraints.push("Avoid authentication, payments, destructive actions, and navigation off the product origin.");

  // ---- Overall confidence ----
  const hasStrongFlow = flows.some((flow) => flow.confidence === "high");
  const hasBothSources = repoAnalysis !== undefined && hasVisibleAffordances;
  const confidence: ProductUnderstanding["confidence"] = hasBothSources && hasStrongFlow ? "high" : repoAnalysis !== undefined || hasVisibleAffordances ? "medium" : "low";

  // ---- Value narrative (best-effort from existing fields) ----
  const valueNarrative: ValueNarrative = {
    problem: firstNonEmpty(repoAnalysis?.summary, websiteAnalysis.headings[1], ""),
    audience: targetUsers[0] ?? (category ? `${category} users` : ""),
    howItSolves: firstNonEmpty(repoAnalysis?.summary, oneLine, ""),
    whyItMatters: primaryValueProposition,
    viewerTakeaway: firstNonEmpty(primaryValueProposition, oneLine, `${name} in action.`),
    evidenceRefs: evidence.slice(0, 3).map((e) => e.id),
  };

  return ProductUnderstandingSchema.parse({
    version: 1,
    product: {
      name,
      category,
      oneLine,
      targetUsers,
      primaryProblem: valueNarrative.problem,
      primaryValueProposition,
    },
    valueNarrative,
    capabilities,
    demoableFlows: flows,
    constraints,
    unknowns,
    evidence,
    confidence,
    warnings,
  });
}
