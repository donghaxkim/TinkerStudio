import {
  ApiGenerationJobSchema,
  type AiUrlPlanningCreateDemoRequest,
  type ApiGenerationJob,
  type ApiGenerationJobStatus,
  type ApiGenerationResult,
  type ApiRevision,
  type ApiRevisionResult,
  type EditContextRef,
  type GenerationError,
  type ManualFixtureProgressEvent,
} from "@tinker/generation-contract";

export type PendingEdit = { revId: string; instruction: string; context: EditContextRef[] };

export type PendingRender = { revId: string };

export type JobRecord = Omit<ApiGenerationJob, "request"> & {
  request: AiUrlPlanningCreateDemoRequest & { id: string };
  outputRoot: string;
  pendingEdit?: PendingEdit;
  pendingRender?: PendingRender;
};

export type CreateJobInput = {
  id: string;
  request: AiUrlPlanningCreateDemoRequest;
  outputRoot: string;
  now: string;
};

export type JobStore = ReturnType<typeof createJobStore>;

function requestWithServerId(input: CreateJobInput): JobRecord["request"] {
  return {
    ...input.request,
    id: input.id,
  };
}

function isNonTerminalStatus(status: ManualFixtureProgressEvent["status"]): status is ApiGenerationJobStatus {
  return status === "queued" || status === "running" || status === "capturing" || status === "assembling";
}

function snapshot(record: JobRecord): ApiGenerationJob {
  const { outputRoot: _outputRoot, pendingEdit: _pendingEdit, pendingRender: _pendingRender, ...job } = record;
  return ApiGenerationJobSchema.parse(job);
}

function isTerminalStatus(status: ApiGenerationJobStatus) {
  return status === "completed" || status === "failed";
}

function hasValidSnapshotDatetime(record: JobRecord, updatedAt: string) {
  const { outputRoot: _outputRoot, pendingEdit: _pendingEdit, pendingRender: _pendingRender, ...job } = { ...record, updatedAt };
  return ApiGenerationJobSchema.safeParse(job).success;
}

export function createJobStore() {
  const records = new Map<string, JobRecord>();

  return {
    create(input: CreateJobInput) {
      const record: JobRecord = {
        id: input.id,
        status: "queued",
        request: requestWithServerId(input),
        createdAt: input.now,
        updatedAt: input.now,
        progressEvents: [],
        outputRoot: input.outputRoot,
      };
      const created = snapshot(record);
      records.set(input.id, record);
      return created;
    },

    getRecord(id: string) {
      return records.get(id);
    },

    getSnapshot(id: string) {
      const record = records.get(id);
      return record === undefined ? undefined : snapshot(record);
    },

    appendProgress(id: string, event: ManualFixtureProgressEvent) {
      const record = records.get(id);
      if (record === undefined) return;

      record.progressEvents.push(event);
      if (!isTerminalStatus(record.status) && isNonTerminalStatus(event.status)) {
        record.status = event.status;
      }
      if (hasValidSnapshotDatetime(record, event.time)) {
        record.updatedAt = event.time;
      }
    },

    complete(id: string, result: ApiGenerationResult, now: string) {
      const record = records.get(id);
      if (record === undefined) return;

      record.status = "completed";
      record.result = result;
      delete record.error;
      record.updatedAt = now;
    },

    fail(id: string, error: GenerationError, now: string) {
      const record = records.get(id);
      if (record === undefined) return;

      record.status = "failed";
      record.error = error;
      delete record.result;
      record.updatedAt = now;
    },

    setPendingEdit(id: string, edit: PendingEdit) {
      const record = records.get(id);
      if (record === undefined) return;
      record.pendingEdit = edit;
    },

    setPendingRender(id: string, render: PendingRender) {
      const record = records.get(id);
      if (record === undefined) return;
      record.pendingRender = render;
    },

    setRevisionResult(id: string, revId: string, result: ApiRevisionResult, now: string) {
      const record = records.get(id);
      if (record === undefined) return;
      record.revisions = (record.revisions ?? []).map((r) => (r.id === revId ? { id: r.id, status: "completed", createdAt: r.createdAt, result } : r));
      delete record.pendingRender;
      record.updatedAt = now;
    },

    clearPendingRender(id: string) {
      const record = records.get(id);
      if (record === undefined) return;
      delete record.pendingRender;
    },

    /**
     * Record a render-on-demand failure on a revision. The revision keeps its `completed`
     * status (the edit succeeded; only the MP4 render failed) so it can be re-rendered, and
     * the export poll can detect the failure via `renderError`.
     */
    failRevisionRender(id: string, revId: string, error: GenerationError, now: string) {
      const record = records.get(id);
      if (record === undefined) return;
      record.revisions = (record.revisions ?? []).map((r) => (r.id === revId ? { ...r, renderError: error } : r));
      delete record.pendingRender;
      record.updatedAt = now;
    },

    appendRevision(id: string, revision: ApiRevision, now: string) {
      const record = records.get(id);
      if (record === undefined) return;
      record.revisions = [...(record.revisions ?? []), revision];
      record.currentRevisionId = revision.id;
      delete record.pendingEdit;
      record.updatedAt = now;
    },

    failRevision(id: string, revId: string, error: GenerationError, now: string) {
      const record = records.get(id);
      if (record === undefined) return;
      const failed: ApiRevision = { id: revId, status: "failed", createdAt: now, error };
      record.revisions = [...(record.revisions ?? []), failed];
      delete record.pendingEdit;
      record.updatedAt = now;
    },
  };
}
