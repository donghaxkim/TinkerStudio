import { buildFinalRenderPlan, type FinalRenderPlan } from "@tinker/rendering";
import type { DemoProject } from "@tinker/project-schema";

export type PrepareMp4ExportResult =
  | { ok: true; plan: FinalRenderPlan }
  | { ok: false; error: string };

export function prepareMp4Export(project: DemoProject): PrepareMp4ExportResult {
  try {
    return { ok: true, plan: buildFinalRenderPlan(project) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to prepare MP4 export",
    };
  }
}
