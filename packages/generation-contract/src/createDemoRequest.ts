import { z } from "zod";
import { AspectRatioSchema } from "@tinker/project-schema";
import { DemoOutlineSchema } from "./demoOutline.js";
import { PublicGithubRepoUrlSchema, PublicUrlSchema } from "./urlSchemas.js";
export { PublicGithubRepoUrlSchema, PublicUrlSchema } from "./urlSchemas.js";

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
  /** Optional approved planning outline used as strong structured guidance. */
  approvedOutline: DemoOutlineSchema.optional(),
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
