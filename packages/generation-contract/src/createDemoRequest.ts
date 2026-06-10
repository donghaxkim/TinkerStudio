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

const GithubOwnerSegmentPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const GithubRepoSegmentPattern = /^(?=.*[A-Za-z0-9])[A-Za-z0-9._-]+$/;

const PublicGithubRepoUrlSchema = z.string().url().refine((value) => {
  try {
    const url = new URL(value);
    const pathMatch = /^\/([^/]+)\/([^/]+)$/.exec(url.pathname);

    if (pathMatch === null) {
      return false;
    }

    const ownerName = decodeURIComponent(pathMatch[1]);
    const repoPathSegment = decodeURIComponent(pathMatch[2]);
    const repoName = repoPathSegment.endsWith(".git") ? repoPathSegment.slice(0, -4) : repoPathSegment;

    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === "" &&
      GithubOwnerSegmentPattern.test(ownerName) &&
      GithubRepoSegmentPattern.test(repoName) &&
      repoName !== "." &&
      repoName !== ".."
    );
  } catch {
    return false;
  }
}, "repoUrl must be a public GitHub repository root URL");

export const AiUrlRendererSchema = z.enum(["hyperframes", "playwright", "both"]);
export type AiUrlRenderer = z.infer<typeof AiUrlRendererSchema>;

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
  repoUrl: PublicGithubRepoUrlSchema,
  productUrl: PublicUrlSchema,
  renderer: AiUrlRendererSchema.default("hyperframes"),
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
