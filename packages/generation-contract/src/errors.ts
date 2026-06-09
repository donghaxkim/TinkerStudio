import { z } from "zod";

export const GenerationErrorCodeSchema = z.enum([
  "invalid_request",
  "analysis_failed",
  "storyboard_failed",
  "capture_failed",
  "project_validation_failed",
  "internal_error",
]);

export const GenerationErrorSchema = z.object({
  code: GenerationErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean().default(false),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type GenerationErrorCode = z.infer<typeof GenerationErrorCodeSchema>;
export type GenerationError = z.infer<typeof GenerationErrorSchema>;
