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
