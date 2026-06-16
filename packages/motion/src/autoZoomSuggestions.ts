import type { CursorEvent, ZoomKeyframe } from "@tinker/project-schema";
import {
  DEFAULT_AUTO_ZOOM_DURATION_SECONDS,
  DEFAULT_DWELL_MOVE_THRESHOLD,
  DEFAULT_MAX_DWELL_SECONDS,
  DEFAULT_MIN_DWELL_SECONDS,
  DEFAULT_SUGGESTION_SPACING_SECONDS,
  detectZoomDwellCandidates,
  suggestInteractionZooms,
  type DetectZoomDwellCandidatesOptions,
  type ZoomDwellCandidate,
} from "./interactionTargets.js";
import type { MotionFrame } from "./cursorTelemetry.js";

export {
  DEFAULT_AUTO_ZOOM_DURATION_SECONDS,
  DEFAULT_DWELL_MOVE_THRESHOLD,
  DEFAULT_MAX_DWELL_SECONDS,
  DEFAULT_MIN_DWELL_SECONDS,
  DEFAULT_SUGGESTION_SPACING_SECONDS,
  detectZoomDwellCandidates,
  type DetectZoomDwellCandidatesOptions,
  type ZoomDwellCandidate,
};

export type SuggestAutoZoomsOptions = {
  duration: number;
  frame: MotionFrame;
  frameAtTime?: (time: number) => MotionFrame | undefined;
  idPrefix?: string;
  defaultDurationSeconds?: number;
  targetSize?: { width: number; height: number };
  minSpacingSeconds?: number;
  excludeExistingZooms?: boolean;
  easing?: ZoomKeyframe["easing"];
} & DetectZoomDwellCandidatesOptions;

export function suggestAutoZooms(
  cursorEvents: readonly CursorEvent[],
  existingZooms: readonly ZoomKeyframe[],
  options: SuggestAutoZoomsOptions,
): ZoomKeyframe[] {
  return suggestInteractionZooms(cursorEvents, existingZooms, options);
}
