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

/** POST /api/jobs/:id/revisions/:revId/render target. */
export type RenderRevisionRequest = {
  jobId: string;
  revId: string;
};

export interface CompositionEditClient {
  editComposition(request: CompositionEditRequest, options?: EditComposeOptions): Promise<CompositionRevision>;
  /**
   * Render a (completed) revision's composition to MP4 on demand and resolve with the output
   * video URL. Used by Export so an edited revision delivers the EDITED video, not the base.
   */
  renderRevision(request: RenderRevisionRequest, options?: EditComposeOptions): Promise<string>;
}
