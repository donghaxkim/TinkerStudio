import {
  GenerationErrorSchema,
  ManualFixtureProgressEventSchema,
  type GenerationError,
  type ManualFixtureGenerationResult,
} from "@tinker/generation-contract";
import { LocalGenerationJobError, runLocalGenerationJob, type RunLocalGenerationJobOptions } from "@tinker/demo-assembly";
import { indexArtifacts } from "../jobs/artifactIndex.js";
import type { JobStore } from "../jobs/jobStore.js";

export type GenerationRunner = (
  rawRequest: unknown,
  options?: RunLocalGenerationJobOptions,
) => Promise<ManualFixtureGenerationResult>;

export type GenerationWorkerOptions = {
  store: JobStore;
  runner?: GenerationRunner;
  now?: () => string;
};

function unknownError(error: unknown): GenerationError {
  return GenerationErrorSchema.parse({
    status: "failed",
    stage: "unknown",
    message: error instanceof Error ? error.message : String(error),
  });
}

export function createGenerationWorker(options: GenerationWorkerOptions) {
  const runner = options.runner ?? runLocalGenerationJob;
  const now = options.now ?? (() => new Date().toISOString());

  return async function runQueuedJob(id: string) {
    const record = options.store.getRecord(id);
    if (record === undefined) return;

    try {
      const result = await runner(record.request, {
        onProgress: (event) => {
          const parsed = ManualFixtureProgressEventSchema.safeParse(event);
          if (parsed.success) {
            options.store.appendProgress(id, parsed.data);
          }
        },
      });

      const outputRoot = result.outputDirectory;
      record.outputRoot = outputRoot;
      options.store.complete(
        id,
        {
          artifacts: indexArtifacts({ jobId: id, outputRoot, artifactPaths: result.artifactPaths }),
        },
        now(),
      );
    } catch (error) {
      const generationError = error instanceof LocalGenerationJobError ? error.generationError : unknownError(error);
      options.store.fail(id, generationError, now());
    }
  };
}
