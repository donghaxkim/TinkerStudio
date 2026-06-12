import type { DemoProject } from "@tinker/project-schema";
import { DemoProjectSchema } from "@tinker/project-schema";
import type { EditorCommand } from "./editorHistory.js";
import type { SelectedRange } from "./state/editorState.js";
import { normalizeSelectedRange } from "./state/editorState.js";

type Rect = { x: number; y: number; width: number; height: number };
type ZoomEasing = "linear" | "easeIn" | "easeOut" | "easeInOut";
type EntityType = "zoom";

export type ManualEditOperation =
  | {
      type: "upsert_zoom";
      id?: string;
      createIfMissing?: boolean;
      start: number;
      end: number;
      target: Rect;
      easing?: ZoomEasing;
    }
  | {
      type: "trim_clip";
      id: string;
      start: number;
      end: number;
      sourceStart?: number;
      sourceEnd?: number;
    }
  | {
      type: "remove_entity";
      entityType: EntityType;
      id: string;
    };

export type ManualEditOperationsErrorCode =
  | "invalid_project"
  | "invalid_range"
  | "unknown_entity"
  | "invalid_result";

export type ManualEditOperationsError = {
  code: ManualEditOperationsErrorCode;
  message: string;
  issues?: string[];
};

export type ApplyManualEditOperationOptions = {
  selectedRange?: SelectedRange;
  now?: () => Date | string;
  commandId?: string;
};

export type ApplyManualEditOperationResult =
  | { ok: true; project: DemoProject; command: EditorCommand }
  | { ok: false; error: ManualEditOperationsError };

type TimedRange = { start: number; end: number };

function formatIssues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "project";
    return `${path}: ${issue.message}`;
  });
}

function toIsoString(value: Date | string) {
  return typeof value === "string" ? value : value.toISOString();
}

function validateRange(range: TimedRange, duration: number, label: string): ManualEditOperationsError | undefined {
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end)) {
    return { code: "invalid_range", message: `${label} range must use finite numbers` };
  }

  if (range.start < 0) {
    return { code: "invalid_range", message: `${label} start must be non-negative` };
  }

  if (range.end <= range.start) {
    return { code: "invalid_range", message: `${label} end must be greater than start` };
  }

  if (range.end > duration) {
    return { code: "invalid_range", message: `${label} end must be within project duration` };
  }

  return undefined;
}

function validateSourceBounds(
  project: DemoProject,
  assetId: string,
  sourceStart: number | undefined,
  sourceEnd: number | undefined,
): ManualEditOperationsError | undefined {
  // Source bounds are optional; only validate what was provided.
  if (sourceStart === undefined && sourceEnd === undefined) return undefined;

  if (sourceStart !== undefined) {
    if (!Number.isFinite(sourceStart)) {
      return { code: "invalid_range", message: "Clip sourceStart must be a finite number" };
    }
    if (sourceStart < 0) {
      return { code: "invalid_range", message: "Clip sourceStart must be non-negative" };
    }
  }

  if (sourceEnd !== undefined) {
    if (!Number.isFinite(sourceEnd)) {
      return { code: "invalid_range", message: "Clip sourceEnd must be a finite number" };
    }

    const lowerBound = sourceStart ?? 0;
    if (sourceEnd <= lowerBound) {
      return { code: "invalid_range", message: "Clip sourceEnd must be greater than sourceStart" };
    }

    const asset = project.assets.find((candidate) => candidate.id === assetId);
    if (asset?.duration !== undefined && sourceEnd > asset.duration) {
      return { code: "invalid_range", message: "Clip sourceEnd must be within the source asset duration" };
    }
  }

  return undefined;
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

function createId(project: DemoProject, prefix: string) {
  const usedIds = allEntityIds(project);
  let counter = 1;
  let id = `${prefix}_manual_${String(counter).padStart(3, "0")}`;

  while (usedIds.has(id)) {
    counter += 1;
    id = `${prefix}_manual_${String(counter).padStart(3, "0")}`;
  }

  return id;
}

function findClip(project: DemoProject, id: string) {
  for (const [trackIndex, track] of project.tracks.entries()) {
    const clipIndex = track.clips.findIndex((clip) => clip.id === id);
    if (clipIndex >= 0) return { trackIndex, clipIndex };
  }

  return undefined;
}

function removeEntity(project: DemoProject, entityType: EntityType, id: string) {
  if (entityType === "zoom") {
    if (!project.zooms.some((zoom) => zoom.id === id)) return false;
    project.zooms = project.zooms.filter((zoom) => zoom.id !== id);
    return true;
  }
}

function commandLabel(operation: ManualEditOperation) {
  if (operation.type === "upsert_zoom") return operation.id ? "Edit zoom" : "Add zoom";
  if (operation.type === "trim_clip") return "Trim clip";
  return `Remove ${operation.entityType}`;
}

export function applyManualEditOperation(
  inputProject: DemoProject,
  operation: ManualEditOperation,
  options: ApplyManualEditOperationOptions = {},
): ApplyManualEditOperationResult {
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

  const beforeProject = parsedProject.data;
  const project = structuredClone(beforeProject);
  const selectedRange = options.selectedRange ? normalizeSelectedRange(options.selectedRange) : undefined;
  const now = toIsoString((options.now ?? (() => new Date()))());

  if (operation.type !== "remove_entity") {
    const rangeError = validateRange(operation, project.duration, operation.type);
    if (rangeError) return { ok: false, error: rangeError };
  }

  if (operation.type === "upsert_zoom") {
    const index = operation.id ? project.zooms.findIndex((zoom) => zoom.id === operation.id) : -1;
    if (operation.id && index < 0 && !operation.createIfMissing) {
      return { ok: false, error: { code: "unknown_entity", message: `Cannot edit unknown zoom '${operation.id}'` } };
    }

    const existingZoom = index >= 0 ? project.zooms[index] : undefined;
    const zoom = {
      ...(existingZoom ?? { id: operation.id ?? createId(project, "zoom") }),
      start: operation.start,
      end: operation.end,
      target: operation.target,
      easing: operation.easing ?? existingZoom?.easing ?? "easeInOut",
    };
    project.zooms = index >= 0
      ? project.zooms.map((candidate, candidateIndex) => (candidateIndex === index ? zoom : candidate))
      : [...project.zooms, zoom];
  } else if (operation.type === "trim_clip") {
    const location = findClip(project, operation.id);
    if (!location) {
      return { ok: false, error: { code: "unknown_entity", message: `Cannot trim unknown clip '${operation.id}'` } };
    }

    const existingClip = project.tracks[location.trackIndex]?.clips[location.clipIndex];
    const sourceBoundsError = existingClip
      ? validateSourceBounds(project, existingClip.assetId, operation.sourceStart, operation.sourceEnd)
      : undefined;
    if (sourceBoundsError) return { ok: false, error: sourceBoundsError };

    project.tracks = project.tracks.map((track, trackIndex) =>
      trackIndex === location.trackIndex
        ? {
            ...track,
            clips: track.clips.map((clip, clipIndex) =>
              clipIndex === location.clipIndex
                ? {
                    ...clip,
                    start: operation.start,
                    end: operation.end,
                    sourceStart: operation.sourceStart ?? clip.sourceStart,
                    sourceEnd: operation.sourceEnd ?? clip.sourceEnd,
                  }
                : clip,
            ),
          }
        : track,
    );
  } else {
    const removed = removeEntity(project, operation.entityType, operation.id);
    if (!removed) {
      return {
        ok: false,
        error: {
          code: "unknown_entity",
          message: `Cannot remove unknown ${operation.entityType} '${operation.id}'`,
        },
      };
    }
  }

  if (selectedRange && operation.type !== "remove_entity") {
    const selectedRangeError = validateRange(selectedRange, project.duration, "selectedRange");
    if (selectedRangeError) return { ok: false, error: selectedRangeError };
  }

  project.updatedAt = now;

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

  const command: EditorCommand = {
    type: "manual-edit",
    id: options.commandId ?? `manual_edit_${Date.parse(now) || Date.now()}`,
    label: commandLabel(operation),
    beforeProject,
    afterProject: parsedResult.data,
  };

  return { ok: true, project: parsedResult.data, command };
}
