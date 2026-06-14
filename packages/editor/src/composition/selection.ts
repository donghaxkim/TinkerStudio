import type { CompositionClip } from "./compositionTimelineModel.js";

/** A user selection on the composition timeline: a time range or a named clip. */
export type CompositionSelection =
  | { kind: "range"; start: number; end: number }
  | { kind: "clip"; clipId: string; label?: string; start: number; end: number };

/** Build a range selection, normalizing start/end order. */
export function rangeSelection(a: number, b: number): CompositionSelection {
  return { kind: "range", start: Math.min(a, b), end: Math.max(a, b) };
}

/** Build a clip selection from a timeline clip. */
export function clipSelection(clip: CompositionClip): CompositionSelection {
  return {
    kind: "clip",
    clipId: clip.id,
    start: clip.start,
    end: clip.end,
    ...(clip.label === undefined ? {} : { label: clip.label }),
  };
}
