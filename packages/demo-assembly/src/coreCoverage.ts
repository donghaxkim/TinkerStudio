// Core-concept coverage for the Testreel path (heuristic, additive run-summary input).
//
// Canonical source: strategy.messageHierarchy + strategy.selectedFlow. Each concept maps to
// storyboard beats, then to captured evidence via action-trace (beatId + type). Coverage is
// heuristic — proportional capture-lineage, not verified pixels — and says so in warnings.

import { z } from "zod";
import type { DemoStrategy, Storyboard } from "./demoStrategy.js";

export const MEANINGFUL_ACTION_TYPES: readonly string[] = ["click", "type", "press"];

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

export type CoreActionTrace = { actions: Array<{ type: string; beatId?: string }> };
export type CoreCaptureLineage = { steps: Array<{ beatId?: string }> };

export type BuildCoreCoverageInput = {
  strategy: DemoStrategy;
  storyboard: Storyboard;
  actionTrace?: CoreActionTrace;
  captureLineage?: CoreCaptureLineage;
  finalVideoProduced: boolean;
  finalVideoRef?: string;
};

type Beat = Storyboard["beats"][number];

function isStaticBeat(beat: Beat): boolean {
  return beat.type === "hook" || beat.type === "cta" || beat.expectedUserAction === null;
}

export function buildCoreCoverage(input: BuildCoreCoverageInput): { items: CoreCoverageItem[]; warnings: string[] } {
  const { strategy, storyboard, actionTrace, captureLineage, finalVideoProduced } = input;
  const finalVideoRef = input.finalVideoRef ?? "testreel/final.mp4";
  const beats = storyboard.beats;
  const hasTrace = actionTrace !== undefined && actionTrace.actions.length > 0;

  const meaningfulBeatIds = new Set<string>(
    (actionTrace?.actions ?? [])
      .filter((a) => a.beatId !== undefined && MEANINGFUL_ACTION_TYPES.includes(a.type))
      .map((a) => a.beatId as string),
  );
  const hasMeaningful = (beatIds: string[]) => beatIds.some((id) => meaningfulBeatIds.has(id));

  function refsFor(beatIds: string[], meaningful: boolean, includeFinalVideo: boolean): string[] {
    const refs = beatIds.map((id) => `storyboard.json#${id}`);
    if (meaningful && actionTrace) refs.push(...beatIds.filter((id) => meaningfulBeatIds.has(id)).map((id) => `testreel/action-trace.json#${id}`));
    if (meaningful && captureLineage) refs.push("testreel/capture-lineage.json");
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
    } else if (hasMeaningful(beatIds)) {
      status = "captured";
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
      artifactRefs: refsFor(beatIds, status === "captured" && hasMeaningful(beatIds), finalVideoProduced && status === "captured"),
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
  } else if (hasMeaningful(flowBeatIds)) {
    flowStatus = "captured";
  } else {
    flowStatus = "planned";
    flowWarnings.push(
      finalVideoProduced
        ? "Selected flow not demonstrated by a captured interaction (final.mp4 exists but no click/type/press maps to it)."
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
    artifactRefs: refsFor(flowBeatIds, flowStatus === "captured", finalVideoProduced && flowStatus === "captured"),
    warnings: flowWarnings,
  });

  // Top-level warnings.
  const warnings: string[] = ["Core coverage is heuristic — derived from proportional capture lineage, not verified video pixels."];
  if (!hasTrace) warnings.push("No capture-lineage/action-trace evidence available; core coverage is storyboard-only.");
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
