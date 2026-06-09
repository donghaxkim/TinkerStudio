import { z } from "zod";

const OptionalUrlSchema = z.string().url();

export const CreateDemoRequestSchema = z.object({
  id: z.string().min(1).optional(),
  productUrl: OptionalUrlSchema.optional(),
  repoUrl: OptionalUrlSchema.optional(),
  prompt: z.string().min(1).optional(),
  durationCapSeconds: z.number().positive(),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]),
  outputDirectory: z
    .string()
    .min(1)
    .refine((value) => !value.includes("\0"), "outputDirectory cannot contain null bytes")
    .optional(),
  mode: z.literal("manual-fixture"),
});

export type CreateDemoRequest = z.infer<typeof CreateDemoRequestSchema>;
