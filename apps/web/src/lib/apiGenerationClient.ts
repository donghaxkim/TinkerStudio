import {
  parseApiGenerationJob,
  type AiUrlPlanningCreateDemoRequest,
  type ApiGenerationJob,
  type CreateDemoRequest,
  type GenerationProgressEvent,
} from "@tinker/generation-contract";
import type { GenerationClient } from "./generationClient.js";

type FetchLike = typeof globalThis.fetch;

type ApiGenerationClientOptions = {
  baseUrl?: string;
  fetch?: FetchLike;
  pollIntervalMs?: number;
};

const terminalStatuses = new Set<ApiGenerationJob["status"]>(["completed", "failed"]);

function endpoint(baseUrl: string, path: string) {
  return baseUrl ? `${baseUrl.replace(/\/$/, "")}${path}` : path;
}

function sleep(ms: number) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertAiUrlPlanningRequest(request: CreateDemoRequest): asserts request is AiUrlPlanningCreateDemoRequest {
  if ((request as { mode?: string }).mode !== "ai-url-planning") {
    throw new Error("API generation requires an ai-url-planning request");
  }
}

async function readJson(response: Response) {
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message =
      body !== null && typeof body === "object" && "message" in body && typeof body.message === "string"
        ? body.message
        : `Generation API request failed with status ${response.status}`;
    throw new Error(message);
  }
  return body;
}

export function createApiGenerationClient(options: ApiGenerationClientOptions = {}): GenerationClient {
  const baseUrl = options.baseUrl ?? "";
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const pollIntervalMs = options.pollIntervalMs ?? 1500;
  const subscribers = new Map<string, Set<(event: GenerationProgressEvent) => void>>();
  const emittedProgress = new Set<string>();

  function emitProgress(job: ApiGenerationJob) {
    const callbacks = subscribers.get(job.id);
    if (callbacks === undefined || callbacks.size === 0) return;

    for (const event of job.progressEvents) {
      const key = `${event.jobId}:${event.status}:${event.time}:${event.message}`;
      if (emittedProgress.has(key)) continue;
      emittedProgress.add(key);
      callbacks.forEach((callback) => callback(event));
    }
  }

  async function fetchJob(jobId: string) {
    const response = await fetchImpl(endpoint(baseUrl, `/api/jobs/${encodeURIComponent(jobId)}`));
    const body = await readJson(response);
    const job = parseApiGenerationJob(body);
    emitProgress(job);
    return job;
  }

  return {
    kind: "api",

    async createDemo(request: CreateDemoRequest) {
      assertAiUrlPlanningRequest(request);
      const response = await fetchImpl(endpoint(baseUrl, "/api/jobs"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      let job = parseApiGenerationJob(await readJson(response));
      emitProgress(job);

      while (!terminalStatuses.has(job.status)) {
        await sleep(pollIntervalMs);
        job = await fetchJob(job.id);
      }

      return job;
    },

    getJob: fetchJob,

    subscribeToProgress(jobId: string, onProgress: (event: GenerationProgressEvent) => void) {
      const callbacks = subscribers.get(jobId) ?? new Set<(event: GenerationProgressEvent) => void>();
      callbacks.add(onProgress);
      subscribers.set(jobId, callbacks);
      return () => {
        callbacks.delete(onProgress);
        if (callbacks.size === 0) subscribers.delete(jobId);
      };
    },
  };
}
