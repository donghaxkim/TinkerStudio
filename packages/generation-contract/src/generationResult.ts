import { z } from "zod";
import { DemoProjectSchema } from "@tinker/project-schema";

export const GenerationArtifactsSchema = z.object({
  storyboardAssetId: z.string().min(1).optional(),
  captureTraceAssetId: z.string().min(1).optional(),
  previewVideoAssetId: z.string().min(1).optional(),
});

export const GenerationResultSchema = z.object({
  project: DemoProjectSchema,
  artifacts: GenerationArtifactsSchema.optional(),
  warnings: z.array(z.string().min(1)).default([]),
});

export type GenerationArtifacts = z.infer<typeof GenerationArtifactsSchema>;
export type GenerationResult = z.infer<typeof GenerationResultSchema>;

export function parseGenerationResult(input: unknown) {
  return GenerationResultSchema.parse(input);
}

export function safeParseGenerationResult(input: unknown) {
  return GenerationResultSchema.safeParse(input);
}
