import { readFile } from "node:fs/promises";
import {
  safeParseDemoOutline,
  type DemoOutline,
  type PlanningAgent,
  type PlanningProgressStatus,
  type PlanningStage,
} from "@tinker/generation-contract";

/** Streams a pipeline stage transition to the caller (e.g. to persist for polling). */
export type PlanningProgressReporter = (stage: PlanningStage, status: PlanningProgressStatus) => void;
/** Streams high-level planning activity snapshots to the caller for polling UIs. */
export type PlanningThoughtsReporter = (thoughts: string[]) => void;

export type InitialPlanningAgentTurnInput = {
  kind: "initial";
  productUrl: string;
  repoUrl: string;
  agent: PlanningAgent;
  workspaceRoot: string;
  outlinePath: string;
  onProgress?: PlanningProgressReporter;
  onThoughts?: PlanningThoughtsReporter;
};

export type FollowupPlanningAgentTurnInput = {
  kind: "followup";
  productUrl: string;
  repoUrl: string;
  agent: PlanningAgent;
  workspaceRoot: string;
  outlinePath: string;
  message: string;
  agentResumeHandle: string;
  onProgress?: PlanningProgressReporter;
  onThoughts?: PlanningThoughtsReporter;
};

export type PlanningAgentTurnInput = InitialPlanningAgentTurnInput | FollowupPlanningAgentTurnInput;

export type PlanningAgentTurnResult = {
  assistantMessage: string;
  agentResumeHandle: string;
  repoCheckoutDirectory?: string;
  websiteAnalysisPath?: string;
  repoAnalysisPath?: string;
  thoughts?: string[];
};

export type PlanningAgentRunner = (input: PlanningAgentTurnInput) => Promise<PlanningAgentTurnResult>;

export type ValidatedOutlineResult = { outline: DemoOutline; outlineValid: true } | { outlineValid: false };

export async function readValidatedOutline(outlinePath: string): Promise<ValidatedOutlineResult> {
  try {
    const outlineJson = await readFile(outlinePath, "utf8");
    const parsedJson = JSON.parse(outlineJson) as unknown;
    const parsedOutline = safeParseDemoOutline(parsedJson);
    if (!parsedOutline.success) return { outlineValid: false };
    return { outline: parsedOutline.data, outlineValid: true };
  } catch {
    return { outlineValid: false };
  }
}
