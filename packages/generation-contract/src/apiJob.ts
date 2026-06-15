import { z } from "zod";
import { AiUrlPlanningCreateDemoRequestSchema, AiUrlRendererSchema } from "./createDemoRequest.js";
import { GenerationErrorSchema } from "./errors.js";
import { ManualFixtureProgressEventSchema } from "./progress.js";

const ApiCreateDemoRequestSchema = AiUrlPlanningCreateDemoRequestSchema.omit({
  outputDirectory: true,
  renderer: true,
})
  .extend({
    id: z.string().min(1),
    renderer: AiUrlRendererSchema,
  })
  .strict();

export const ApiArtifactKindSchema = z.enum([
  "output-video",
  "composition-index",
  "asset-manifest",
  "generation-manifest",
  "lint-log",
  "render-log",
  "product-analysis",
  "product-analysis-screenshot",
  "repo-analysis",
  "playwright-demo-project",
  "playwright-storyboard",
  "playwright-capture-plan",
  "playwright-capture-result",
  "playwright-video",
  "playwright-screenshot",
  "playwright-trace",
  "asset",
  "other",
]);

export const ApiArtifactSchema = z
  .object({
    kind: ApiArtifactKindSchema,
    relativePath: z.string().min(1),
    url: z.string().min(1),
    mediaType: z.string().min(1).optional(),
  })
  .strict();

export const ApiGenerationResultSchema = z
  .object({
    artifacts: z.array(ApiArtifactSchema),
  })
  .strict();

export const ApiGenerationJobStatusSchema = z.enum([
  "queued",
  "running",
  "capturing",
  "assembling",
  "completed",
  "failed",
]);

export const ApiRevisionSchema = z
  .object({
    id: z.string().min(1),
    status: ApiGenerationJobStatusSchema,
    createdAt: z.string().datetime(),
    result: ApiGenerationResultSchema.optional(),
    error: GenerationErrorSchema.optional(),
  })
  .strict()
  .superRefine((rev, ctx) => {
    if (rev.status === "completed" && rev.result === undefined) {
      ctx.addIssue({ code: "custom", path: ["result"], message: "completed revisions require a result" });
    }
    if (rev.status === "failed" && rev.error === undefined) {
      ctx.addIssue({ code: "custom", path: ["error"], message: "failed revisions require an error" });
    }
  });

export type ApiRevision = z.infer<typeof ApiRevisionSchema>;

export const ApiGenerationJobSchema = z
  .object({
    id: z.string().min(1),
    status: ApiGenerationJobStatusSchema,
    request: ApiCreateDemoRequestSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    progressEvents: z.array(ManualFixtureProgressEventSchema),
    result: ApiGenerationResultSchema.optional(),
    error: GenerationErrorSchema.optional(),
    revisions: z.array(ApiRevisionSchema).optional(),
    currentRevisionId: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((job, ctx) => {
    if (job.status === "completed") {
      if (job.result === undefined) {
        ctx.addIssue({ code: "custom", path: ["result"], message: "completed jobs require a result" });
      }
    } else if (job.result !== undefined) {
      ctx.addIssue({ code: "custom", path: ["result"], message: "result is only allowed for completed jobs" });
    }

    if (job.status === "failed") {
      if (job.error === undefined) {
        ctx.addIssue({ code: "custom", path: ["error"], message: "failed jobs require an error" });
      }
    } else if (job.error !== undefined) {
      ctx.addIssue({ code: "custom", path: ["error"], message: "error is only allowed for failed jobs" });
    }
  });

export type ApiArtifactKind = z.infer<typeof ApiArtifactKindSchema>;
export type ApiArtifact = z.infer<typeof ApiArtifactSchema>;
export type ApiGenerationResult = z.infer<typeof ApiGenerationResultSchema>;
export type ApiGenerationJobStatus = z.infer<typeof ApiGenerationJobStatusSchema>;
export type ApiGenerationJob = z.infer<typeof ApiGenerationJobSchema>;

export function parseApiGenerationJob(input: unknown) {
  return ApiGenerationJobSchema.parse(input);
}

export function safeParseApiGenerationJob(input: unknown) {
  return ApiGenerationJobSchema.safeParse(input);
}

export function parseApiArtifact(input: unknown) {
  return ApiArtifactSchema.parse(input);
}

export function safeParseApiArtifact(input: unknown) {
  return ApiArtifactSchema.safeParse(input);
}
