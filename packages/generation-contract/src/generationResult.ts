import { z } from "zod";
import { DemoProjectSchema } from "@tinker/project-schema";

const TestreelRendererResultSchema = z
  .object({
    recordingPlanPath: z.string().min(1),
    recordingPath: z.string().min(1),
    outputDirectory: z.string().min(1),
    finalVideoPath: z.string().min(1),
    manifestPath: z.string().min(1).optional(),
    screenshotPaths: z.array(z.string().min(1)).default([]),
  })
  .strict();

const RendererResultsSchema = z
  .object({
    testreel: TestreelRendererResultSchema,
  })
  .strict();

export const ManualFixtureGenerationResultSchema = z
  .object({
    jobId: z.string().min(1),
    status: z.literal("completed"),
    publishedVideoPath: z.string().min(1),
    outputDirectory: z.string().min(1),
    artifactPaths: z.array(z.string().min(1)),
    renderer: z.literal("testreel"),
    rendererResults: RendererResultsSchema,
  })
  .strict()
  .superRefine((result, ctx) => {
    if (result.publishedVideoPath !== result.rendererResults.testreel.finalVideoPath) {
      ctx.addIssue({
        code: "custom",
        path: ["publishedVideoPath"],
        message: "publishedVideoPath must match the Testreel final video path",
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
