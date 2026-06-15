import type {
  ApiGenerationJob,
  CreateDemoRequest,
  GenerationJob,
  GenerationProgressEvent,
} from "@tinker/generation-contract";

export type GenerationClientJob = GenerationJob | ApiGenerationJob;

export interface GenerationClient {
  kind?: "api" | "mock";
  createDemo(request: CreateDemoRequest): Promise<GenerationClientJob>;
  getJob(jobId: string): Promise<GenerationClientJob>;
  subscribeToProgress(jobId: string, onProgress: (event: GenerationProgressEvent) => void): () => void;
}
