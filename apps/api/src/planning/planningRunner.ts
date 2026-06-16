import { readFile } from "node:fs/promises";
import { safeParseDemoOutline, type DemoOutline, type PlanningAgent } from "@tinker/generation-contract";

export type InitialPlanningAgentTurnInput = {
  kind: "initial";
  productUrl: string;
  repoUrl: string;
  agent: PlanningAgent;
  workspaceRoot: string;
  outlinePath: string;
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
};

export type PlanningAgentTurnInput = InitialPlanningAgentTurnInput | FollowupPlanningAgentTurnInput;

export type PlanningAgentTurnResult = {
  assistantMessage: string;
  agentResumeHandle: string;
  repoCheckoutDirectory?: string;
  websiteAnalysisPath?: string;
  repoAnalysisPath?: string;
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

export function unsupportedPlanningAgentRunner(): PlanningAgentRunner {
  return async (input) => {
    if (input.agent === "opencode") {
      throw new Error("OpenCode planning sessions require a resumable session adapter before they can be used.");
    }
    throw new Error("No planning agent runner configured.");
  };
}
