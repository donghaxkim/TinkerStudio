import { z } from "zod";

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
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]),
  outputDirectory: z
    .string()
    .min(1)
    .refine((value) => !value.includes("\0"), "outputDirectory cannot contain null bytes")
    .optional(),
});

const ManualFixtureRequestSchema = BaseCreateDemoRequestSchema.extend({
  mode: z.literal("manual-fixture"),
  productUrl: PublicUrlSchema.optional(),
});

const AiUrlPlanningRequestSchema = BaseCreateDemoRequestSchema.extend({
  mode: z.literal("ai-url-planning"),
  productUrl: PublicUrlSchema,
});

export const CreateDemoRequestSchema = z.discriminatedUnion("mode", [
  ManualFixtureRequestSchema,
  AiUrlPlanningRequestSchema,
]);

export type CreateDemoRequest = z.infer<typeof CreateDemoRequestSchema>;
