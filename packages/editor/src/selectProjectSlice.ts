import type { Clip, CursorEvent, DemoProject, ZoomKeyframe } from "@tinker/project-schema";
import { DemoProjectSchema } from "@tinker/project-schema";
import type { SelectedRange } from "./state/editorState.js";
import { normalizeSelectedRange } from "./state/editorState.js";

export type ProjectSliceClip = Clip & {
  trackId: string;
  trackName: string;
  trackType: string;
};

export type ProjectSlice = {
  projectId: string;
  title: string;
  duration: number;
  fps: number;
  aspectRatio: DemoProject["aspectRatio"];
  targetRange: SelectedRange;
  clips: ProjectSliceClip[];
  zooms: ZoomKeyframe[];
  cursorEvents: CursorEvent[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function rangesOverlap(item: { start: number; end: number }, range: SelectedRange) {
  if (range.end <= range.start) return false;
  return item.start < range.end && item.end > range.start;
}

function timeWithinRange(time: number, range: SelectedRange) {
  if (range.end <= range.start) return false;
  return time >= range.start && time <= range.end;
}

export function normalizeProjectSliceRange(range: SelectedRange, duration: number): SelectedRange {
  const ordered = normalizeSelectedRange(range);
  const start = clamp(Number.isFinite(ordered.start) ? ordered.start : 0, 0, duration);
  const end = clamp(Number.isFinite(ordered.end) ? ordered.end : start, 0, duration);
  return start <= end ? { start, end } : { start: end, end: start };
}

export function selectProjectSlice(project: DemoProject, selectedRange: SelectedRange): ProjectSlice {
  const parsedProject = DemoProjectSchema.parse(project);
  const targetRange = normalizeProjectSliceRange(selectedRange, parsedProject.duration);

  const clips = parsedProject.tracks.flatMap((track) =>
    track.clips
      .filter((clip) => rangesOverlap(clip, targetRange))
      .map((clip) => ({
        ...clip,
        trackId: track.id,
        trackName: track.name,
        trackType: track.type,
      })),
  );

  return {
    projectId: parsedProject.id,
    title: parsedProject.title,
    duration: parsedProject.duration,
    fps: parsedProject.fps,
    aspectRatio: parsedProject.aspectRatio,
    targetRange,
    clips,
    zooms: parsedProject.zooms.filter((zoom) => rangesOverlap(zoom, targetRange)),
    cursorEvents: parsedProject.cursorEvents.filter((event) => timeWithinRange(event.time, targetRange)),
  };
}
