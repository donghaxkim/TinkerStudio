import type { ChatContextRef } from "./chatContext.js";

/** POST /api/jobs/:id/edits body. `jobId` is the path param; `context` empty = whole composition. */
export type CompositionEditRequest = {
  jobId: string;
  instruction: string;
  context: ChatContextRef[];
};

/** A composition revision — a client-side pointer over server-retained artifacts. NOT an ApiGenerationJob field. */
export type CompositionRevision = {
  id: string;
  compositionIndexUrl: string;
  outputVideoUrl?: string;
};

export type EditComposeOptions = {
  /** Coarse progress: the client emits "running" before resolving. */
  onUpdate?: (status: "running") => void;
  signal?: AbortSignal;
};

export interface CompositionEditClient {
  editComposition(request: CompositionEditRequest, options?: EditComposeOptions): Promise<CompositionRevision>;
}
