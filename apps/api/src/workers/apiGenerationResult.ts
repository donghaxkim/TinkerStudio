import type { ApiArtifact, ApiArtifactKind, ApiGenerationResult, ManualFixtureGenerationResult } from "@tinker/generation-contract";
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

export async function buildApiGenerationResult(input: BuildApiGenerationResultInput): Promise<ApiGenerationResult> {
  const artifacts = indexArtifacts({
    jobId: input.jobId,
    outputRoot: input.outputRoot,
    artifactPaths: input.generationResult.artifactPaths,
  });

  if (input.generationResult.renderer !== "testreel") {
    throw new Error(`Unsupported API renderer: ${String(input.generationResult.renderer)}`);
  }

  requireArtifact(artifacts, "published-video");
  return { method: "testreel", artifacts, warnings: [] };
}
