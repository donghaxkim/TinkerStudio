import {
  PlanningSessionResponseSchema,
  type DemoOutline,
  type PlanningAgent,
  type PlanningMessage,
  type PlanningProgressEntry,
  type PlanningProgressStatus,
  type PlanningSessionResponse,
  type PlanningSessionStatus,
  type PlanningStage,
} from "@tinker/generation-contract";

export type PlanningSessionRecord = {
  id: string;
  productUrl?: string;
  repoUrl: string;
  agent: PlanningAgent;
  status: PlanningSessionStatus;
  messages: PlanningMessage[];
  progress: PlanningProgressEntry[];
  thoughts?: string[];
  outline?: DemoOutline;
  outlineValid: boolean;
  agentResumeHandle?: string;
  workspaceRoot: string;
  outlinePath: string;
  repoCheckoutDirectory?: string;
  websiteAnalysisPath?: string;
  repoAnalysisPath?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreatePlanningSessionRecordInput = {
  id: string;
  productUrl: string;
  repoUrl: string;
  agent: PlanningAgent;
  workspaceRoot: string;
  outlinePath: string;
  now: string;
};

export type MarkPlanningSessionReadyInput = {
  assistantMessage: string;
  agentResumeHandle: string;
  repoCheckoutDirectory?: string;
  websiteAnalysisPath?: string;
  repoAnalysisPath?: string;
  outline?: DemoOutline;
  outlineValid: boolean;
  thoughts?: string[];
};

export type PlanningSessionStore = ReturnType<typeof createPlanningSessionStore>;

function snapshot(record: PlanningSessionRecord): PlanningSessionResponse {
  return PlanningSessionResponseSchema.parse({
    id: record.id,
    ...(record.productUrl === undefined ? {} : { productUrl: record.productUrl }),
    repoUrl: record.repoUrl,
    agent: record.agent,
    status: record.status,
    messages: record.messages,
    progress: record.progress,
    ...(record.thoughts === undefined ? {} : { thoughts: record.thoughts }),
    outlineValid: record.outlineValid,
    ...(record.outline === undefined ? {} : { outline: record.outline }),
    ...(record.lastError === undefined ? {} : { lastError: record.lastError }),
  });
}

export function createPlanningSessionStore() {
  const records = new Map<string, PlanningSessionRecord>();

  return {
    create(input: CreatePlanningSessionRecordInput) {
      const record: PlanningSessionRecord = {
        id: input.id,
        productUrl: input.productUrl,
        repoUrl: input.repoUrl,
        agent: input.agent,
        status: "starting",
        messages: [],
        progress: [],
        outlineValid: false,
        workspaceRoot: input.workspaceRoot,
        outlinePath: input.outlinePath,
        createdAt: input.now,
        updatedAt: input.now,
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

    markRunning(id: string, now: string) {
      const record = records.get(id);
      if (record === undefined) return;
      record.status = "running";
      record.progress = [];
      delete record.thoughts;
      delete record.lastError;
      record.updatedAt = now;
    },

    setProgress(id: string, stage: PlanningStage, status: PlanningProgressStatus, now: string) {
      const record = records.get(id);
      if (record === undefined) return;
      const existing = record.progress.find((entry) => entry.stage === stage);
      if (existing === undefined) {
        record.progress.push({ stage, status });
      } else {
        existing.status = status;
      }
      record.updatedAt = now;
    },

    setThoughts(id: string, thoughts: string[], now: string) {
      const record = records.get(id);
      if (record === undefined) return;
      const cleanThoughts = thoughts.map((thought) => thought.trim()).filter((thought) => thought !== "");
      if (cleanThoughts.length === 0) {
        delete record.thoughts;
      } else {
        record.thoughts = cleanThoughts;
      }
      record.updatedAt = now;
    },

    markReady(id: string, input: MarkPlanningSessionReadyInput, now: string) {
      const record = records.get(id);
      if (record === undefined) return;

      const nextRecord: PlanningSessionRecord = {
        ...record,
        status: "ready",
        messages: [...record.messages, { role: "assistant", content: input.assistantMessage }],
        outlineValid: input.outlineValid,
        updatedAt: now,
      };
      const cleanThoughts = input.thoughts?.map((thought) => thought.trim()).filter((thought) => thought !== "");
      if (cleanThoughts === undefined || cleanThoughts.length === 0) {
        delete nextRecord.thoughts;
      } else {
        nextRecord.thoughts = cleanThoughts;
      }
      if (input.outline === undefined) {
        delete nextRecord.outline;
      } else {
        nextRecord.outline = input.outline;
      }
      if (input.agentResumeHandle !== undefined) nextRecord.agentResumeHandle = input.agentResumeHandle;
      if (input.repoCheckoutDirectory !== undefined) nextRecord.repoCheckoutDirectory = input.repoCheckoutDirectory;
      if (input.websiteAnalysisPath !== undefined) nextRecord.websiteAnalysisPath = input.websiteAnalysisPath;
      if (input.repoAnalysisPath !== undefined) nextRecord.repoAnalysisPath = input.repoAnalysisPath;
      delete nextRecord.lastError;

      snapshot(nextRecord);
      records.set(id, nextRecord);
    },

    appendUserMessage(id: string, message: string, now: string) {
      const record = records.get(id);
      if (record === undefined) return;
      record.messages.push({ role: "user", content: message });
      record.updatedAt = now;
    },

    markError(id: string, error: string, now: string) {
      const record = records.get(id);
      if (record === undefined) return;
      record.status = "error";
      record.lastError = error;
      record.updatedAt = now;
    },

    snapshot,
  };
}
