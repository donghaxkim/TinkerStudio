import type { CompositionClip, CompositionTimelineModel } from "./compositionTimelineModel.js";

const EPSILON = 1e-6;

function roundMicros(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The clip strictly under `time` (excluding clip boundaries), or undefined. */
export function clipAt(model: CompositionTimelineModel, time: number): CompositionClip | undefined {
  return model.clips.find((clip) => time > clip.start + EPSILON && time < clip.end - EPSILON);
}

/**
 * Split the clip under `time` into two adjacent clips that meet at `time`. Both halves
 * keep the original label; their ids are suffixed so they stay unique across repeated
 * splits. Returns the same model reference (a no-op) when `time` is at a boundary or
 * outside every clip — callers use that to gate the Split control.
 */
export function splitClipAt(model: CompositionTimelineModel, time: number): CompositionTimelineModel {
  const target = clipAt(model, time);
  if (!target) return model;
  const at = roundMicros(time);
  const left: CompositionClip = { ...target, id: `${target.id}-1`, end: at };
  const right: CompositionClip = { ...target, id: `${target.id}-2`, start: at };
  const clips = model.clips.flatMap((clip) => (clip.id === target.id ? [left, right] : [clip]));
  return { ...model, clips };
}

/** Remove a clip by id. The composition duration is unchanged. No-op for an unknown id. */
export function removeClip(model: CompositionTimelineModel, clipId: string): CompositionTimelineModel {
  if (!model.clips.some((clip) => clip.id === clipId)) return model;
  return { ...model, clips: model.clips.filter((clip) => clip.id !== clipId) };
}

/** Add a named marker at `time` (clamped into the composition), kept sorted by time. */
export function addMarker(model: CompositionTimelineModel, time: number, name: string): CompositionTimelineModel {
  const at = roundMicros(clamp(time, 0, model.durationSeconds));
  const labels = [...model.labels, { name, time: at }].sort((a, b) => a.time - b.time);
  return { ...model, labels };
}

/** Smallest clip length a trim may leave behind, so an edge drag can't collapse a clip. */
const MIN_CLIP_DURATION = 0.1;

/** Which edge of a clip a trim moves. */
export type TrimEdge = "start" | "end";

/** The clip's generated source extent — its current bounds until a trim captures them. */
function sourceBounds(clip: CompositionClip): { min: number; max: number } {
  return { min: clip.sourceStart ?? clip.start, max: clip.sourceEnd ?? clip.end };
}

/**
 * Clamp a proposed trim time for `edge` to the clip's generated source extent and the
 * minimum clip length. Shared by the model edit (below) and the timeline's live drag
 * preview so the handle and the committed result never disagree.
 */
export function clampTrim(clip: CompositionClip, edge: TrimEdge, time: number): number {
  const { min, max } = sourceBounds(clip);
  return edge === "end"
    ? roundMicros(clamp(time, clip.start + MIN_CLIP_DURATION, max))
    : roundMicros(clamp(time, min, clip.end - MIN_CLIP_DURATION));
}

/**
 * Move one edge of the clip identified by `clipId` to `time`, clamped to the clip's
 * generated source extent (`clampTrim`). The first trim records that extent in
 * `sourceStart`/`sourceEnd` so a later drag can extend the edge back out — but never
 * past where the source was generated. Returns the same model reference (a no-op) when
 * the clip is unknown or the edge would not move, keeping undo history clean.
 */
export function trimClip(
  model: CompositionTimelineModel,
  clipId: string,
  edge: TrimEdge,
  time: number,
): CompositionTimelineModel {
  const target = model.clips.find((clip) => clip.id === clipId);
  if (!target) return model;
  const next = clampTrim(target, edge, time);
  const current = edge === "end" ? target.end : target.start;
  if (next === current) return model;
  const { min, max } = sourceBounds(target);
  const edited: CompositionClip = { ...target, [edge]: next, sourceStart: min, sourceEnd: max };
  return { ...model, clips: model.clips.map((clip) => (clip.id === clipId ? edited : clip)) };
}
