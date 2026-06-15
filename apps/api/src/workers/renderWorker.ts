import type { ApiGenerationResult, GenerationError } from "@tinker/generation-contract";
import type { JobRecord, JobStore, PendingRender } from "../jobs/jobStore.js";

/** Render a revision's composition to mp4 and return its re-indexed artifacts (incl. output-video). */
export type RunRender = (record: JobRecord, render: PendingRender) => Promise<ApiGenerationResult>;

export type RenderWorkerOptions = { store: JobStore; runRender: RunRender; now?: () => string };

export function createRenderWorker(options: RenderWorkerOptions) {
  const now = options.now ?? (() => new Date().toISOString());
  return async (id: string): Promise<void> => {
    const record = options.store.getRecord(id);
    const render = record?.pendingRender;
    if (record === undefined || render === undefined) return;
    try {
      const result = await options.runRender(record, render);
      options.store.setRevisionResult(id, render.revId, result, now());
    } catch (err) {
      // The edit succeeded; only the MP4 render failed. Record the error on the revision so the
      // export poll can surface it (instead of polling forever), and clear pendingRender so it
      // isn't retried automatically. The revision stays `completed` and can be re-rendered.
      const message = err instanceof Error ? err.message : String(err);
      const error: GenerationError = { status: "failed", stage: "assembly", message };
      options.store.failRevisionRender(id, render.revId, error, now());
    }
  };
}
