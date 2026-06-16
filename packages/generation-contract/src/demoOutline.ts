import { z } from "zod";

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

export const CreatePlanningSessionRequestSchema = z
  .object({
    productUrl: z.string().url().refine((value) => {
      try {
        const protocol = new URL(value).protocol;
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    }, "productUrl must use http or https"),
    repoUrl: z.string().url().refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" && url.hostname === "github.com" && /^\/[^/]+\/[^/]+$/.test(url.pathname);
      } catch {
        return false;
      }
    }, "repoUrl must be a public GitHub repository root URL"),
    agent: PlanningAgentSchema.default("claude"),
  })
  .strict();

export const ContinuePlanningSessionRequestSchema = z.object({ message: nonEmptyString }).strict();

export const PlanningSessionResponseSchema = z
  .object({
    id: nonEmptyString,
    productUrl: nonEmptyString,
    repoUrl: nonEmptyString,
    agent: PlanningAgentSchema,
    status: PlanningSessionStatusSchema,
    messages: z.array(PlanningMessageSchema),
    outline: DemoOutlineSchema.optional(),
    outlineValid: z.boolean(),
    lastError: nonEmptyString.optional(),
  })
  .strict();

export type DemoOutline = z.infer<typeof DemoOutlineSchema>;
export type PlanningAgent = z.infer<typeof PlanningAgentSchema>;
export type PlanningMessage = z.infer<typeof PlanningMessageSchema>;
export type PlanningSessionStatus = z.infer<typeof PlanningSessionStatusSchema>;
export type CreatePlanningSessionRequest = z.infer<typeof CreatePlanningSessionRequestSchema>;
export type ContinuePlanningSessionRequest = z.infer<typeof ContinuePlanningSessionRequestSchema>;
export type PlanningSessionResponse = z.infer<typeof PlanningSessionResponseSchema>;

export function parseDemoOutline(input: unknown) {
  return DemoOutlineSchema.parse(input);
}

export function safeParseDemoOutline(input: unknown) {
  return DemoOutlineSchema.safeParse(input);
}
