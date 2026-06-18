import { z } from "zod";
import { AspectRatioSchema } from "@tinker/project-schema";

export const PublicUrlSchema = z.string().url().refine((value) => {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}, "URL must use http or https");

const GithubOwnerSegmentPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const GithubRepoSegmentPattern = /^(?=.*[A-Za-z0-9])[A-Za-z0-9._-]+$/;

export const PublicGithubRepoUrlSchema = z.string().url().refine((value) => {
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

/**
 * Default high-level directive for the demo-generation agents (Understanding + Strategy).
 * Editable by the user via a hidden "Edit system prompt" affordance; when they don't touch
 * it, this is what drives the agents. Single source of truth shared by the web UI (prefill)
 * and the pipeline (default when the request omits a systemPrompt).
 */
export const DEFAULT_SYSTEM_PROMPT =
  "Create a clear, evidence-grounded product demo from the website and repo. Show the problem, audience, solution, strongest use case, end result, and next step. Prioritize core concepts and minimal dead time; do not invent unsupported claims.";
export const HyperframesAgentSchema = z.enum(["opencode", "claude"]);
export type HyperframesAgent = z.infer<typeof HyperframesAgentSchema>;

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

export const AiUrlPlanningCreateDemoRequestSchema = BaseCreateDemoRequestSchema.extend({
  mode: z.literal("ai-url-planning"),
  repoUrl: PublicGithubRepoUrlSchema,
  productUrl: PublicUrlSchema,
  renderer: AiUrlRendererSchema.default("hyperframes"),
  hyperframesAgent: HyperframesAgentSchema.default("opencode"),
  /** Optional user-edited directive for the Understanding + Strategy agents. */
  systemPrompt: z.string().trim().min(1).optional(),
});

export const AssistedCreateDemoRequestSchema = z.object({
  repoUrl: PublicUrlSchema,
  productUrl: PublicUrlSchema,
  prompt: z.string().trim().min(1, "prompt is required"),
  durationCapSeconds: z.number().int().positive().max(600),
  aspectRatio: AspectRatioSchema,
}).strict();

export const CreateDemoRequestSchema = z.union([
  AiUrlPlanningCreateDemoRequestSchema,
  AssistedCreateDemoRequestSchema,
]);

export type AiUrlPlanningCreateDemoRequest = z.infer<typeof AiUrlPlanningCreateDemoRequestSchema>;
export type AssistedCreateDemoRequest = z.infer<typeof AssistedCreateDemoRequestSchema>;
export type CreateDemoRequest = z.infer<typeof CreateDemoRequestSchema>;

export function parseCreateDemoRequest(input: unknown) {
  return CreateDemoRequestSchema.parse(input);
}

export function safeParseCreateDemoRequest(input: unknown) {
  return CreateDemoRequestSchema.safeParse(input);
}
