import { z } from "zod";
import { AspectRatioSchema } from "@tinker/project-schema";

export const NarrationRequestSchema = z.object({
  enabled: z.boolean().default(false),
  style: z.string().trim().min(1).optional(),
  voiceId: z.string().trim().min(1).optional(),
});

const PublicUrlSchema = z.string().url().refine((value) => {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}, "URL must use http or https");

const BaseCreateDemoRequestSchema = z.object({
  id: z.string().min(1).optional(),
  repoUrl: PublicUrlSchema.optional(),
  prompt: z.string().min(1).optional(),
  durationCapSeconds: z.number().positive(),
  aspectRatio: AspectRatioSchema,
  outputDirectory: z
    .string()
    .min(1)
    .refine((value) => !value.includes("\0"), "outputDirectory cannot contain null bytes")
    .optional(),
});

export const ManualFixtureCreateDemoRequestSchema = BaseCreateDemoRequestSchema.extend({
  mode: z.literal("manual-fixture"),
  productUrl: PublicUrlSchema.optional(),
});

export const AiUrlPlanningCreateDemoRequestSchema = BaseCreateDemoRequestSchema.extend({
  mode: z.literal("ai-url-planning"),
  productUrl: PublicUrlSchema,
});

export const AssistedCreateDemoRequestSchema = z.object({
  repoUrl: PublicUrlSchema,
  productUrl: PublicUrlSchema,
  prompt: z.string().trim().min(1, "prompt is required"),
  durationCapSeconds: z.number().int().positive().max(600),
  aspectRatio: AspectRatioSchema,
  narration: NarrationRequestSchema.optional(),
}).strict();

export const CreateDemoRequestSchema = z.union([
  ManualFixtureCreateDemoRequestSchema,
  AiUrlPlanningCreateDemoRequestSchema,
  AssistedCreateDemoRequestSchema,
]);

export type NarrationRequest = z.infer<typeof NarrationRequestSchema>;
export type ManualFixtureCreateDemoRequest = z.infer<typeof ManualFixtureCreateDemoRequestSchema>;
export type AiUrlPlanningCreateDemoRequest = z.infer<typeof AiUrlPlanningCreateDemoRequestSchema>;
export type AssistedCreateDemoRequest = z.infer<typeof AssistedCreateDemoRequestSchema>;
export type CreateDemoRequest = z.infer<typeof CreateDemoRequestSchema>;

export function parseCreateDemoRequest(input: unknown) {
  return CreateDemoRequestSchema.parse(input);
}

export function safeParseCreateDemoRequest(input: unknown) {
  return CreateDemoRequestSchema.safeParse(input);
}
