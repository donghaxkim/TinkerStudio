/**
 * Minimal shape we read from a GSAP master timeline, decoupled from the `gsap`
 * package. A real `gsap.core.Timeline` satisfies this structurally.
 */
export interface GsapTimelineLike {
  totalDuration(): number;
  labels: Record<string, number>;
  getChildren(
    nested?: boolean,
    tweens?: boolean,
    timelines?: boolean,
    ignoreBeforeTime?: number,
  ): GsapChildLike[];
}

/** A top-level child of the master timeline (a nested scene timeline = a "clip"). */
export interface GsapChildLike {
  startTime(): number;
  totalDuration(): number;
  vars?: { id?: unknown };
}

export type CompositionClip = {
  id: string;
  label?: string;
  start: number;
  end: number;
};

export type CompositionTimelineLabel = {
  name: string;
  time: number;
};

export type CompositionTimelineModel = {
  durationSeconds: number;
  clips: CompositionClip[];
  labels: CompositionTimelineLabel[];
};

function clampDuration(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Round to microsecond precision to avoid float drift (e.g. 4.2 + 3.6 → 7.8, not 7.800000000000001). */
function roundMicros(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function readClipIdentity(child: GsapChildLike, index: number): { id: string; label?: string } {
  const rawId = child.vars?.id;
  if (typeof rawId === "string" && rawId.trim().length > 0) {
    return { id: rawId, label: rawId };
  }
  return { id: `clip-${index}` };
}

/**
 * Read a generated composition's GSAP master timeline into a structured model.
 * Clips are the top-level nested scene timelines (`getChildren(false, false, true)`);
 * a flat composition yields zero clips (the UI then offers range-only selection).
 */
export function readCompositionTimeline(timeline: GsapTimelineLike): CompositionTimelineModel {
  const clips: CompositionClip[] = timeline
    .getChildren(false, false, true)
    .map((child, index) => {
      const { id, label } = readClipIdentity(child, index);
      const start = roundMicros(child.startTime());
      const end = roundMicros(start + clampDuration(child.totalDuration()));
      return { id, label, start, end };
    });

  // A GSAP master reports totalDuration() === 0 when its children were created
  // paused and it has not ticked yet (e.g. a composition just read from an iframe).
  // Fall back to the furthest clip end — the real content length. Labels are time
  // markers, not content, so they never extend the duration.
  const contentEnd = clips.reduce((max, clip) => Math.max(max, clip.end), 0);
  const durationSeconds = roundMicros(Math.max(clampDuration(timeline.totalDuration()), contentEnd));

  const labels: CompositionTimelineLabel[] = Object.entries(timeline.labels)
    .map(([name, time]) => ({ name, time: roundMicros(time) }))
    .sort((a, b) => a.time - b.time);

  return { durationSeconds, clips, labels };
}

/**
 * Derive scene clips from a generated composition's DOM, for compositions whose GSAP
 * master is a *flat* timeline (every scene is a tween, so `getChildren(…, timelines)`
 * yields nothing). The pipeline already emits one `<section class="scene clip" id
 * data-start data-duration>` per scene, so the segmentation exists in markup even when
 * it isn't expressed as nested timelines. Used as a fallback by the preview so every
 * generated demo shows its scenes on the timeline.
 *
 * @param compositionId Restrict to the `[data-composition-id]` root with this id; when
 *   omitted, the sole composition root (or the whole document) is scanned.
 */
export function readSceneClipsFromDocument(doc: Document, compositionId?: string): CompositionClip[] {
  const root =
    compositionId !== undefined
      ? doc.querySelector(`[data-composition-id="${CSS.escape(compositionId)}"]`)
      : doc.querySelector("[data-composition-id]") ?? doc.body ?? doc.documentElement;
  if (!root) return [];

  const sections = Array.from(root.querySelectorAll<HTMLElement>(".scene[data-start]"));
  const clips: CompositionClip[] = [];
  sections.forEach((el, index) => {
    const start = Number.parseFloat(el.getAttribute("data-start") ?? "");
    if (!Number.isFinite(start)) return;
    const duration = clampDuration(Number.parseFloat(el.getAttribute("data-duration") ?? ""));
    const id = el.id.trim().length > 0 ? el.id : `clip-${index}`;
    const dataLabel = el.getAttribute("data-label")?.trim();
    const label = dataLabel && dataLabel.length > 0 ? dataLabel : `Scene ${index + 1}`;
    clips.push({ id, label, start: roundMicros(start), end: roundMicros(start + duration) });
  });

  return clips.sort((a, b) => a.start - b.start);
}
