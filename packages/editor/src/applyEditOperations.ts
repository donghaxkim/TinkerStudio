import type { AIEdit, AIEditOperation, DemoProject } from "@tinker/project-schema";
import {
  AIEditOperationSchema,
  DemoProjectSchema,
} from "@tinker/project-schema";
import type { SelectedRange } from "./state/editorState.js";
import { normalizeSelectedRange } from "./state/editorState.js";

export type AIEditProposal = {
  prompt: string;
  targetRange?: SelectedRange;
  operations: AIEditOperation[];
};

export type ApplyEditOperationsMode = "preview" | "accept";

export type ApplyEditOperationsOptions = {
  mode?: ApplyEditOperationsMode;
  /** Defaults to true when targetRange is provided. */
  enforceTargetRange?: boolean;
  now?: () => Date | string;
  editId?: string;
};

export type ApplyEditOperationsErrorCode =
  | "invalid_project"
  | "invalid_proposal"
  | "invalid_operation"
  | "invalid_range"
  | "unknown_entity"
  | "invalid_result";

export type ApplyEditOperationsError = {
  code: ApplyEditOperationsErrorCode;
  message: string;
  issues?: string[];
};

export type ApplyEditOperationsResult =
  | { ok: true; project: DemoProject; aiEdit?: AIEdit }
  | { ok: false; error: ApplyEditOperationsError };

type TimedEntity = { start: number; end: number };

type MutableProject = DemoProject;

function formatIssues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "project";
    return `${path}: ${issue.message}`;
  });
}

function toIsoString(value: Date | string) {
  return typeof value === "string" ? value : value.toISOString();
}

function allEntityIds(project: DemoProject) {
  return new Set([
    ...project.assets.map((asset) => asset.id),
    ...project.tracks.map((track) => track.id),
    ...project.tracks.flatMap((track) => track.clips.map((clip) => clip.id)),
    ...project.zooms.map((zoom) => zoom.id),
    ...project.aiEditHistory.map((edit) => edit.id),
  ]);
}

function createIdFactory(project: DemoProject) {
  const usedIds = allEntityIds(project);
  const counters = new Map<string, number>();

  return (prefix: string) => {
    let counter = counters.get(prefix) ?? 1;
    let id = `${prefix}_ai_${String(counter).padStart(3, "0")}`;

    while (usedIds.has(id)) {
      counter += 1;
      id = `${prefix}_ai_${String(counter).padStart(3, "0")}`;
    }

    counters.set(prefix, counter + 1);
    usedIds.add(id);
    return id;
  };
}

function validateRange(
  range: TimedEntity,
  projectDuration: number,
  label: string,
): ApplyEditOperationsError | undefined {
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end)) {
    return { code: "invalid_range", message: `${label} range must use finite numbers` };
  }

  if (range.start < 0) {
    return { code: "invalid_range", message: `${label} start must be non-negative` };
  }

  if (range.end <= range.start) {
    return { code: "invalid_range", message: `${label} end must be greater than start` };
  }

  if (range.end > projectDuration) {
    return { code: "invalid_range", message: `${label} end must be within project duration` };
  }

  return undefined;
}

function rangeIsWithin(inner: TimedEntity, outer: TimedEntity) {
  return inner.start >= outer.start && inner.end <= outer.end;
}

function findTimedEntity(project: DemoProject, operation: Extract<AIEditOperation, { type: "remove_entity" }>) {
  if (operation.entityType === "zoom") {
    return project.zooms.find((zoom) => zoom.id === operation.id);
  }

  for (const track of project.tracks) {
    const clip = track.clips.find((candidate) => candidate.id === operation.id);
    if (clip) return clip;
  }

  return undefined;
}

function removeEntity(project: MutableProject, operation: Extract<AIEditOperation, { type: "remove_entity" }>) {
  if (operation.entityType === "zoom") {
    project.zooms = project.zooms.filter((zoom) => zoom.id !== operation.id);
    return;
  }

  project.tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.filter((clip) => clip.id !== operation.id),
  }));
}

function validateProposalShape(proposal: AIEditProposal): ApplyEditOperationsError | undefined {
  if (typeof proposal.prompt !== "string" || proposal.prompt.trim().length === 0) {
    return { code: "invalid_proposal", message: "AI edit prompt is required" };
  }

  if (!Array.isArray(proposal.operations)) {
    return { code: "invalid_proposal", message: "AI edit operations must be an array" };
  }

  return undefined;
}

export function applyEditOperations(
  inputProject: DemoProject,
  proposal: AIEditProposal,
  options: ApplyEditOperationsOptions = {},
): ApplyEditOperationsResult {
  const parsedProject = DemoProjectSchema.safeParse(inputProject);
  if (!parsedProject.success) {
    return {
      ok: false,
      error: {
        code: "invalid_project",
        message: "Input DemoProject validation failed",
        issues: formatIssues(parsedProject.error),
      },
    };
  }

  const proposalError = validateProposalShape(proposal);
  if (proposalError) return { ok: false, error: proposalError };

  const mode = options.mode ?? "preview";
  const now = toIsoString((options.now ?? (() => new Date()))());
  const targetRange = proposal.targetRange
    ? normalizeSelectedRange(proposal.targetRange)
    : undefined;
  const enforceTargetRange = options.enforceTargetRange ?? Boolean(targetRange);

  if (targetRange) {
    const targetRangeError = validateRange(targetRange, parsedProject.data.duration, "targetRange");
    if (targetRangeError) return { ok: false, error: targetRangeError };
  }

  const operations: AIEditOperation[] = [];
  for (const [index, operationInput] of proposal.operations.entries()) {
    const parsedOperation = AIEditOperationSchema.safeParse(operationInput);
    if (!parsedOperation.success) {
      return {
        ok: false,
        error: {
          code: "invalid_operation",
          message: `Operation ${index} validation failed`,
          issues: formatIssues(parsedOperation.error),
        },
      };
    }

    const operation = parsedOperation.data;
    if (operation.type !== "remove_entity") {
      const operationRangeError = validateRange(operation, parsedProject.data.duration, `operations.${index}`);
      if (operationRangeError) return { ok: false, error: operationRangeError };

      if (targetRange && enforceTargetRange && !rangeIsWithin(operation, targetRange)) {
        return {
          ok: false,
          error: {
            code: "invalid_range",
            message: `Operation ${index} must be within targetRange`,
          },
        };
      }
    }

    operations.push(operation);
  }

  const project: MutableProject = structuredClone(parsedProject.data);
  const nextId = createIdFactory(project);

  for (const [index, operation] of operations.entries()) {
    if (operation.type === "add_zoom") {
      project.zooms = [
        ...project.zooms,
        {
          id: nextId("zoom"),
          start: operation.start,
          end: operation.end,
          target: operation.target,
          easing: operation.easing,
        },
      ];
      continue;
    }

    const entity = findTimedEntity(project, operation);
    if (!entity) {
      return {
        ok: false,
        error: {
          code: "unknown_entity",
          message: `Cannot remove unknown ${operation.entityType} '${operation.id}'`,
        },
      };
    }

    if (targetRange && enforceTargetRange && !rangeIsWithin(entity, targetRange)) {
      return {
        ok: false,
        error: {
          code: "invalid_range",
          message: `Remove operation ${index} target must be within targetRange`,
        },
      };
    }

    removeEntity(project, operation);
  }

  let aiEdit: AIEdit | undefined;
  if (mode === "accept") {
    aiEdit = {
      id: options.editId ?? nextId("ai_edit"),
      createdAt: now,
      prompt: proposal.prompt.trim(),
      targetRange,
      operations,
      status: "accepted",
    };
    project.updatedAt = now;
    project.aiEditHistory = [...project.aiEditHistory, aiEdit];
  }

  const parsedResult = DemoProjectSchema.safeParse(project);
  if (!parsedResult.success) {
    return {
      ok: false,
      error: {
        code: "invalid_result",
        message: "Resulting DemoProject validation failed",
        issues: formatIssues(parsedResult.error),
      },
    };
  }

  return { ok: true, project: parsedResult.data, aiEdit };
}
