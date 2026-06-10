import { z } from "zod";
import { DemoProjectSchema } from "@tinker/project-schema";
import { AiUrlRendererSchema } from "./createDemoRequest.js";

const HyperframesRendererResultSchema = z
  .object({
    outputVideoPath: z.string().min(1),
    generationManifestPath: z.string().min(1),
    assetManifestPath: z.string().min(1),
  })
  .strict();

const PlaywrightRendererResultSchema = z
  .object({
    projectPath: z.string().min(1),
    captureResultPath: z.string().min(1),
  })
  .strict();

const RendererResultsSchema = z
  .object({
    hyperframes: HyperframesRendererResultSchema.optional(),
    playwright: PlaywrightRendererResultSchema.optional(),
  })
  .strict();

export const ManualFixtureGenerationResultSchema = z
  .object({
    jobId: z.string().min(1),
    status: z.literal("completed"),
    projectPath: z.string().min(1),
    captureResultPath: z.string().min(1).optional(),
    outputDirectory: z.string().min(1),
    artifactPaths: z.array(z.string().min(1)),
    renderer: AiUrlRendererSchema.optional(),
    rendererResults: RendererResultsSchema.optional(),
  })
  .superRefine((result, ctx) => {
    if (result.renderer === undefined) {
      return;
    }

    if (result.rendererResults === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["rendererResults"],
        message: "rendererResults are required when renderer is set",
      });
      return;
    }

    const requiresHyperframes = result.renderer === "hyperframes" || result.renderer === "both";
    const requiresPlaywright = result.renderer === "playwright" || result.renderer === "both";

    if (requiresHyperframes && result.rendererResults.hyperframes === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["rendererResults", "hyperframes"],
        message: "hyperframes result is required",
      });
    }

    if (requiresPlaywright && result.rendererResults.playwright === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["rendererResults", "playwright"],
        message: "playwright result is required",
      });
    }

    if (result.renderer === "hyperframes" && result.rendererResults.playwright !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["rendererResults", "playwright"],
        message: "playwright result is not allowed for hyperframes renderer",
      });
    }

    if (result.renderer === "playwright" && result.rendererResults.hyperframes !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["rendererResults", "hyperframes"],
        message: "hyperframes result is not allowed for playwright renderer",
      });
    }
  });

export const GenerationArtifactsSchema = z.object({
  storyboardAssetId: z.string().min(1).optional(),
  captureTraceAssetId: z.string().min(1).optional(),
  previewVideoAssetId: z.string().min(1).optional(),
});

export const AssistedGenerationResultSchema = z.object({
  project: DemoProjectSchema,
  artifacts: GenerationArtifactsSchema.optional(),
  warnings: z.array(z.string().min(1)).default([]),
});

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
