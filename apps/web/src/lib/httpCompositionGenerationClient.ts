import { safeParseApiGenerationJob, type ApiGenerationJob } from "@tinker/generation-contract";
import {
  isTerminalStatus,
  type CompositionGenerationClient,
  type CreateCompositionJobRequest,
  type WaitForJobOptions,
} from "./compositionGenerationClient.js";

export type HttpCompositionGenerationClientOptions = {
  /** Base URL for the API. Default "" → same-origin via the Vite dev proxy. */
  baseUrl?: string;
  /** Injectable fetch for tests. Default: global fetch. */
  fetchFn?: typeof fetch;
};

const DEFAULT_POLL_INTERVAL_MS = 1500;

export function createHttpCompositionGenerationClient(
  options: HttpCompositionGenerationClientOptions = {},
): CompositionGenerationClient {
  const baseUrl = options.baseUrl ?? "";
  const fetchFn = options.fetchFn ?? fetch;

  async function readJob(response: Response): Promise<ApiGenerationJob> {
    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }
    const parsed = safeParseApiGenerationJob(await response.json());
    if (!parsed.success) {
      throw new Error(`Malformed job response: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
    }
    return parsed.data;
  }

  async function getJob(jobId: string): Promise<ApiGenerationJob> {
    return readJob(await fetchFn(`${baseUrl}/api/jobs/${jobId}`));
  }

  return {
    async createJob(request: CreateCompositionJobRequest): Promise<ApiGenerationJob> {
      const body = { renderer: "hyperframes" as const, ...request };
      return readJob(
        await fetchFn(`${baseUrl}/api/jobs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    },
    getJob,
    async waitForJob(jobId: string, waitOptions: WaitForJobOptions = {}): Promise<ApiGenerationJob> {
      const intervalMs = waitOptions.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
      for (;;) {
        waitOptions.signal?.throwIfAborted();
        const job = await getJob(jobId);
        waitOptions.onUpdate?.(job);
        if (isTerminalStatus(job.status)) {
          return job;
        }
        await delay(intervalMs, waitOptions.signal);
      }
    },
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as { message?: unknown };
    if (typeof json?.message === "string" && json.message.length > 0) {
      return json.message;
    }
  } catch {
    // body was not JSON; fall through
  }
  return `Request failed with status ${response.status}`;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
