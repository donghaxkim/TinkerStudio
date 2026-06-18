// Apply an Edit Decision List to a DemoProject (Director Mode, first pass)
//
// Turns the dead-time decisions in `edit-decision-list.json` into an EDITABLE change on
// the project: the single recording clip is split into kept segments (the dead gaps are
// removed down to the EDL's compressed length), zoom keyframes are remapped into the new
// compressed timeline, and the project duration shrinks. The result is a normal DemoProject
// — every resulting clip is an ordinary trimmable clip and every zoom is still an editable
// unit — so `renderFinalToMp4` renders the tighter video and the editor can refine it.
//
// Pure and deterministic. A project that does not match the simple single-video-clip shape
// (or an EDL with no cuts) is returned unchanged, so this never corrupts an unexpected
// project.

import type { DemoProject } from "@tinker/project-schema";
import type { EditDecisionList } from "./editDecisionList.js";

type Interval = { start: number; end: number };

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Source-time intervals to REMOVE, keeping the EDL's `compressedGapSeconds` slice adjacent
 * to a real action: for a lead-in or interior gap we keep the tail of the gap (next to the
 * upcoming action); for trailing dead time we keep the head (next to the last action).
 */
function removedIntervals(edl: EditDecisionList, sourceEnd: number): Interval[] {
  const raw: Interval[] = [];
  for (const cut of edl.cuts) {
    const from = Math.max(0, cut.fromTime);
    const to = Math.min(sourceEnd, cut.toTime);
    if (to - from <= cut.compressedGapSeconds) {
      continue;
    }
    if (cut.kind === "trim-tail") {
      raw.push({ start: from + cut.compressedGapSeconds, end: to });
    } else {
      raw.push({ start: from, end: to - cut.compressedGapSeconds });
    }
  }

  // Merge overlaps so the kept complement is clean.
  raw.sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of raw) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

/** Kept source intervals = [0, sourceEnd] minus the removed intervals. */
function keptIntervals(removed: Interval[], sourceStart: number, sourceEnd: number): Interval[] {
  const kept: Interval[] = [];
  let cursor = sourceStart;
  for (const gap of removed) {
    if (gap.start > cursor) {
      kept.push({ start: cursor, end: gap.start });
    }
    cursor = Math.max(cursor, gap.end);
  }
  if (cursor < sourceEnd) {
    kept.push({ start: cursor, end: sourceEnd });
  }
  return kept.filter((interval) => interval.end - interval.start > 1e-3);
}

/** Removed source time strictly before `t` (used to shift kept content / zooms earlier). */
function removedBefore(removed: Interval[], t: number): number {
  let total = 0;
  for (const gap of removed) {
    if (gap.end <= t) {
      total += gap.end - gap.start;
    } else if (gap.start < t) {
      total += t - gap.start;
    }
  }
  return total;
}

function inRemoved(removed: Interval[], t: number): boolean {
  return removed.some((gap) => t >= gap.start && t < gap.end);
}

export function applyEditDecisionList(project: DemoProject, edl: EditDecisionList): DemoProject {
  if (edl.cuts.length === 0) {
    return project;
  }

  // Only the simple single-video-clip Playwright shape is supported; bail safely otherwise.
  const track = project.tracks[0];
  if (project.tracks.length !== 1 || track === undefined || track.clips.length !== 1) {
    return project;
  }
  const clip = track.clips[0];
  const sourceStart = clip.sourceStart ?? 0;
  const sourceEnd = clip.sourceEnd ?? clip.end;

  const removed = removedIntervals(edl, sourceEnd).filter((gap) => gap.end > sourceStart && gap.start < sourceEnd);
  if (removed.length === 0) {
    return project;
  }

  const kept = keptIntervals(removed, sourceStart, sourceEnd);
  if (kept.length === 0) {
    return project;
  }

  // One editable clip per kept segment, laid end to end on the timeline.
  let timelineCursor = 0;
  const clips = kept.map((interval, index) => {
    const length = round(interval.end - interval.start);
    const start = round(timelineCursor);
    timelineCursor += length;
    return {
      ...clip,
      id: kept.length === 1 ? clip.id : `${clip.id}-seg-${index + 1}`,
      start,
      end: round(timelineCursor),
      sourceStart: round(interval.start),
      sourceEnd: round(interval.end),
    };
  });
  const newDuration = round(timelineCursor);

  // Remap zoom keyframes into the compressed timeline; drop any that sit in removed time.
  const zooms = project.zooms
    .filter((zoom) => !(inRemoved(removed, zoom.start) && inRemoved(removed, zoom.end)))
    .map((zoom) => {
      const start = round(Math.max(0, zoom.start - removedBefore(removed, zoom.start)));
      const end = round(Math.max(start + 0.05, zoom.end - removedBefore(removed, zoom.end)));
      return { ...zoom, start, end: Math.min(end, newDuration) };
    })
    .filter((zoom) => zoom.end > zoom.start);

  // Remap cursor-event timings too, so any future overlay stays in sync after trimming.
  const cursorEvents = project.cursorEvents
    .filter((event) => !inRemoved(removed, event.time))
    .map((event) => ({ ...event, time: round(Math.max(0, event.time - removedBefore(removed, event.time))) }));

  return {
    ...project,
    duration: newDuration,
    tracks: [{ ...track, clips }, ...project.tracks.slice(1)],
    zooms,
    cursorEvents,
  };
}
