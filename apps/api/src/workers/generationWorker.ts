import {
  GenerationErrorSchema,
  ManualFixtureProgressEventSchema,
  type GenerationError,
  type ManualFixtureGenerationResult,
} from "@tinker/generation-contract";
import { LocalGenerationJobError, runLocalGenerationJob, type RunLocalGenerationJobOptions } from "@tinker/demo-assembly";
import type { JobStore } from "../jobs/jobStore.js";
import { buildApiGenerationResult } from "./apiGenerationResult.js";

export type GenerationRunner = (
  rawRequest: unknown,
  options?: RunLocalGenerationJobOptions,
) => Promise<ManualFixtureGenerationResult>;

export type GenerationWorkerOptions = {
  store: JobStore;
  runner?: GenerationRunner;
  now?: () => string;
};

export type GenerationWorker = ReturnType<typeof createGenerationWorker>;

function unknownError(error: unknown): GenerationError {
  const message = error instanceof Error ? error.message : String(error);

  return GenerationErrorSchema.parse({
    status: "failed",
    stage: "unknown",
    message: message.trim().length > 0 ? message : "Unknown generation error",
  });
}

function isTerminalStatus(status: string) {
  return status === "completed" || status === "failed";
}

function cancelledError(id: string) {
  return GenerationErrorSchema.parse({
    jobId: id,
    status: "failed",
    stage: "cancelled",
    message: "Generation cancelled.",
  });
}

export function createGenerationWorker(options: GenerationWorkerOptions) {
  const runner = options.runner ?? runLocalGenerationJob;
  const now = options.now ?? (() => new Date().toISOString());
  const controllers = new Map<string, AbortController>();

  async function runQueuedJob(id: string) {
    const record = options.store.getRecord(id);
    if (record === undefined) return;
    if (isTerminalStatus(record.status)) return;
    const controller = new AbortController();
    controllers.set(id, controller);

    try {
      const result = await runner(record.request, {
        signal: controller.signal,
        onProgress: (event) => {
          const parsed = ManualFixtureProgressEventSchema.safeParse(event);
          if (parsed.success && parsed.data.jobId === id) {
            options.store.appendProgress(id, parsed.data);
          }
        },
      });
      if (controller.signal.aborted) {
        options.store.fail(id, cancelledError(id), now());
        return;
      }

      const outputRoot = result.outputDirectory;
      record.outputRoot = outputRoot;
      const apiResult = await buildApiGenerationResult({
        jobId: id,
        outputRoot,
        generationResult: result,
      });
      const currentRecord = options.store.getRecord(id);
      if (currentRecord === undefined || isTerminalStatus(currentRecord.status)) {
        return;
      }
      if (controller.signal.aborted) {
        options.store.fail(id, cancelledError(id), now());
        return;
      }
      options.store.complete(
        id,
        apiResult,
        now(),
      );
    } catch (error) {
      if (controller.signal.aborted) {
        options.store.fail(id, cancelledError(id), now());
        return;
      }
      const generationError = error instanceof LocalGenerationJobError ? error.generationError : unknownError(error);
      options.store.fail(id, generationError, now());
    } finally {
      controllers.delete(id);
    }
  }

  return Object.assign(runQueuedJob, {
    cancel(id: string) {
      const controller = controllers.get(id);
      if (controller === undefined) return false;
      controller.abort();
      options.store.fail(id, cancelledError(id), now());
      return true;
    },
  });
}
