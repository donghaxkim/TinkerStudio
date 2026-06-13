import type {
  ApiArtifact,
  ApiArtifactKind,
  ApiGenerationJob,
  ApiGenerationJobStatus,
} from "@tinker/generation-contract";

/** The POST /api/jobs body: an ai-url-planning request minus server-derived fields. */
export type CreateCompositionJobRequest = {
  mode: "ai-url-planning";
  repoUrl: string;
  productUrl: string;
  durationCapSeconds: number;
  aspectRatio: "16:9" | "9:16" | "1:1";
  prompt?: string;
  /** Defaults to "hyperframes" in the HTTP client if omitted (the server defaults to playwright). */
  renderer?: "hyperframes" | "playwright" | "both";
};

export type WaitForJobOptions = {
  intervalMs?: number;
  onUpdate?: (job: ApiGenerationJob) => void;
  signal?: AbortSignal;
};

export interface CompositionGenerationClient {
  createJob(request: CreateCompositionJobRequest): Promise<ApiGenerationJob>;
  getJob(jobId: string): Promise<ApiGenerationJob>;
  waitForJob(jobId: string, options?: WaitForJobOptions): Promise<ApiGenerationJob>;
}

export function isTerminalStatus(status: ApiGenerationJobStatus): boolean {
  return status === "completed" || status === "failed";
}

export function selectArtifact(job: ApiGenerationJob, kind: ApiArtifactKind): ApiArtifact | undefined {
  return job.result?.artifacts.find((artifact) => artifact.kind === kind);
}

export function selectArtifactUrl(job: ApiGenerationJob, kind: ApiArtifactKind): string | undefined {
  return selectArtifact(job, kind)?.url;
}
