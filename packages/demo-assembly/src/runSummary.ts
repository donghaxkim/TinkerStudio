// Run input + run summary artifacts (first pass)
//
// `input.json`       : the resolved request that produced this run (provenance).
// `run-summary.json` : a single top-level "what happened" record — status, the list of
//                      generated artifacts, per-beat storyboard coverage, warnings, and
//                      the recommended next action. This is the file a human (or a future
//                      chat UX) reads first to decide whether the demo is good.

import { relative } from "node:path";
import { z } from "zod";
import type { AiUrlRenderer } from "./aiUrlRenderer.js";
import type { Storyboard } from "./demoStrategy.js";
import type { AspectRatio } from "./types.js";
import { CoreCoverageItemSchema, type CoreCoverageItem } from "./coreCoverage.js";

const RendererSchema = z.enum(["hyperframes", "playwright", "both"]);

const ExecutionModeSchema = z.enum(["claude-code", "deterministic-fallback", "deterministic"]);
const PlannerModeSchema = z.enum(["claude-code", "opencode"]);
const FinalVideoModeSchema = z.enum(["rendered", "transcoded", "none"]);
const FinalVideoSourceSchema = z.enum(["demo-project", "raw-playwright-recording", "none"]);
const AppliedSchema = z.enum(["none", "partial", "full"]);

export const RunExecutionSchema = z
  .object({
    understandingMode: ExecutionModeSchema,
    strategyMode: ExecutionModeSchema,
    playwrightPlannerMode: PlannerModeSchema,
    finalVideoMode: FinalVideoModeSchema,
    finalVideoSource: FinalVideoSourceSchema,
    directorPlanApplied: AppliedSchema,
    renderPlanApplied: AppliedSchema,
    editDecisionListApplied: z.boolean(),
    finalVideoReflectsEditDecisionList: z.boolean(),
    cameraSource: z.string(),
    notes: z.array(z.string()),
  })
  .strict();

export type RunExecution = z.infer<typeof RunExecutionSchema>;

export const RunInputSchema = z
  .object({
    version: z.literal(1),
    projectId: z.string().trim().min(1),
    createdAt: z.string().trim().min(1),
    productUrl: z.string().trim().min(1),
    repoUrl: z.string().trim().min(1).optional(),
    prompt: z.string(),
    durationCapSeconds: z.number().finite().positive(),
    aspectRatio: z.enum(["16:9", "9:16", "1:1"]),
    renderer: RendererSchema,
  })
  .strict();

export const StoryboardCoverageSchema = z
  .object({
    beatId: z.string().trim().min(1),
    status: z.enum(["captured", "planned", "skipped"]),
    evidence: z.array(z.string()),
  })
  .strict();

export const RunSummarySchema = z
  .object({
    version: z.literal(1),
    status: z.enum(["success", "partial", "failed"]),
    renderer: RendererSchema,
    execution: RunExecutionSchema,
    coreCoverage: z.array(CoreCoverageItemSchema),
    generatedArtifacts: z.array(z.string()),
    storyboardCoverage: z.array(StoryboardCoverageSchema),
    warnings: z.array(z.string()),
    nextRecommendedAction: z.string(),
  })
  .strict();

export type RunInput = z.infer<typeof RunInputSchema>;
export type StoryboardCoverage = z.infer<typeof StoryboardCoverageSchema>;
export type RunSummary = z.infer<typeof RunSummarySchema>;

export type BuildRunInputArgs = {
  projectId: string;
  createdAt: string;
  productUrl: string;
  repoUrl?: string;
  prompt: string;
  durationCapSeconds: number;
  aspectRatio: AspectRatio;
  renderer: AiUrlRenderer;
};

export function buildRunInput(args: BuildRunInputArgs): RunInput {
  return RunInputSchema.parse({
    version: 1,
    projectId: args.projectId,
    createdAt: args.createdAt,
    productUrl: args.productUrl,
    ...(args.repoUrl ? { repoUrl: args.repoUrl } : {}),
    prompt: args.prompt,
    durationCapSeconds: args.durationCapSeconds,
    aspectRatio: args.aspectRatio,
    renderer: args.renderer,
  });
}

export type BuildRunSummaryArgs = {
  renderer: AiUrlRenderer;
  outputRoot: string;
  storyboard: Storyboard;
  artifactPaths: string[];
  captureSucceeded: boolean;
  finalVideoProduced: boolean;
  warnings: string[];
  execution: RunExecution;
  coreCoverage: CoreCoverageItem[];
};

/** Make artifact paths run-relative (readable) while leaving outside paths absolute. */
function toRunRelative(outputRoot: string, path: string): string {
  const rel = relative(outputRoot, path);
  return rel === "" || rel.startsWith("..") ? path : rel;
}

function nextRecommendedAction(renderer: AiUrlRenderer, finalVideoProduced: boolean, captureSucceeded: boolean): string {
  if (!captureSucceeded) {
    return "re-run generation; capture did not complete";
  }
  if (renderer === "playwright") {
    return finalVideoProduced
      ? "review final.mp4"
      : "install ffmpeg and re-run to produce final.mp4, then review the smooth recording";
  }
  if (renderer === "hyperframes") {
    return "review the rendered Hyperframes demo video";
  }
  return finalVideoProduced ? "review final.mp4" : "open demo-project.json in the editor";
}

export function buildRunSummary(args: BuildRunSummaryArgs): RunSummary {
  const generatedArtifacts = args.artifactPaths.map((path) => toRunRelative(args.outputRoot, path));

  // First pass: we do not yet have a per-beat capture mapping, so every beat shares the
  // same capture evidence (the recording / trace). This is honest about its granularity.
  const beatEvidence = args.captureSucceeded
    ? [
        ...(args.finalVideoProduced ? ["playwright/final.mp4"] : []),
        "playwright/action-trace.json",
        "playwright/capture-result.json",
      ].filter((candidate) => generatedArtifacts.some((artifact) => artifact.endsWith(candidate)))
    : [];

  const storyboardCoverage: StoryboardCoverage[] = args.storyboard.beats.map((beat) => ({
    beatId: beat.id,
    status: args.captureSucceeded ? "captured" : "planned",
    evidence: beatEvidence,
  }));

  const allCaptured = args.coreCoverage.every((item) => item.status === "captured");
  const status: RunSummary["status"] = !args.captureSucceeded
    ? "failed"
    : args.execution.finalVideoMode === "rendered" && allCaptured
      ? "success"
      : "partial";

  return RunSummarySchema.parse({
    version: 1,
    status,
    renderer: args.renderer,
    execution: args.execution,
    coreCoverage: args.coreCoverage,
    generatedArtifacts,
    storyboardCoverage,
    warnings: args.warnings,
    nextRecommendedAction: nextRecommendedAction(args.renderer, args.finalVideoProduced, args.captureSucceeded),
  });
}
