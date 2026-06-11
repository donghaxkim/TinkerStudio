import type { DemoProject, ZoomKeyframe } from "@tinker/project-schema";
import { suggestAutoZooms, type MotionFrame } from "@tinker/motion";
import type { EditorCommand } from "./editorHistory.js";
import {
  applyManualEditOperation,
  type ApplyManualEditOperationOptions,
  type ManualEditOperationsError,
} from "./manualEditOperations.js";
import { getActiveClip, getPrimaryClip } from "./project/assetResolver.js";

export type AutoZoomSuggestionState = {
  suggestions: ZoomKeyframe[];
  previewProject: DemoProject;
  frame: MotionFrame;
};

export type AcceptAutoZoomSuggestionsResult =
  | { ok: true; project: DemoProject; command: EditorCommand }
  | { ok: false; error: ManualEditOperationsError };

const FALLBACK_FRAMES: Record<DemoProject["aspectRatio"], MotionFrame> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
};

export function buildAutoZoomSuggestionState(project: DemoProject): AutoZoomSuggestionState {
  const frame = inferAutoZoomSuggestionFrame(project);
  const suggestions = suggestAutoZooms(project.cursorEvents, project.zooms, {
    duration: project.duration,
    frame,
    frameAtTime: (time) => inferAutoZoomSuggestionFrame(project, time),
  });

  return {
    suggestions,
    previewProject: suggestions.length > 0
      ? {
          ...project,
          zooms: [...project.zooms, ...suggestions],
        }
      : project,
    frame,
  };
}

export function acceptAutoZoomSuggestions(
  project: DemoProject,
  suggestions: readonly ZoomKeyframe[],
  options: Pick<ApplyManualEditOperationOptions, "now" | "commandId"> = {},
): AcceptAutoZoomSuggestionsResult {
  if (suggestions.length === 0) {
    return {
      ok: false,
      error: {
        code: "invalid_range",
        message: "No auto-zoom suggestions to accept",
      },
    };
  }

  const beforeProject = project;
  let currentProject = project;

  for (const suggestion of suggestions) {
    const result = applyManualEditOperation(
      currentProject,
      {
        type: "upsert_zoom",
        id: suggestion.id,
        createIfMissing: true,
        start: suggestion.start,
        end: suggestion.end,
        target: suggestion.target,
        easing: suggestion.easing,
      },
      { now: options.now },
    );

    if (!result.ok) {
      return result;
    }

    currentProject = result.project;
  }

  return {
    ok: true,
    project: currentProject,
    command: {
      type: "manual-edit",
      id: options.commandId ?? `auto_zoom_accept_${Date.now()}`,
      label: "Accept auto zoom suggestions",
      beforeProject,
      afterProject: currentProject,
    },
  };
}

export function inferAutoZoomSuggestionFrame(project: DemoProject, time?: number): MotionFrame {
  const asset = (time === undefined ? getPrimaryClip(project) : getActiveClip(project, time))?.asset;

  if (isPositiveFinite(asset?.width) && isPositiveFinite(asset?.height)) {
    return { width: asset.width, height: asset.height };
  }

  return FALLBACK_FRAMES[project.aspectRatio];
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
