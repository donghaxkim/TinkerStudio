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

export function createMockCompositionGenerationClient(): CompositionGenerationClient {
  const jobs = new Map<string, ApiGenerationJob>();
  let counter = 0;

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
      return { ...done, status: "running", result: undefined } as ApiGenerationJob;
    },
    getJob,
    async waitForJob(jobId: string, options: WaitForJobOptions = {}): Promise<ApiGenerationJob> {
      const job = await getJob(jobId);
      options.onUpdate?.(job);
      return job;
    },
  };
}
