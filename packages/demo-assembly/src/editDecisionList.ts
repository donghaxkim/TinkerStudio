// Edit Decision List (Director Mode, first pass)
//
// Reads the action trace and decides where to COMPRESS dead time: gaps longer than
// `gapThresholdSeconds` (default 0.8s) between meaningful actions are squeezed down to a
// short 0.25-0.5s beat. The result (`edit-decision-list.json`) is the timeline-compression
// contract a downstream editor/compose pass applies to the DemoProject so the demo stops
// dragging. Deterministic and pure over the trace.

import type { ActionTrace, ActionTraceEntry } from "@tinker/browser-capture";
import { z } from "zod";

export const EditDecisionSchema = z
  .object({
    id: z.string(),
    kind: z.enum(["compress-gap", "trim-lead", "trim-tail"]),
    afterActionId: z.string().optional(),
    beforeActionId: z.string().optional(),
    fromTime: z.number(),
    toTime: z.number(),
    originalGapSeconds: z.number(),
    compressedGapSeconds: z.number(),
    removedSeconds: z.number(),
    reason: z.string(),
  })
  .strict();

export const EditDecisionListSchema = z
  .object({
    version: z.literal(1),
    gapThresholdSeconds: z.number(),
    sourceDurationSeconds: z.number(),
    compressedDurationSeconds: z.number(),
    removedSeconds: z.number(),
    cuts: z.array(EditDecisionSchema),
    notes: z.array(z.string()),
  })
  .strict();

export type EditDecision = z.infer<typeof EditDecisionSchema>;
export type EditDecisionList = z.infer<typeof EditDecisionListSchema>;

export type BuildEditDecisionListOptions = {
  /** Gaps longer than this (seconds) are compressed. */
  gapThresholdSeconds?: number;
  /** Lower/upper bounds for the compressed beat length (seconds). */
  minCompressedSeconds?: number;
  maxCompressedSeconds?: number;
  /** Optional requested output duration. Compression should not go materially below it. */
  targetDurationSeconds?: number;
};

const DEFAULT_GAP_THRESHOLD_SECONDS = 0.8;
const DEFAULT_MIN_COMPRESSED_SECONDS = 0.25;
const DEFAULT_MAX_COMPRESSED_SECONDS = 0.5;
const MEANINGFUL: ReadonlySet<ActionTraceEntry["type"]> = new Set([
  "navigation",
  "click",
  "type",
  "scroll",
  "hover",
  "press",
]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function traceDurationSeconds(trace: ActionTrace): number {
  const start = Date.parse(trace.startedAt);
  const end = Date.parse(trace.completedAt);
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    return round((end - start) / 1000);
  }
  const last = trace.actions[trace.actions.length - 1];
  return last ? round(last.endTime) : 0;
}

/** How long the compressed beat for a given dead gap should be. */
function compressedGapFor(gap: number, min: number, max: number): number {
  return round(clamp(gap * 0.4, min, max));
}

function restoreCutTime(cuts: EditDecision[], targetDurationSeconds: number | undefined, sourceDurationSeconds: number) {
  if (targetDurationSeconds === undefined || !Number.isFinite(targetDurationSeconds) || targetDurationSeconds <= 0) {
    return cuts;
  }
  if (targetDurationSeconds >= sourceDurationSeconds) {
    return cuts;
  }

  const desiredRemovedSeconds = Math.max(0, round(sourceDurationSeconds - Math.min(targetDurationSeconds, sourceDurationSeconds)));
  const currentRemovedSeconds = round(cuts.reduce((sum, cut) => sum + cut.removedSeconds, 0));
  let restoreSeconds = round(currentRemovedSeconds - desiredRemovedSeconds);
  if (restoreSeconds <= 0) {
    return cuts;
  }

  const adjusted = cuts.map((cut) => ({ ...cut }));
  const restoreByKind: EditDecision["kind"][] = ["compress-gap", "trim-tail", "trim-lead"];

  for (const kind of restoreByKind) {
    const indexes = adjusted
      .map((cut, index) => ({ cut, index, capacity: round(cut.originalGapSeconds - cut.compressedGapSeconds) }))
      .filter((entry) => entry.cut.kind === kind && entry.capacity > 0);
    const totalCapacity = round(indexes.reduce((sum, entry) => sum + entry.capacity, 0));
    if (totalCapacity <= 0) {
      continue;
    }

    const targetTierRestore = Math.min(restoreSeconds, totalCapacity);
    let tierRestore = targetTierRestore;
    indexes.forEach((entry, entryIndex) => {
      const isLast = entryIndex === indexes.length - 1;
      const amount = isLast ? tierRestore : round(Math.min(entry.capacity, (targetTierRestore * entry.capacity) / totalCapacity));
      entry.cut.compressedGapSeconds = round(entry.cut.compressedGapSeconds + amount);
      entry.cut.removedSeconds = round(entry.cut.originalGapSeconds - entry.cut.compressedGapSeconds);
      tierRestore = round(tierRestore - amount);
    });

    restoreSeconds = round(currentRemovedSeconds - desiredRemovedSeconds - adjusted.reduce((sum, cut, index) => sum + (cuts[index]!.removedSeconds - cut.removedSeconds), 0));
    if (restoreSeconds <= 0) {
      break;
    }
  }

  return adjusted;
}

export function buildEditDecisionList(trace: ActionTrace, options: BuildEditDecisionListOptions = {}): EditDecisionList {
  const gapThresholdSeconds = options.gapThresholdSeconds ?? DEFAULT_GAP_THRESHOLD_SECONDS;
  const minCompressed = options.minCompressedSeconds ?? DEFAULT_MIN_COMPRESSED_SECONDS;
  const maxCompressed = options.maxCompressedSeconds ?? DEFAULT_MAX_COMPRESSED_SECONDS;

  const sourceDurationSeconds = traceDurationSeconds(trace);
  const meaningful = trace.actions
    .filter((action) => MEANINGFUL.has(action.type))
    .slice()
    .sort((a, b) => a.startTime - b.startTime);

  const cuts: EditDecision[] = [];

  // Leading dead time before the first meaningful action.
  const first = meaningful[0];
  if (first && first.startTime > gapThresholdSeconds) {
    const gap = round(first.startTime);
    const compressed = compressedGapFor(gap, minCompressed, maxCompressed);
    cuts.push({
      id: "edl-lead",
      kind: "trim-lead",
      beforeActionId: first.id,
      fromTime: 0,
      toTime: round(first.startTime),
      originalGapSeconds: gap,
      compressedGapSeconds: compressed,
      removedSeconds: round(gap - compressed),
      reason: `Trim ${gap.toFixed(2)}s of lead-in before the first action`,
    });
  }

  // Gaps between consecutive meaningful actions.
  for (let i = 1; i < meaningful.length; i += 1) {
    const previous = meaningful[i - 1];
    const current = meaningful[i];
    const gap = round(current.startTime - previous.endTime);
    if (gap > gapThresholdSeconds) {
      const compressed = compressedGapFor(gap, minCompressed, maxCompressed);
      cuts.push({
        id: `edl-gap-${i}`,
        kind: "compress-gap",
        afterActionId: previous.id,
        beforeActionId: current.id,
        fromTime: round(previous.endTime),
        toTime: round(current.startTime),
        originalGapSeconds: gap,
        compressedGapSeconds: compressed,
        removedSeconds: round(gap - compressed),
        reason: `Compress ${gap.toFixed(2)}s dead gap between ${previous.id} and ${current.id}`,
      });
    }
  }

  // Trailing dead time after the last meaningful action.
  const last = meaningful[meaningful.length - 1];
  if (last && sourceDurationSeconds - last.endTime > gapThresholdSeconds) {
    const gap = round(sourceDurationSeconds - last.endTime);
    const compressed = compressedGapFor(gap, minCompressed, maxCompressed);
    cuts.push({
      id: "edl-tail",
      kind: "trim-tail",
      afterActionId: last.id,
      fromTime: round(last.endTime),
      toTime: round(sourceDurationSeconds),
      originalGapSeconds: gap,
      compressedGapSeconds: compressed,
      removedSeconds: round(gap - compressed),
      reason: `Trim ${gap.toFixed(2)}s of dead time after the last action`,
    });
  }

  const balancedCuts = restoreCutTime(cuts, options.targetDurationSeconds, sourceDurationSeconds);
  const removedSeconds = round(balancedCuts.reduce((sum, cut) => sum + cut.removedSeconds, 0));
  const notes = [
    `Gaps longer than ${gapThresholdSeconds}s are compressed to ${minCompressed}-${maxCompressed}s.`,
    "First pass: a downstream compose/editor step applies these cuts to the DemoProject timeline.",
  ];
  if (options.targetDurationSeconds !== undefined) {
    notes.push(`Compression was balanced against a ${options.targetDurationSeconds}s target duration.`);
  }

  return EditDecisionListSchema.parse({
    version: 1,
    gapThresholdSeconds,
    sourceDurationSeconds,
    compressedDurationSeconds: round(Math.max(0, sourceDurationSeconds - removedSeconds)),
    removedSeconds,
    cuts: balancedCuts,
    notes,
  });
}
