import { z } from "zod";

export const GenerationPhaseSchema = z.enum([
  "queued",
  "analyzing_product",
  "creating_storyboard",
  "planning_capture",
  "capturing",
  "compiling_project",
  "validating_project",
  "complete",
]);

export const GenerationProgressEventSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  phase: GenerationPhaseSchema,
  message: z.string().min(1),
  progress: z.number().min(0).max(1).optional(),
  createdAt: z.string().datetime(),
});

export type GenerationPhase = z.infer<typeof GenerationPhaseSchema>;
export type GenerationProgressEvent = z.infer<typeof GenerationProgressEventSchema>;

export const GENERATION_PHASE_LABELS: Record<GenerationPhase, string> = {
  queued: "Queued",
  analyzing_product: "Analyzing product",
  creating_storyboard: "Creating storyboard",
  planning_capture: "Planning capture",
  capturing: "Capturing",
  compiling_project: "Compiling project",
  validating_project: "Validating project",
  complete: "Complete",
};
