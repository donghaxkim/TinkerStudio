import type {
  CreateDemoRequest,
  GenerationJob,
  GenerationProgressEvent,
} from "@tinker/generation-contract";

export interface GenerationClient {
  createDemo(request: CreateDemoRequest): Promise<GenerationJob>;
  getJob(jobId: string): Promise<GenerationJob>;
  subscribeToProgress(jobId: string, onProgress: (event: GenerationProgressEvent) => void): () => void;
}
