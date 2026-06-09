import { z } from "zod";
import { AspectRatioSchema } from "@tinker/project-schema";

export const NarrationRequestSchema = z.object({
  enabled: z.boolean().default(false),
  style: z.string().trim().min(1).optional(),
  voiceId: z.string().trim().min(1).optional(),
});

export const CreateDemoRequestSchema = z.object({
  repoUrl: z.string().trim().url(),
  productUrl: z.string().trim().url(),
  prompt: z.string().trim().min(1, "prompt is required"),
  durationCapSeconds: z.number().int().positive().max(600),
  aspectRatio: AspectRatioSchema,
  narration: NarrationRequestSchema.optional(),
});

export type NarrationRequest = z.infer<typeof NarrationRequestSchema>;
export type CreateDemoRequest = z.infer<typeof CreateDemoRequestSchema>;

export function parseCreateDemoRequest(input: unknown) {
  return CreateDemoRequestSchema.parse(input);
}

export function safeParseCreateDemoRequest(input: unknown) {
  return CreateDemoRequestSchema.safeParse(input);
}
