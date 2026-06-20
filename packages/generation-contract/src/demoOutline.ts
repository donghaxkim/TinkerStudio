import { z } from "zod";
import { PublicGithubRepoUrlSchema, PublicUrlSchema } from "./urlSchemas.js";

const nonEmptyString = z.string().trim().min(1);
const finiteNumber = z.number().finite();

export const DemoOutlineEvidenceSchema = z.enum(["repo", "website"]);

export const DemoOutlineSceneSchema = z
  .object({
    id: nonEmptyString,
    goal: nonEmptyString,
    visual: nonEmptyString,
    narration: nonEmptyString.optional(),
    startHint: finiteNumber.nonnegative().optional(),
    endHint: finiteNumber.nonnegative().optional(),
    evidence: z.array(DemoOutlineEvidenceSchema).min(1),
  })
  .strict();

export const DemoOutlineSchema = z
  .object({
    title: nonEmptyString,
    durationCapSeconds: finiteNumber.positive(),
    aspectRatio: z.enum(["16:9", "9:16", "1:1"]),
    summary: nonEmptyString,
    scenes: z.array(DemoOutlineSceneSchema).min(1),
    generationNotes: z.array(nonEmptyString).default([]),
  })
  .strict()
  .superRefine((outline, context) => {
    outline.scenes.forEach((scene, index) => {
      if (scene.startHint !== undefined && scene.endHint !== undefined && scene.endHint <= scene.startHint) {
        context.addIssue({
          code: "custom",
          path: ["scenes", index, "endHint"],
          message: "endHint must be greater than startHint",
        });
      }

      if (scene.startHint !== undefined && scene.startHint > outline.durationCapSeconds) {
        context.addIssue({
          code: "custom",
          path: ["scenes", index, "startHint"],
          message: "startHint must be less than or equal to durationCapSeconds",
        });
      }

      if (scene.endHint !== undefined && scene.endHint > outline.durationCapSeconds) {
        context.addIssue({
          code: "custom",
          path: ["scenes", index, "endHint"],
          message: "endHint must be less than or equal to durationCapSeconds",
        });
      }
    });
  });

export const PlanningAgentSchema = z.enum(["claude", "opencode"]);
export const PlanningSessionStatusSchema = z.enum(["starting", "ready", "running", "error"]);
export const PlanningMessageSchema = z.object({ role: z.enum(["user", "assistant"]), content: nonEmptyString }).strict();

// Stages the planning runner streams while it works, in the order they begin.
export const PlanningStageSchema = z.enum(["preparing", "analyzing-repo", "analyzing-website", "drafting"]);
export const PlanningProgressStatusSchema = z.enum(["active", "done"]);
export const PlanningProgressEntrySchema = z
  .object({ stage: PlanningStageSchema, status: PlanningProgressStatusSchema })
  .strict();

export const CreatePlanningSessionRequestSchema = z
  .object({
    // Optional client-generated id so the frontend can poll progress while the
    // create request is still in flight. Constrained to a UUID so it is always a
    // safe filesystem path segment; the server falls back to its own id when absent.
    id: z.string().uuid().optional(),
    productUrl: PublicUrlSchema,
    repoUrl: PublicGithubRepoUrlSchema,
    agent: PlanningAgentSchema.default("opencode"),
  })
  .strict();

export const ContinuePlanningSessionRequestSchema = z.object({ message: nonEmptyString }).strict();

export const PlanningSessionResponseSchema = z
  .object({
    id: nonEmptyString,
    productUrl: PublicUrlSchema.optional(),
    repoUrl: PublicGithubRepoUrlSchema,
    agent: PlanningAgentSchema,
    status: PlanningSessionStatusSchema,
    messages: z.array(PlanningMessageSchema),
    progress: z.array(PlanningProgressEntrySchema).default([]),
    // Streamed planning-agent reasoning shown live, then collapsed once an outline is ready.
    thoughts: z.array(nonEmptyString).optional(),
    outline: DemoOutlineSchema.optional(),
    outlineValid: z.boolean(),
    lastError: nonEmptyString.optional(),
  })
  .strict();

export type DemoOutline = z.infer<typeof DemoOutlineSchema>;
export type DemoOutlineEvidence = z.infer<typeof DemoOutlineEvidenceSchema>;
export type DemoOutlineScene = z.infer<typeof DemoOutlineSceneSchema>;
export type PlanningAgent = z.infer<typeof PlanningAgentSchema>;
export type PlanningMessage = z.infer<typeof PlanningMessageSchema>;
export type PlanningSessionStatus = z.infer<typeof PlanningSessionStatusSchema>;
export type PlanningStage = z.infer<typeof PlanningStageSchema>;
export type PlanningProgressStatus = z.infer<typeof PlanningProgressStatusSchema>;
export type PlanningProgressEntry = z.infer<typeof PlanningProgressEntrySchema>;
export type CreatePlanningSessionRequest = z.infer<typeof CreatePlanningSessionRequestSchema>;
export type ContinuePlanningSessionRequest = z.infer<typeof ContinuePlanningSessionRequestSchema>;
export type PlanningSessionResponse = z.infer<typeof PlanningSessionResponseSchema>;

export function parseDemoOutline(input: unknown) {
  return DemoOutlineSchema.parse(input);
}

export function safeParseDemoOutline(input: unknown) {
  return DemoOutlineSchema.safeParse(input);
}
