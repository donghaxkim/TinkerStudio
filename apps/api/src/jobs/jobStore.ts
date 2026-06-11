import {
  ApiGenerationJobSchema,
  type AiUrlPlanningCreateDemoRequest,
  type ApiGenerationJob,
  type ApiGenerationJobStatus,
  type ApiGenerationResult,
  type GenerationError,
  type ManualFixtureProgressEvent,
} from "@tinker/generation-contract";

export type JobRecord = ApiGenerationJob & {
  outputRoot: string;
};

export type CreateJobInput = {
  id: string;
  request: AiUrlPlanningCreateDemoRequest;
  outputRoot: string;
  now: string;
};

export type JobStore = ReturnType<typeof createJobStore>;

function toApiRequest(input: CreateJobInput): ApiGenerationJob["request"] {
  const { outputDirectory: _outputDirectory, renderer, id, ...request } = input.request;
  return {
    ...request,
    id: id ?? input.id,
    ...(renderer === "hyperframes" ? { renderer } : {}),
  };
}

function snapshot(record: JobRecord): ApiGenerationJob {
  const { outputRoot: _outputRoot, ...job } = record;
  return ApiGenerationJobSchema.parse(job);
}

export function createJobStore() {
  const records = new Map<string, JobRecord>();

  return {
    create(input: CreateJobInput) {
      const record: JobRecord = {
        id: input.id,
        status: "queued",
        request: toApiRequest(input),
        createdAt: input.now,
        updatedAt: input.now,
        progressEvents: [],
        outputRoot: input.outputRoot,
      };
      records.set(input.id, record);
      return snapshot(record);
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
      record.status = event.status as ApiGenerationJobStatus;
      record.updatedAt = event.time;
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
  };
}
