import type { CapturePlan } from "@tinker/browser-capture";
import type { DemoOutline } from "@tinker/generation-contract";
import { z } from "zod";
import { beatIndexForPosition } from "./captureLineage.js";
import { MEANINGFUL_ACTION_TYPES } from "./coreCoverage.js";
import type { Storyboard } from "./demoStrategy.js";

export const ApprovedOutlineLineageItemSchema = z
  .object({
    sceneId: z.string().trim().min(1),
    goal: z.string().trim().min(1),
    status: z.enum(["captured", "planned", "unsupported"]),
    storyboardBeatIds: z.array(z.string().trim().min(1)),
    captureStepIndexes: z.array(z.number().int().nonnegative()),
    warnings: z.array(z.string()),
  })
  .strict();

export const ApprovedOutlineCoverageSchema = z
  .object({
    items: z.array(ApprovedOutlineLineageItemSchema),
    warnings: z.array(z.string()),
  })
  .strict();

export const ApprovedOutlineLineageSchema = ApprovedOutlineCoverageSchema.extend({
  version: z.literal(1),
  approvedOutlinePresent: z.literal(true),
}).strict();

export type ApprovedOutlineLineageItem = z.infer<typeof ApprovedOutlineLineageItemSchema>;
export type ApprovedOutlineCoverage = z.infer<typeof ApprovedOutlineCoverageSchema>;
export type ApprovedOutlineLineage = z.infer<typeof ApprovedOutlineLineageSchema>;

export type BuildApprovedOutlineLineageInput = {
  approvedOutline: DemoOutline;
  storyboard: Storyboard;
  capturePlan: CapturePlan;
  finalVideoProduced: boolean;
};

function beatIdsForCaptureSteps(capturePlan: CapturePlan, storyboard: Storyboard): Map<string, number[]> {
  const mapped = new Map<string, number[]>();
  const total = capturePlan.steps.length;
  capturePlan.steps.forEach((step, index) => {
    const beat = storyboard.beats[beatIndexForPosition(index, total, storyboard.beats.length)];
    if (beat === undefined) return;
    const indexes = mapped.get(beat.id) ?? [];
    indexes.push(index);
    mapped.set(beat.id, indexes);
  });
  return mapped;
}

function meaningfulBeatIds(capturePlan: CapturePlan, storyboard: Storyboard): Set<string> {
  const ids = new Set<string>();
  const total = capturePlan.steps.length;
  capturePlan.steps.forEach((step, index) => {
    if (!MEANINGFUL_ACTION_TYPES.includes(step.type)) return;
    const beat = storyboard.beats[beatIndexForPosition(index, total, storyboard.beats.length)];
    if (beat !== undefined) ids.add(beat.id);
  });
  return ids;
}

function mappedBeatIdsForScene(sceneId: string, index: number, storyboard: Storyboard, warnings: string[]): string[] {
  const exact = storyboard.beats.filter((beat) => beat.id === sceneId).map((beat) => beat.id);
  if (exact.length > 0) return exact;

  const inferred = storyboard.beats[index];
  if (inferred === undefined) return [];
  warnings.push(`Approved scene ${sceneId} mapped to storyboard beat ${inferred.id} by order because ids differ.`);
  return [inferred.id];
}

function isStaticBeat(beat: Storyboard["beats"][number] | undefined): boolean {
  return beat?.type === "hook" || beat?.type === "cta" || beat?.expectedUserAction === null;
}

export function buildApprovedOutlineLineage(input: BuildApprovedOutlineLineageInput): ApprovedOutlineLineage {
  const stepIndexesByBeat = beatIdsForCaptureSteps(input.capturePlan, input.storyboard);
  const meaningful = meaningfulBeatIds(input.capturePlan, input.storyboard);
  const warnings: string[] = [];

  const items = input.approvedOutline.scenes.map((scene, index) => {
    const itemWarnings: string[] = [];
    const beatIds = mappedBeatIdsForScene(scene.id, index, input.storyboard, itemWarnings);
    warnings.push(...itemWarnings);
    const captureStepIndexes = beatIds.flatMap((beatId) => stepIndexesByBeat.get(beatId) ?? []);
    const mappedBeats = beatIds.map((beatId) => input.storyboard.beats.find((beat) => beat.id === beatId));
    let status: ApprovedOutlineLineageItem["status"];

    if (beatIds.length === 0) {
      status = "unsupported";
      itemWarnings.push(`Approved scene ${scene.id} was not mapped to any storyboard beat.`);
    } else if (beatIds.some((beatId) => meaningful.has(beatId))) {
      status = "captured";
    } else if (mappedBeats.every(isStaticBeat) && input.finalVideoProduced) {
      status = "captured";
      itemWarnings.push("Static scene — final-video/storyboard evidence, not pixel verification.");
    } else {
      status = "planned";
      itemWarnings.push(`Approved scene ${scene.id} was planned but no meaningful captured action mapped to it.`);
    }

    warnings.push(...itemWarnings);
    return ApprovedOutlineLineageItemSchema.parse({
      sceneId: scene.id,
      goal: scene.goal,
      status,
      storyboardBeatIds: beatIds,
      captureStepIndexes,
      warnings: itemWarnings,
    });
  });

  return ApprovedOutlineLineageSchema.parse({
    version: 1,
    approvedOutlinePresent: true,
    items,
    warnings: [...new Set(warnings)],
  });
}
