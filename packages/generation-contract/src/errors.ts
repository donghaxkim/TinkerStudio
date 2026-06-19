import { z } from "zod";

export const GenerationErrorCodeSchema = z.enum([
  "invalid_request",
  "analysis_failed",
  "storyboard_failed",
  "capture_failed",
  "project_validation_failed",
  "internal_error",
]);

export const StructuredGenerationErrorSchema = z.object({
  code: GenerationErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean().default(false),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const GenerationFailureStageSchema = z.enum([
  "validation",
  "analysis",
  "planning",
  "verification",
  "capture",
  "assembly",
  "cancelled",
  "unknown",
]);

export const ManualFixtureGenerationErrorSchema = z.object({
  jobId: z.string().min(1).optional(),
  status: z.literal("failed"),
  stage: GenerationFailureStageSchema,
  message: z.string().min(1),
});

export const GenerationErrorSchema = z.union([
  ManualFixtureGenerationErrorSchema,
  StructuredGenerationErrorSchema,
]);

export type GenerationErrorCode = z.infer<typeof GenerationErrorCodeSchema>;
export type GenerationFailureStage = z.infer<typeof GenerationFailureStageSchema>;
export type GenerationError = z.infer<typeof GenerationErrorSchema>;
