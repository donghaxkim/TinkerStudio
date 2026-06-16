import {
  PlanningSessionResponseSchema,
  type DemoOutline,
  type PlanningAgent,
  type PlanningMessage,
  type PlanningSessionResponse,
  type PlanningSessionStatus,
} from "@tinker/generation-contract";

export type PlanningSessionRecord = {
  id: string;
  productUrl: string;
  repoUrl: string;
  agent: PlanningAgent;
  status: PlanningSessionStatus;
  messages: PlanningMessage[];
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
  agentResumeHandle?: string;
  repoCheckoutDirectory?: string;
  websiteAnalysisPath?: string;
  repoAnalysisPath?: string;
  outline?: DemoOutline;
  outlineValid: boolean;
};

export type PlanningSessionStore = ReturnType<typeof createPlanningSessionStore>;

function snapshot(record: PlanningSessionRecord): PlanningSessionResponse {
  return PlanningSessionResponseSchema.parse({
    id: record.id,
    productUrl: record.productUrl,
    repoUrl: record.repoUrl,
    agent: record.agent,
    status: record.status,
    messages: record.messages,
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
      delete record.lastError;
      record.updatedAt = now;
    },

    markReady(id: string, input: MarkPlanningSessionReadyInput, now: string) {
      const record = records.get(id);
      if (record === undefined) return;

      record.status = "ready";
      record.messages.push({ role: "assistant", content: input.assistantMessage });
      record.outlineValid = input.outlineValid;
      if (input.outline === undefined) {
        delete record.outline;
      } else {
        record.outline = input.outline;
      }
      if (input.agentResumeHandle !== undefined) record.agentResumeHandle = input.agentResumeHandle;
      if (input.repoCheckoutDirectory !== undefined) record.repoCheckoutDirectory = input.repoCheckoutDirectory;
      if (input.websiteAnalysisPath !== undefined) record.websiteAnalysisPath = input.websiteAnalysisPath;
      if (input.repoAnalysisPath !== undefined) record.repoAnalysisPath = input.repoAnalysisPath;
      delete record.lastError;
      record.updatedAt = now;
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
