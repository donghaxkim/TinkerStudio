import { z } from "zod";
import { DemoProjectSchema } from "@tinker/project-schema";

const PlaywrightRendererResultSchema = z
  .object({
    projectPath: z.string().min(1),
    captureResultPath: z.string().min(1),
  })
  .strict();

const RendererResultsSchema = z
  .object({
    playwright: PlaywrightRendererResultSchema,
  })
  .strict();

export const ManualFixtureGenerationResultSchema = z
  .object({
    jobId: z.string().min(1),
    status: z.literal("completed"),
    projectPath: z.string().min(1),
    captureResultPath: z.string().min(1),
    outputDirectory: z.string().min(1),
    artifactPaths: z.array(z.string().min(1)),
    renderer: z.literal("playwright"),
    rendererResults: RendererResultsSchema,
  })
  .strict()
  .superRefine((result, ctx) => {
    if (result.projectPath !== result.rendererResults.playwright.projectPath) {
      ctx.addIssue({
        code: "custom",
        path: ["projectPath"],
        message: "projectPath must match the Playwright renderer result",
      });
    }

    if (result.captureResultPath !== result.rendererResults.playwright.captureResultPath) {
      ctx.addIssue({
        code: "custom",
        path: ["captureResultPath"],
        message: "captureResultPath must match the Playwright renderer result",
      });
    }
  });

export const GenerationArtifactsSchema = z
  .object({
    storyboardAssetId: z.string().min(1).optional(),
    captureTraceAssetId: z.string().min(1).optional(),
    previewVideoAssetId: z.string().min(1).optional(),
  })
  .strict();

export const AssistedGenerationResultSchema = z
  .object({
    project: DemoProjectSchema,
    artifacts: GenerationArtifactsSchema.optional(),
    warnings: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const GenerationResultSchema = z.union([
  ManualFixtureGenerationResultSchema,
  AssistedGenerationResultSchema,
]);

export type GenerationArtifacts = z.infer<typeof GenerationArtifactsSchema>;
export type ManualFixtureGenerationResult = z.infer<typeof ManualFixtureGenerationResultSchema>;
export type AssistedGenerationResult = z.infer<typeof AssistedGenerationResultSchema>;
export type GenerationResult = z.infer<typeof GenerationResultSchema>;

export function parseGenerationResult(input: unknown) {
  return GenerationResultSchema.parse(input);
}

export function safeParseGenerationResult(input: unknown) {
  return GenerationResultSchema.safeParse(input);
}
