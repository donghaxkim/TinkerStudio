import type { DemoProject } from "@tinker/project-schema";
import { buildFinalRenderPlan, type RenderLayer } from "./renderFinal.js";

export type PreviewFrameComposition = {
  currentTime: number;
  activeLayers: RenderLayer[];
};

export function buildPreviewFrameComposition(project: DemoProject, currentTime: number): PreviewFrameComposition {
  const plan = buildFinalRenderPlan(project);
  const clampedTime = Math.max(0, Math.min(currentTime, plan.timeline.duration));

  return {
    currentTime: clampedTime,
    activeLayers: plan.layers.filter((layer) => layer.start <= clampedTime && layer.end >= clampedTime),
  };
}
