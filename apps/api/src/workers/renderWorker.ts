import type { ApiGenerationResult } from "@tinker/generation-contract";
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
    } catch {
      // leave the revision as-is (no output-video); just clear pendingRender so it isn't retried forever
      options.store.clearPendingRender(id);
    }
  };
}
