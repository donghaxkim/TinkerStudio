import {
  MAX_CLIP_SPEED,
  MAX_ZOOM_SCALE,
  MIN_CLIP_SPEED,
  MIN_ZOOM_SCALE,
  clipSpeed,
  type CompositionClip,
  type CompositionTimelineModel,
  type ZoomEasing,
  type ZoomTarget,
  type ZoomUnit,
} from "./compositionTimelineModel.js";

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

/**
 * Set the playback speed of the clip identified by `clipId`, rescaling its on-timeline length
 * inversely: the content stays anchored at `start`, and the `end` moves so a 2× clip plays in half
 * the time, a 0.5× clip in double. The 1×-baseline length is recovered from the live
 * `length × currentSpeed` (no stored base), so resetting to 1× restores the original length exactly.
 *
 * Speed is clamped to [MIN_CLIP_SPEED, MAX_CLIP_SPEED]. A slow-down that pushes the clip past the
 * composition end grows `durationSeconds` to keep it readable; a speed-up never shrinks the
 * composition (other clips / gaps remain). Returns the same model reference (a no-op) for an unknown
 * id or an unchanged speed, keeping the undo history clean.
 */
export function setClipSpeed(model: CompositionTimelineModel, clipId: string, speed: number): CompositionTimelineModel {
  const target = model.clips.find((clip) => clip.id === clipId);
  if (!target) return model;
  const nextSpeed = roundMicros(clamp(speed, MIN_CLIP_SPEED, MAX_CLIP_SPEED));
  const currentSpeed = clipSpeed(target);
  if (nextSpeed === currentSpeed) return model;
  const baseLength = (target.end - target.start) * currentSpeed; // length at 1× (lazily recovered)
  const end = roundMicros(target.start + baseLength / nextSpeed);
  const edited: CompositionClip = { ...target, speed: nextSpeed, end };
  return {
    ...model,
    durationSeconds: Math.max(model.durationSeconds, end),
    clips: model.clips.map((clip) => (clip.id === clipId ? edited : clip)),
  };
}

// --- Zoom units ----------------------------------------------------------
// Zoom units live on their own timeline track (see ZoomTrack). They are model state, so
// create/move/resize/delete ride the same undo/redo history as clip edits.

/** Smallest width a zoom unit may have — also the size a single-click create expands to. */
const MIN_ZOOM_DURATION = 0.3;

/** Add a zoom unit with id `id` spanning `[a, b]` (order-normalized, clamped, min-width). */
export function addZoom(model: CompositionTimelineModel, id: string, a: number, b: number): CompositionTimelineModel {
  const dur = model.durationSeconds;
  let start = clamp(Math.min(a, b), 0, dur);
  let end = clamp(Math.max(a, b), 0, dur);
  if (end - start < MIN_ZOOM_DURATION) {
    end = Math.min(start + MIN_ZOOM_DURATION, dur);
    start = Math.max(end - MIN_ZOOM_DURATION, 0);
  }
  const zoom: ZoomUnit = { id, start: roundMicros(start), end: roundMicros(end) };
  return { ...model, zooms: [...(model.zooms ?? []), zoom] };
}

/** Move a zoom unit to a new start, preserving its length and clamping it within the composition. */
export function moveZoom(model: CompositionTimelineModel, id: string, newStart: number): CompositionTimelineModel {
  const zooms = model.zooms ?? [];
  const target = zooms.find((z) => z.id === id);
  if (!target) return model;
  const length = target.end - target.start;
  const start = roundMicros(clamp(newStart, 0, Math.max(0, model.durationSeconds - length)));
  if (start === target.start) return model;
  const moved: ZoomUnit = { ...target, start, end: roundMicros(start + length) };
  return { ...model, zooms: zooms.map((z) => (z.id === id ? moved : z)) };
}

/** Move one edge of a zoom unit, clamped to the min width and the composition bounds. */
export function resizeZoom(
  model: CompositionTimelineModel,
  id: string,
  edge: TrimEdge,
  time: number,
): CompositionTimelineModel {
  const zooms = model.zooms ?? [];
  const target = zooms.find((z) => z.id === id);
  if (!target) return model;
  const next =
    edge === "end"
      ? roundMicros(clamp(time, target.start + MIN_ZOOM_DURATION, model.durationSeconds))
      : roundMicros(clamp(time, 0, target.end - MIN_ZOOM_DURATION));
  const current = edge === "end" ? target.end : target.start;
  if (next === current) return model;
  const resized: ZoomUnit = { ...target, [edge]: next };
  return { ...model, zooms: zooms.map((z) => (z.id === id ? resized : z)) };
}

/** Remove a zoom unit by id. No-op for an unknown id. */
export function removeZoom(model: CompositionTimelineModel, id: string): CompositionTimelineModel {
  const zooms = model.zooms ?? [];
  if (!zooms.some((z) => z.id === id)) return model;
  return { ...model, zooms: zooms.filter((z) => z.id !== id) };
}

/** A partial edit of a zoom unit's *look* (its timing rides moveZoom/resizeZoom instead). */
export type ZoomPropsPatch = Partial<{ scale: number; easing: ZoomEasing; target: ZoomTarget }>;

function sameTarget(a: ZoomTarget | undefined, b: ZoomTarget | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.x === b.x && a.y === b.y;
}

/**
 * Update a zoom unit's look properties (scale / easing / target). Only the keys present in
 * `patch` change; scale is clamped to [MIN_ZOOM_SCALE, MAX_ZOOM_SCALE] and the target into the
 * [0,1] frame. Returns the same model reference (a no-op) for an unknown id, an empty patch, or
 * when nothing actually changes — so the undo history stays clean. Used for manual property
 * edits and for "reset" (patch with the defaults).
 */
export function updateZoom(
  model: CompositionTimelineModel,
  id: string,
  patch: ZoomPropsPatch,
): CompositionTimelineModel {
  const zooms = model.zooms ?? [];
  const target = zooms.find((z) => z.id === id);
  if (!target) return model;
  const next: ZoomUnit = { ...target };
  if (patch.scale !== undefined) next.scale = roundMicros(clamp(patch.scale, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE));
  if (patch.easing !== undefined) next.easing = patch.easing;
  if (patch.target !== undefined) {
    next.target = { x: roundMicros(clamp(patch.target.x, 0, 1)), y: roundMicros(clamp(patch.target.y, 0, 1)) };
  }
  if (next.scale === target.scale && next.easing === target.easing && sameTarget(next.target, target.target)) {
    return model;
  }
  return { ...model, zooms: zooms.map((z) => (z.id === id ? next : z)) };
}
