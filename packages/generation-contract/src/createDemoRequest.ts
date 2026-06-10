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

const PublicGithubRepoUrlSchema = z.string().url().refine((value) => {
  try {
    const url = new URL(value);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const repoName = pathParts[1]?.endsWith(".git") ? pathParts[1].slice(0, -4) : pathParts[1];

    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === "" &&
      pathParts.length === 2 &&
      pathParts[0] !== undefined &&
      pathParts[0].trim().length > 0 &&
      repoName !== undefined &&
      repoName.trim().length > 0
    );
  } catch {
    return false;
  }
}, "repoUrl must be a public GitHub repository root URL");

const BaseCreateDemoRequestSchema = z.object({
  id: z.string().min(1).optional(),
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
  repoUrl: PublicUrlSchema.optional(),
  productUrl: PublicUrlSchema.optional(),
});

export const AiUrlPlanningCreateDemoRequestSchema = BaseCreateDemoRequestSchema.extend({
  mode: z.literal("ai-url-planning"),
  repoUrl: PublicGithubRepoUrlSchema.optional(),
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
