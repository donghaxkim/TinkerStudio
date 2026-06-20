// Demo Strategy + Story phase (first pass)
//
// Consumes `product-understanding.json` and turns it into a single committed plan:
//   - `demo-strategy.json` : the strategic choices (angle, the one flow to show, the
//     message hierarchy, success criteria, risks)
//   - `storyboard.json`    : a beat-by-beat story whose beats carry lineage back to the
//     strategy messages (`strategyMessageId`) and to the understanding capabilities
//     (`proofPointId`)
//
// Deterministic and pluggable behind the `Strategize` seam, exactly like the
// understanding phase. No user back-and-forth: it auto-selects the strongest flow.
// The selection heuristic in `selectFlow` is deliberately small and documented so it
// can be tuned (or replaced with a future chat-driven override) without touching the
// artifact contract.

import { z } from "zod";
import type { DemoOutline, DemoOutlineScene } from "@tinker/generation-contract";
import type { ProductUnderstanding } from "./productUnderstanding.js";
import type { AspectRatio } from "./types.js";

const AspectRatioSchema = z.enum(["16:9", "9:16", "1:1"]);
const ImportanceSchema = z.enum(["high", "medium", "low"]);

export const DemoStrategySchema = z
  .object({
    version: z.literal(1),
    selectedAngle: z
      .object({
        title: z.string().trim().min(1),
        whyThisAngle: z.string(),
        targetAudience: z.string(),
        primaryProof: z.string(),
      })
      .strict(),
    selectedFlow: z
      .object({
        sourceFlowId: z.string().trim().min(1),
        name: z.string().trim().min(1),
        reason: z.string(),
      })
      .strict(),
    messageHierarchy: z.array(z.string().trim().min(1)).min(1),
    successCriteria: z.array(z.string()),
    risks: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .strict();

export const StoryboardBeatSchema = z
  .object({
    id: z.string().trim().min(1),
    type: z.enum(["hook", "screen_capture", "feature", "proof", "cta"]).optional(),
    goal: z.string().trim().min(1),
    visual: z.string(),
    narrative: z.string(),
    strategyMessageId: z.string(),
    proofPointId: z.string(),
    expectedUserAction: z.string().nullable(),
    importance: ImportanceSchema,
    startHint: z.number().finite().nonnegative().optional(),
    endHint: z.number().finite().nonnegative().optional(),
  })
  .strict();

export const StoryboardSchema = z
  .object({
    version: z.literal(1),
    title: z.string().trim().min(1),
    durationTargetSeconds: z.number().finite().positive(),
    aspectRatio: AspectRatioSchema,
    beats: z.array(StoryboardBeatSchema).min(1),
  })
  .strict();

export type DemoStrategy = z.infer<typeof DemoStrategySchema>;
export type StoryboardBeat = z.infer<typeof StoryboardBeatSchema>;
export type Storyboard = z.infer<typeof StoryboardSchema>;

export type DeriveDemoStrategyInput = {
  understanding: ProductUnderstanding;
  prompt?: string;
  approvedOutline?: DemoOutline;
  /** Optional user-edited directive for the LLM strategy agent (ignored by the deterministic path). */
  systemPrompt?: string;
  durationCapSeconds: number;
  aspectRatio: AspectRatio;
  signal?: AbortSignal;
};

export type DemoStrategyResult = {
  strategy: DemoStrategy;
  storyboard: Storyboard;
};

/** Seam for a future LLM/chat-driven strategist; the default is deterministic. */
export type Strategize = (input: DeriveDemoStrategyInput) => Promise<DemoStrategyResult>;

type Flow = ProductUnderstanding["demoableFlows"][number];

const CONFIDENCE_WEIGHT: Record<Flow["confidence"], number> = { high: 3, medium: 2, low: 1 };

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3),
  );
}

function overlapCount(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const token of a) {
    if (b.has(token)) {
      count += 1;
    }
  }
  return count;
}

const SCENE_SUPPORT_STOPWORDS = new Set([
  "and",
  "with",
  "the",
  "for",
  "from",
  "that",
  "this",
  "user",
  "users",
  "show",
  "open",
  "close",
  "closing",
  "cta",
  "demo",
  "workflow",
  "screen",
  "safe",
  "confirm",
  "visual",
  "output",
  "result",
]);

function contentTokens(text: string): Set<string> {
  return new Set([...tokenize(text)].filter((token) => !SCENE_SUPPORT_STOPWORDS.has(token)));
}

/**
 * Pick the single strongest flow to build the demo around.
 *
 * Heuristic (intentionally simple and tunable):
 *   score = confidenceWeight(3/2/1)
 *         + 2 * (prompt mentions this flow)        // honour what the user asked for
 *         + 0.5 * min(evidenceCount, 3)            // prefer better-grounded flows
 * Ties break toward the earlier flow (repo demo ideas come first), which keeps the
 * choice stable across runs.
 */
export function selectFlow(flows: readonly Flow[], prompt: string): Flow {
  if (flows.length === 0) {
    throw new Error("deriveDemoStrategy requires at least one demoable flow");
  }

  const promptTokens = tokenize(prompt);
  let best = flows[0];
  let bestScore = -Infinity;

  flows.forEach((flow) => {
    const promptMatch = overlapCount(promptTokens, tokenize(flow.name)) > 0 ? 2 : 0;
    const evidenceScore = 0.5 * Math.min(flow.evidenceRefs.length, 3);
    const score = CONFIDENCE_WEIGHT[flow.confidence] + promptMatch + evidenceScore;
    if (score > bestScore) {
      best = flow;
      bestScore = score;
    }
  });

  return best;
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return "";
}

function findBackingCapability(understanding: ProductUnderstanding, flow: Flow): string {
  const flowTokens = tokenize(flow.name);
  const match = understanding.capabilities.find((capability) => overlapCount(flowTokens, tokenize(capability.name)) > 0);
  return (match ?? understanding.capabilities[0])?.id ?? "capability-1";
}

type TimedBeat = Omit<StoryboardBeat, "startHint" | "endHint">;

/** Distribute beats across the duration with a Hook/Demo/Proof/CTA weighting. */
function withTiming(beats: TimedBeat[], durationTargetSeconds: number): StoryboardBeat[] {
  const weights = beats.map((beat) => (beat.type === "hook" ? 1.5 : beat.type === "screen_capture" ? 4 : beat.type === "proof" ? 2.5 : 1));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = 0;
  return beats.map((beat, index) => {
    const start = Math.round((cursor / totalWeight) * durationTargetSeconds * 100) / 100;
    cursor += weights[index];
    const end = Math.round((cursor / totalWeight) * durationTargetSeconds * 100) / 100;
    return { ...beat, startHint: start, endHint: Math.min(end, durationTargetSeconds) };
  });
}

function outlineSceneType(scene: DemoOutlineScene, index: number, total: number): NonNullable<StoryboardBeat["type"]> {
  if (index === 0) return "hook";
  if (index === total - 1) return "cta";
  const text = `${scene.goal} ${scene.visual}`.toLowerCase();
  if (scene.evidence.includes("website") || /\b(click|type|enter|paste|scroll|select|open|show|workflow|walkthrough|homepage|screen|ui|button|form|dashboard|route)\b/.test(text)) {
    return "screen_capture";
  }
  if (/\b(proof|result|outcome|evidence|metric|export|finished|success)\b/.test(text)) {
    return "proof";
  }
  return "feature";
}

function approvedTiming(scene: DemoOutlineScene, fallback: StoryboardBeat, durationCapSeconds: number): Pick<StoryboardBeat, "startHint" | "endHint"> {
  if (scene.startHint !== undefined && scene.endHint !== undefined && scene.endHint > scene.startHint) {
    const startHint = Math.min(scene.startHint, durationCapSeconds);
    const endHint = Math.min(scene.endHint, durationCapSeconds);
    if (endHint > startHint) {
      return { startHint, endHint };
    }
  }
  return {
    ...(fallback.startHint === undefined ? {} : { startHint: fallback.startHint }),
    ...(fallback.endHint === undefined ? {} : { endHint: fallback.endHint }),
  };
}

function supportCorpusTokens(understanding: ProductUnderstanding): Set<string> {
  return contentTokens(
    [
      understanding.product.name,
      understanding.product.category,
      understanding.product.oneLine,
      understanding.product.primaryProblem,
      understanding.product.primaryValueProposition,
      ...understanding.product.targetUsers,
      understanding.valueNarrative.problem,
      understanding.valueNarrative.audience,
      understanding.valueNarrative.howItSolves,
      understanding.valueNarrative.whyItMatters,
      understanding.valueNarrative.viewerTakeaway,
      ...understanding.capabilities.flatMap((capability) => [capability.name, capability.description]),
      ...understanding.demoableFlows.flatMap((flow) => [flow.name, flow.whyItMatters, ...flow.requiredInputs, flow.expectedOutcome, flow.proves, flow.viewerTakeaway]),
      ...understanding.evidence.flatMap((evidence) => [evidence.claim, evidence.quoteOrReference]),
    ].join(" "),
  );
}

function unsupportedOutlineWarnings(understanding: ProductUnderstanding, outline: DemoOutline): string[] {
  const availableSources = new Set(understanding.evidence.map((evidence) => evidence.sourceType));
  const supportedTokens = supportCorpusTokens(understanding);
  return outline.scenes.flatMap((scene) => {
    const evidenceWarnings = scene.evidence
      .filter((source) => !availableSources.has(source))
      .map((source) => `Approved scene ${scene.id} requests ${source} evidence, but the current understanding has no ${source} evidence.`);
    const sceneTokens = contentTokens(`${scene.goal} ${scene.visual}`);
    if (sceneTokens.size > 0 && overlapCount(sceneTokens, supportedTokens) === 0) {
      return [
        ...evidenceWarnings,
        `Approved scene ${scene.id} is unsupported: cannot match its goal or visual to available demoable flows, capabilities, evidence, or product text.`,
      ];
    }
    return evidenceWarnings;
  });
}

function deriveApprovedOutlineStrategy(input: DeriveDemoStrategyInput & { approvedOutline: DemoOutline }): DemoStrategyResult {
  const { understanding, approvedOutline, durationCapSeconds, aspectRatio } = input;
  const { product } = understanding;
  const flow = understanding.demoableFlows[0];
  if (flow === undefined) {
    throw new Error("deriveDemoStrategy requires at least one demoable flow");
  }
  const proofPointId = findBackingCapability(understanding, flow);
  const messageHierarchy = approvedOutline.scenes
    .map((scene) => scene.goal.trim())
    .filter((message, index, all) => message.length > 0 && all.indexOf(message) === index);
  const messageId = (index: number): string => `message-${Math.min(index, messageHierarchy.length - 1) + 1}`;

  const strategy: DemoStrategy = DemoStrategySchema.parse({
    version: 1,
    selectedAngle: {
      title: approvedOutline.title,
      whyThisAngle: `User approved this outline: ${approvedOutline.summary}`,
      targetAudience: firstNonEmpty(understanding.valueNarrative.audience, product.targetUsers[0], `prospective ${product.name} users`),
      primaryProof: firstNonEmpty(flow.proves, flow.expectedOutcome, understanding.valueNarrative.whyItMatters),
    },
    selectedFlow: {
      sourceFlowId: flow.id,
      name: flow.name,
      reason: `Selected to support the approved outline. ${approvedOutline.generationNotes.join(" ")}`.trim(),
    },
    messageHierarchy: messageHierarchy.length > 0 ? messageHierarchy : [approvedOutline.summary],
    successCriteria: [
      `Storyboard preserves ${approvedOutline.scenes.length} approved scenes in order.`,
      `Total runtime stays at or under ${durationCapSeconds}s.`,
    ],
    risks: [...understanding.unknowns.slice(0, 2)],
    warnings: [...understanding.warnings, ...unsupportedOutlineWarnings(understanding, approvedOutline)],
  });

  const untimedBeats: TimedBeat[] = approvedOutline.scenes.map((scene, index) => {
    const type = outlineSceneType(scene, index, approvedOutline.scenes.length);
    return {
      id: scene.id,
      type,
      goal: scene.goal,
      visual: scene.visual,
      narrative: scene.narration ?? scene.goal,
      strategyMessageId: messageId(index),
      proofPointId,
      expectedUserAction: type === "screen_capture" ? scene.goal : null,
      importance: index === approvedOutline.scenes.length - 1 ? "medium" : "high",
    };
  });
  const fallbackTimed = withTiming(untimedBeats, durationCapSeconds);
  const beats = fallbackTimed.map((beat, index) => ({
    ...beat,
    ...approvedTiming(approvedOutline.scenes[index]!, beat, durationCapSeconds),
  }));

  const storyboard: Storyboard = StoryboardSchema.parse({
    version: 1,
    title: approvedOutline.title,
    durationTargetSeconds: durationCapSeconds,
    aspectRatio,
    beats,
  });

  return { strategy, storyboard };
}

export function deriveDemoStrategy(input: DeriveDemoStrategyInput): DemoStrategyResult {
  if (input.approvedOutline !== undefined) {
    return deriveApprovedOutlineStrategy({ ...input, approvedOutline: input.approvedOutline });
  }

  const { understanding, prompt = "", durationCapSeconds, aspectRatio } = input;
  const { product } = understanding;
  const flow = selectFlow(understanding.demoableFlows, prompt);

  const headline = firstNonEmpty(understanding.valueNarrative.viewerTakeaway, product.primaryValueProposition, product.oneLine, product.name);
  const primaryProof = firstNonEmpty(flow.proves, flow.expectedOutcome, understanding.valueNarrative.whyItMatters);
  const ctaMessage = `Try ${product.name} for yourself.`;

  // ---- Message hierarchy (ordered, de-duplicated). Beats reference these by id. ----
  const messageHierarchy = [headline, firstNonEmpty(flow.whyItMatters, `${flow.name} in action`), primaryProof, ctaMessage]
    .map((message) => message.trim())
    .filter((message, index, all) => message.length > 0 && all.indexOf(message) === index);
  const messageId = (index: number): string => `message-${Math.min(index, messageHierarchy.length - 1) + 1}`;

  const promptMatched = overlapCount(tokenize(prompt), tokenize(flow.name)) > 0;
  const targetAudience = firstNonEmpty(
    understanding.valueNarrative.audience,
    product.targetUsers[0],
    product.category ? `${product.category} users evaluating ${product.name}` : undefined,
    `prospective ${product.name} users`,
  );

  const risks: string[] = [];
  if (flow.confidence !== "high") {
    risks.push(`Selected flow confidence is ${flow.confidence}; the capture may need a fallback path.`);
  }
  if (flow.requiredInputs.length > 0) {
    risks.push(`Flow requires input: ${flow.requiredInputs.join(", ")}. Use safe public sample data during capture.`);
  }
  for (const unknown of understanding.unknowns.slice(0, 2)) {
    risks.push(unknown);
  }

  const strategy: DemoStrategy = DemoStrategySchema.parse({
    version: 1,
    selectedAngle: {
      title: firstNonEmpty(`${product.name} — ${flow.name}`, product.name),
      whyThisAngle: `${firstNonEmpty(flow.whyItMatters, "Strongest demoable flow")} Confidence: ${flow.confidence}.${
        promptMatched ? " Directly matches the user's prompt." : ""
      }`,
      targetAudience,
      primaryProof,
    },
    selectedFlow: {
      sourceFlowId: flow.id,
      name: flow.name,
      reason: `Chosen as the strongest flow (confidence ${flow.confidence}${promptMatched ? ", matches the prompt" : ""}).`,
    },
    messageHierarchy,
    successCriteria: [
      `Viewer understands that ${product.name} ${headline ? `delivers: ${headline}` : "solves their problem"}.`,
      `The "${flow.name}" flow is shown completing on screen.`,
      `Total runtime stays at or under ${durationCapSeconds}s.`,
    ],
    risks,
    warnings: understanding.warnings,
  });

  // ---- Storyboard with lineage back to messages + capabilities ----
  const proofPointId = findBackingCapability(understanding, flow);
  const demoAction = flow.requiredInputs.length > 0 ? `Provide ${flow.requiredInputs[0]}` : `Trigger ${flow.name}`;

  const beats = withTiming(
    [
      {
        id: "beat-1",
        type: "hook",
        goal: `Hook: ${firstNonEmpty(headline, product.name)}`,
        visual: "Product landing / hero state",
        narrative: headline,
        strategyMessageId: messageId(0),
        proofPointId,
        expectedUserAction: null,
        importance: "high",
      },
      {
        id: "beat-2",
        type: "screen_capture",
        goal: `Demonstrate ${flow.name}`,
        visual: "Primary product workflow in the live UI",
        narrative: firstNonEmpty(flow.whyItMatters, `${flow.name} in action`),
        strategyMessageId: messageId(1),
        proofPointId,
        expectedUserAction: demoAction,
        importance: "high",
      },
      {
        id: "beat-3",
        type: "proof",
        goal: `Reveal the result: ${primaryProof}`,
        visual: "Generated result / success state",
        narrative: flow.viewerTakeaway || primaryProof,
        strategyMessageId: messageId(2),
        proofPointId,
        expectedUserAction: null,
        importance: "high",
      },
      {
        id: "beat-4",
        type: "cta",
        goal: `Invite the viewer to try ${product.name}`,
        visual: "Call to action / closing frame",
        narrative: ctaMessage,
        strategyMessageId: messageId(messageHierarchy.length - 1),
        proofPointId,
        expectedUserAction: null,
        importance: "medium",
      },
    ],
    durationCapSeconds,
  );

  const storyboard: Storyboard = StoryboardSchema.parse({
    version: 1,
    title: firstNonEmpty(`${product.name} demo`, product.name, "Product demo"),
    durationTargetSeconds: durationCapSeconds,
    aspectRatio,
    beats,
  });

  return { strategy, storyboard };
}
