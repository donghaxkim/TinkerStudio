import { z } from "zod";
import { CreateDemoRequestSchema } from "./createDemoRequest.js";
import { GenerationErrorSchema } from "./errors.js";
import { GenerationResultSchema } from "./generationResult.js";
import { GenerationProgressEventSchema } from "./progress.js";

export const GenerationStatusSchema = z.enum(["queued", "running", "succeeded", "failed", "canceled"]);

export const GenerationJobSchema = z
  .object({
    id: z.string().min(1),
    status: GenerationStatusSchema,
    request: CreateDemoRequestSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    progressEvents: z.array(GenerationProgressEventSchema).default([]),
    result: GenerationResultSchema.optional(),
    error: GenerationErrorSchema.optional(),
  })
  .superRefine((job, ctx) => {
    if (job.status === "succeeded" && !job.result) {
      ctx.addIssue({ code: "custom", path: ["result"], message: "succeeded jobs require a result" });
    }

    if (job.status === "failed" && !job.error) {
      ctx.addIssue({ code: "custom", path: ["error"], message: "failed jobs require an error" });
    }
  });

export type GenerationStatus = z.infer<typeof GenerationStatusSchema>;
export type GenerationJob = z.infer<typeof GenerationJobSchema>;

export function parseGenerationJob(input: unknown) {
  return GenerationJobSchema.parse(input);
}

export function safeParseGenerationJob(input: unknown) {
  return GenerationJobSchema.safeParse(input);
}
