import { z } from "zod";

export const GenerationResultSchema = z.object({
  jobId: z.string().min(1),
  status: z.literal("completed"),
  projectPath: z.string().min(1),
  outputDirectory: z.string().min(1),
  artifactPaths: z.array(z.string().min(1)),
});

export const GenerationFailureStageSchema = z.enum([
  "validation",
  "analysis",
  "planning",
  "verification",
  "capture",
  "assembly",
  "unknown",
]);

export const GenerationErrorSchema = z.object({
  jobId: z.string().min(1).optional(),
  status: z.literal("failed"),
  stage: GenerationFailureStageSchema,
  message: z.string().min(1),
});

export type GenerationResult = z.infer<typeof GenerationResultSchema>;
export type GenerationFailureStage = z.infer<typeof GenerationFailureStageSchema>;
export type GenerationError = z.infer<typeof GenerationErrorSchema>;
