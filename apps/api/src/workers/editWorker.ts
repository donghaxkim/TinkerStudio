import type { ApiGenerationResult } from "@tinker/generation-contract";
import type { JobRecord, JobStore, PendingEdit } from "../jobs/jobStore.js";

/** Produce the new revision's result (artifacts) for a pending edit. Real impl (3b-4) runs the agent. */
export type RunEdit = (record: JobRecord, edit: PendingEdit) => Promise<ApiGenerationResult>;

export type EditWorkerOptions = { store: JobStore; runEdit: RunEdit; now?: () => string };

export function createEditWorker(options: EditWorkerOptions) {
  const now = options.now ?? (() => new Date().toISOString());
  return async (id: string): Promise<void> => {
    const record = options.store.getRecord(id);
    const edit = record?.pendingEdit;
    if (record === undefined || edit === undefined) return;
    try {
      const result = await options.runEdit(record, edit);
      const t = now();
      options.store.appendRevision(id, { id: edit.revId, status: "completed", createdAt: t, result }, t);
    } catch (err) {
      options.store.failRevision(id, edit.revId, { status: "failed", stage: "unknown", message: err instanceof Error ? err.message : String(err) }, now());
    }
  };
}
