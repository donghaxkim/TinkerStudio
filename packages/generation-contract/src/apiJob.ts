import { z } from "zod";
import { DemoProjectSchema } from "@tinker/project-schema";
import { AiUrlPlanningCreateDemoRequestSchema } from "./createDemoRequest.js";
import { GenerationErrorSchema } from "./errors.js";
import { ManualFixtureProgressEventSchema } from "./progress.js";

export const ApiGenerationMethodSchema = z.enum(["playwright", "hyperframes"]);

const ApiCreateDemoRequestSchema = AiUrlPlanningCreateDemoRequestSchema.omit({
  outputDirectory: true,
  renderer: true,
})
  .extend({
    id: z.string().min(1),
    renderer: ApiGenerationMethodSchema,
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

function artifactOfKind(kind: z.infer<typeof ApiArtifactKindSchema>) {
  return ApiArtifactSchema.superRefine((artifact, ctx) => {
    if (artifact.kind !== kind) {
      ctx.addIssue({
        code: "custom",
        path: ["kind"],
        message: `artifact kind must be ${kind}`,
      });
    }
  });
}

const PlaywrightGenerationResultSchema = z
  .object({
    method: z.literal("playwright"),
    project: DemoProjectSchema,
    artifacts: z.array(ApiArtifactSchema),
    warnings: z.array(z.string()),
  })
  .strict();

const HyperframesGenerationResultSchema = z
  .object({
    method: z.literal("hyperframes"),
    composition: z
      .object({
        indexArtifact: artifactOfKind("composition-index"),
        outputVideoArtifact: artifactOfKind("output-video"),
        generationManifestArtifact: artifactOfKind("generation-manifest").optional(),
        assetManifestArtifact: artifactOfKind("asset-manifest").optional(),
      })
      .strict(),
    artifacts: z.array(ApiArtifactSchema),
    warnings: z.array(z.string()),
  })
  .strict();

const HyperframesRevisionResultSchema = z
  .object({
    method: z.literal("hyperframes"),
    composition: z
      .object({
        indexArtifact: artifactOfKind("composition-index"),
        outputVideoArtifact: artifactOfKind("output-video").optional(),
        generationManifestArtifact: artifactOfKind("generation-manifest").optional(),
        assetManifestArtifact: artifactOfKind("asset-manifest").optional(),
      })
      .strict(),
    artifacts: z.array(ApiArtifactSchema),
    warnings: z.array(z.string()),
  })
  .strict();

export const ApiGenerationResultSchema = z.discriminatedUnion("method", [
  PlaywrightGenerationResultSchema,
  HyperframesGenerationResultSchema,
]);

export const ApiRevisionResultSchema = HyperframesRevisionResultSchema;

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
    result: ApiRevisionResultSchema.optional(),
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
      } else if (job.result.method !== job.request.renderer) {
        ctx.addIssue({
          code: "custom",
          path: ["result", "method"],
          message: "result method must match request renderer",
        });
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
export type ApiGenerationMethod = z.infer<typeof ApiGenerationMethodSchema>;
export type ApiGenerationResult = z.infer<typeof ApiGenerationResultSchema>;
export type ApiRevisionResult = z.infer<typeof ApiRevisionResultSchema>;
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
