import { readFile } from "node:fs/promises";
import { DemoProjectSchema } from "@tinker/project-schema";
import type {
  ApiArtifact,
  ApiArtifactKind,
  ApiGenerationResult,
  ManualFixtureGenerationResult,
} from "@tinker/generation-contract";
import { indexArtifacts } from "../jobs/artifactIndex.js";

export type BuildApiGenerationResultInput = {
  jobId: string;
  outputRoot: string;
  generationResult: ManualFixtureGenerationResult;
};

function requireArtifact(artifacts: ApiArtifact[], kind: ApiArtifactKind) {
  const artifact = artifacts.find((candidate) => candidate.kind === kind);
  if (artifact === undefined) {
    throw new Error(`Completed job is missing required ${kind} artifact`);
  }
  return artifact;
}

function optionalArtifact(artifacts: ApiArtifact[], kind: ApiArtifactKind) {
  return artifacts.find((candidate) => candidate.kind === kind);
}

async function readDemoProject(projectPath: string) {
  const raw = await readFile(projectPath, "utf8");
  return DemoProjectSchema.parse(JSON.parse(raw));
}

export async function buildApiGenerationResult(input: BuildApiGenerationResultInput): Promise<ApiGenerationResult> {
  const artifacts = indexArtifacts({
    jobId: input.jobId,
    outputRoot: input.outputRoot,
    artifactPaths: input.generationResult.artifactPaths,
  });

  if (input.generationResult.renderer === "playwright") {
    const projectPath = input.generationResult.rendererResults?.playwright?.projectPath ?? input.generationResult.projectPath;
    requireArtifact(artifacts, "playwright-demo-project");
    const project = await readDemoProject(projectPath);
    return {
      method: "playwright",
      project,
      artifacts,
      warnings: [],
    };
  }

  if (input.generationResult.renderer === "hyperframes") {
    const generationManifestArtifact = optionalArtifact(artifacts, "generation-manifest");
    const assetManifestArtifact = optionalArtifact(artifacts, "asset-manifest");
    return {
      method: "hyperframes",
      composition: {
        indexArtifact: requireArtifact(artifacts, "composition-index"),
        outputVideoArtifact: requireArtifact(artifacts, "output-video"),
        ...(generationManifestArtifact === undefined ? {} : { generationManifestArtifact }),
        ...(assetManifestArtifact === undefined ? {} : { assetManifestArtifact }),
      },
      artifacts,
      warnings: [],
    };
  }

  throw new Error(`Unsupported API renderer: ${String(input.generationResult.renderer)}`);
}
