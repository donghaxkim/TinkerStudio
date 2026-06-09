import { z } from "zod";
import { CreateDemoRequestSchema } from "./createDemoRequest.js";

export const GenerationStatusSchema = z.enum([
  "queued",
  "running",
  "capturing",
  "assembling",
  "completed",
  "failed",
]);

export const GenerationJobSchema = z.object({
  id: z.string().min(1),
  request: CreateDemoRequestSchema,
  status: GenerationStatusSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const GenerationProgressEventSchema = z.object({
  jobId: z.string().min(1),
  status: GenerationStatusSchema,
  message: z.string().min(1),
  time: z.string().min(1),
  artifactPath: z.string().min(1).optional(),
});

export type GenerationStatus = z.infer<typeof GenerationStatusSchema>;
export type GenerationJob = z.infer<typeof GenerationJobSchema>;
export type GenerationProgressEvent = z.infer<typeof GenerationProgressEventSchema>;
