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
  const durationSeconds = clampDuration(timeline.totalDuration());

  const clips: CompositionClip[] = timeline
    .getChildren(false, false, true)
    .map((child, index) => {
      const { id, label } = readClipIdentity(child, index);
      const start = child.startTime();
      const end = Math.round((start + clampDuration(child.totalDuration())) * 1e6) / 1e6;
      return { id, label, start, end };
    });

  const labels: CompositionTimelineLabel[] = Object.entries(timeline.labels)
    .map(([name, time]) => ({ name, time }))
    .sort((a, b) => a.time - b.time);

  return { durationSeconds, clips, labels };
}
