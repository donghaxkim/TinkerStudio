// Capture lineage artifact (first pass)
//
// The executed CapturePlan is validated by a STRICT schema (every step type is
// `.strict()`), so we cannot stamp `beatId`/`intent` onto the steps themselves without
// breaking planner validation. Instead this emits a separate `capture-lineage.json` that
// maps each capture step (by index) to the storyboard beat it serves — keeping the capture
// plan exactly as executed while still giving downstream tooling first-class lineage.
//
// The mapping is DERIVED (proportional), not planner-emitted; that is recorded in `note`.

import type { CapturePlan } from "@tinker/browser-capture";
import { z } from "zod";
import type { Storyboard } from "./demoStrategy.js";

export const CaptureLineageStepSchema = z
  .object({
    stepIndex: z.number(),
    type: z.string(),
    selector: z.string().optional(),
    beatId: z.string(),
    intent: z.string(),
  })
  .strict();

export const CaptureLineageSchema = z
  .object({
    version: z.literal(1),
    note: z.string(),
    steps: z.array(CaptureLineageStepSchema),
  })
  .strict();

export type CaptureLineageStep = z.infer<typeof CaptureLineageStepSchema>;
export type CaptureLineage = z.infer<typeof CaptureLineageSchema>;

/**
 * Map a 0-based position within `total` ordered items onto a storyboard beat index.
 * Shared by both the action-trace beat stamping and the capture-lineage artifact so they
 * stay consistent.
 */
export function beatIndexForPosition(index: number, total: number, beatCount: number): number {
  if (beatCount <= 0 || total <= 0) {
    return 0;
  }
  return Math.min(beatCount - 1, Math.floor((index * beatCount) / total));
}

export function buildCaptureLineage(capturePlan: CapturePlan, storyboard: Storyboard): CaptureLineage {
  const beats = storyboard.beats;
  const total = capturePlan.steps.length;

  const steps = capturePlan.steps.map((step, index) => {
    const beat = beats[beatIndexForPosition(index, total, beats.length)];
    const selector = "selector" in step && step.selector ? step.selector : undefined;
    return CaptureLineageStepSchema.parse({
      stepIndex: index,
      type: step.type,
      ...(selector ? { selector } : {}),
      beatId: beat?.id ?? "",
      intent: beat?.goal ?? "",
    });
  });

  return CaptureLineageSchema.parse({
    version: 1,
    note: "Derived (proportional) capture-step → storyboard-beat lineage; not planner-emitted.",
    steps,
  });
}
