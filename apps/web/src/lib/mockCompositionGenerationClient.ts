import type { ApiGenerationJob } from "@tinker/generation-contract";
import {
  type CompositionGenerationClient,
  type CreateCompositionJobRequest,
  type WaitForJobOptions,
} from "./compositionGenerationClient.js";

const FIXED_TIME = "2026-01-01T00:00:00.000Z";

function completedJob(id: string, request: CreateCompositionJobRequest): ApiGenerationJob {
  return {
    id,
    status: "completed",
    request: {
      id,
      mode: "ai-url-planning",
      repoUrl: request.repoUrl,
      productUrl: request.productUrl,
      durationCapSeconds: request.durationCapSeconds,
      aspectRatio: request.aspectRatio,
      renderer: request.renderer ?? "hyperframes",
      ...(request.prompt === undefined ? {} : { prompt: request.prompt }),
    },
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    progressEvents: [],
    result: {
      artifacts: [
        { kind: "composition-index", relativePath: "hyperframes/index.html", url: `/api/jobs/${id}/artifacts/hyperframes/index.html`, mediaType: "text/html" },
        { kind: "output-video", relativePath: "hyperframes/output.mp4", url: `/api/jobs/${id}/artifacts/hyperframes/output.mp4`, mediaType: "video/mp4" },
      ],
    },
  } as ApiGenerationJob;
}

/** A non-terminal snapshot derived from a completed job (single home for the result-clearing cast). */
function runningSnapshot(done: ApiGenerationJob): ApiGenerationJob {
  return { ...done, status: "running", result: undefined } as ApiGenerationJob;
}

export function createMockCompositionGenerationClient(): CompositionGenerationClient {
  const jobs = new Map<string, ApiGenerationJob>();
  let counter = 0;

  // Deterministic test double: the stored job is already "completed", so getJob
  // returns completion immediately. Callers exercise the non-terminal path via
  // waitForJob's onUpdate sequence (running -> completed) below, not by re-polling getJob.
  async function getJob(jobId: string): Promise<ApiGenerationJob> {
    const job = jobs.get(jobId);
    if (!job) {
      throw new Error(`Unknown mock composition job '${jobId}'`);
    }
    return job;
  }

  return {
    async createJob(request: CreateCompositionJobRequest): Promise<ApiGenerationJob> {
      counter += 1;
      const id = `mock-job-${counter}`;
      const done = completedJob(id, request);
      jobs.set(id, done);
      // Surface a non-terminal snapshot first so callers exercise the poll path.
      return runningSnapshot(done);
    },
    getJob,
    async waitForJob(jobId: string, options: WaitForJobOptions = {}): Promise<ApiGenerationJob> {
      options.signal?.throwIfAborted();
      // The mock resolves synchronously — intervalMs is intentionally ignored.
      const done = await getJob(jobId);
      // Faithful to the real HTTP client: emit a non-terminal update before the terminal one.
      options.onUpdate?.(runningSnapshot(done));
      options.onUpdate?.(done);
      return done;
    },
  };
}
