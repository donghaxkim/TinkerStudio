// Core-concept coverage for the Testreel path (heuristic, additive run-summary input).
//
// Canonical source: strategy.messageHierarchy + strategy.selectedFlow. Each concept maps to
// storyboard beats, then to Testreel published-video evidence when available. Coverage is
// heuristic — based on planned storyboard coverage, not verified pixels — and says so in warnings.

import { z } from "zod";
import type { DemoStrategy, Storyboard } from "./demoStrategy.js";

export const CoreCoverageItemSchema = z
  .object({
    id: z.string(),
    sourceType: z.enum(["strategy-message", "selected-flow"]),
    concept: z.string(),
    strategyMessageId: z.string().optional(),
    flowId: z.string().optional(),
    required: z.boolean(),
    status: z.enum(["captured", "planned", "missing"]),
    beatIds: z.array(z.string()),
    artifactRefs: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .strict();

export type CoreCoverageItem = z.infer<typeof CoreCoverageItemSchema>;

export type BuildCoreCoverageInput = {
  strategy: DemoStrategy;
  storyboard: Storyboard;
  finalVideoProduced: boolean;
  finalVideoRef?: string;
};

type Beat = Storyboard["beats"][number];

function isStaticBeat(beat: Beat): boolean {
  return beat.type === "hook" || beat.type === "cta" || beat.expectedUserAction === null;
}

export function buildCoreCoverage(input: BuildCoreCoverageInput): { items: CoreCoverageItem[]; warnings: string[] } {
  const { strategy, storyboard, finalVideoProduced } = input;
  const finalVideoRef = input.finalVideoRef ?? "testreel/final.mp4";
  const beats = storyboard.beats;

  function refsFor(beatIds: string[], includeFinalVideo: boolean): string[] {
    const refs = beatIds.map((id) => `storyboard.json#${id}`);
    if (includeFinalVideo) refs.push(finalVideoRef);
    return refs;
  }

  const items: CoreCoverageItem[] = [];

  // One item per strategy message.
  strategy.messageHierarchy.forEach((message, index) => {
    const strategyMessageId = `message-${index + 1}`;
    const mapped = beats.filter((b) => b.strategyMessageId === strategyMessageId);
    const beatIds = mapped.map((b) => b.id);
    const itemWarnings: string[] = [];
    let status: CoreCoverageItem["status"];
    if (mapped.length === 0) {
      status = "missing";
    } else if (mapped.every(isStaticBeat) && finalVideoProduced) {
      status = "captured";
      itemWarnings.push("Static beat — storyboard/final-video evidence, not pixel verification.");
    } else {
      status = "planned";
    }
    items.push({
      id: `core-message-${index + 1}`,
      sourceType: "strategy-message",
      concept: message,
      strategyMessageId,
      required: false,
      status,
      beatIds,
      artifactRefs: refsFor(beatIds, finalVideoProduced && status === "captured"),
      warnings: itemWarnings,
    });
  });

  // Exactly one selected-flow item (stricter: meaningful action required for captured).
  const flowName = strategy.selectedFlow.name.toLowerCase();
  const flowBeats = beats.filter(
    (b) => b.type === "screen_capture" || b.goal.toLowerCase().includes(flowName) || b.narrative.toLowerCase().includes(flowName),
  );
  const flowBeatIds = [...new Set(flowBeats.map((b) => b.id))];
  const flowWarnings: string[] = [];
  let flowStatus: CoreCoverageItem["status"];
  if (flowBeatIds.length === 0) {
    flowStatus = "missing";
  } else {
    flowStatus = "planned";
    flowWarnings.push(
      finalVideoProduced
        ? "Selected flow is not per-beat verified (final.mp4 exists but no interaction evidence maps to it)."
        : "Selected flow not captured.",
    );
  }
  items.push({
    id: "core-selected-flow",
    sourceType: "selected-flow",
    concept: strategy.selectedFlow.name,
    flowId: strategy.selectedFlow.sourceFlowId,
    required: true,
    status: flowStatus,
    beatIds: flowBeatIds,
    artifactRefs: refsFor(flowBeatIds, false),
    warnings: flowWarnings,
  });

  // Top-level warnings.
  const warnings: string[] = ["Core coverage is heuristic — derived from storyboard and published-video presence, not verified video pixels."];
  const gaps = items.filter((i) => i.status !== "captured");
  if (gaps.length > 0) {
    const requiredGaps = gaps.filter((i) => i.required).map((i) => i.id);
    warnings.push(
      `Core concepts not fully captured: ${gaps.map((i) => `${i.id}=${i.status}`).join(", ")}` +
        (requiredGaps.length ? ` (required: ${requiredGaps.join(", ")})` : ""),
    );
  }

  return { items, warnings };
}
