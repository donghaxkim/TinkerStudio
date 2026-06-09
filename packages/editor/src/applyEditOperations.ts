import {
  AIEditOperationSchema,
  DemoProjectSchema,
  type AIEditOperation,
  type AutoZoom,
  type Clip,
  type CursorEvent,
  type DemoProject,
  type ManualZoom,
  type Rect,
  type Track,
  type ZoomKeyframePoint,
  type ZoomRegion,
} from "@tinker/project-schema";

export type ApplyEditOperationsOptions = {
  mode?: "preview" | "accept";
  prompt?: string;
  now?: string;
};

export type ApplyEditOperationsResult =
  | { ok: true; project: DemoProject }
  | { ok: false; errors: string[] };

type TimelineRange = { start: number; end: number };

const DEFAULT_EASING = "easeInOut";
const AUTO_ZOOM_TARGET_WIDTH = 520;
const AUTO_ZOOM_TARGET_HEIGHT = 320;

export function applyEditOperations(
  project: DemoProject,
  operations: AIEditOperation[],
  options: ApplyEditOperationsOptions = {},
): ApplyEditOperationsResult {
  const input = DemoProjectSchema.safeParse(project);

  if (!input.success) {
    return { ok: false, errors: input.error.issues.map((issue) => issue.message) };
  }

  let nextProject = cloneProject(input.data);
  const appliedOperations: DemoProject["aiEditHistory"][number]["operations"] = [];

  for (const operation of operations) {
    const operationResult = AIEditOperationSchema.safeParse(operation);

    if (!operationResult.success) {
      return { ok: false, errors: operationResult.error.issues.map((issue) => issue.message) };
    }

    const rangeError =
      "start" in operationResult.data
        ? validateRange(operationResult.data, nextProject.duration)
        : undefined;

    if (rangeError) {
      return { ok: false, errors: [rangeError] };
    }

    const result = applyOneOperation(nextProject, operationResult.data);

    if (!result.ok) {
      return result;
    }

    appliedOperations.push(operationResult.data);
    nextProject = result.project;
  }

  if (options.mode === "accept" && operations.length > 0) {
    const now = options.now ?? new Date().toISOString();

    nextProject = {
      ...nextProject,
      updatedAt: now,
      aiEditHistory: [
        ...nextProject.aiEditHistory,
        {
          id: nextId("ai_edit", nextProject.aiEditHistory),
          createdAt: now,
          prompt: options.prompt ?? "Applied editor operations",
          operations: appliedOperations,
          status: "accepted",
        },
      ],
    };
  }

  const output = DemoProjectSchema.safeParse(nextProject);

  if (!output.success) {
    return { ok: false, errors: output.error.issues.map((issue) => issue.message) };
  }

  return { ok: true, project: output.data };
}

function applyOneOperation(
  project: DemoProject,
  operation: AIEditOperation,
): ApplyEditOperationsResult {
  switch (operation.type) {
    case "auto_zoom":
      return applyAutoZoom(project, operation);
    case "add_zoom":
      return applyManualZoom(project, operation);
    case "trim":
      return { ok: true, project: trimRange(project, operation) };
    case "speed":
      return { ok: true, project: speedRange(project, operation, operation.speed) };
    case "remove_zoom":
      return removeZoom(project, operation.id);
    case "remove_clip":
      return removeClip(project, operation.id);
  }
}

function applyManualZoom(
  project: DemoProject,
  operation: Extract<AIEditOperation, { type: "add_zoom" }>,
): ApplyEditOperationsResult {
  const zoom: ManualZoom = {
    id: nextId("zoom_manual", project.zooms),
    mode: "manual",
    start: operation.start,
    end: operation.end,
    target: operation.target,
    scale: operation.scale,
    easing: operation.easing ?? DEFAULT_EASING,
  };

  return { ok: true, project: { ...project, zooms: [...project.zooms, zoom] } };
}

function applyAutoZoom(
  project: DemoProject,
  operation: Extract<AIEditOperation, { type: "auto_zoom" }>,
): ApplyEditOperationsResult {
  const cursorEvents = project.cursorEvents.filter(
    (event) => event.time >= operation.start && event.time < operation.end,
  );

  if (cursorEvents.length === 0) {
    return { ok: false, errors: ["auto_zoom requires cursor events within [start, end)"] };
  }

  const keyframes = cursorEvents.map((event) => ({
    time: event.time,
    target: targetFromCursorEvent(project, event),
  }));

  const zoom: AutoZoom = {
    id: nextId("zoom_auto", project.zooms),
    mode: "auto",
    start: operation.start,
    end: operation.end,
    scale: operation.scale,
    easing: DEFAULT_EASING,
    keyframes: compactKeyframes(keyframes),
  };

  return { ok: true, project: { ...project, zooms: [...project.zooms, zoom] } };
}

function trimRange(project: DemoProject, range: TimelineRange): DemoProject {
  const delta = range.end - range.start;

  return {
    ...project,
    duration: roundTime(project.duration - delta),
    tracks: project.tracks.map((track) => ({
      ...track,
      clips: track.clips.flatMap((clip) => trimClip(clip, range, delta)),
    })),
    zooms: project.zooms.flatMap((zoom) => trimZoom(zoom, range, delta)),
    cursorEvents: project.cursorEvents.flatMap((event) => trimCursorEvent(event, range, delta)),
  };
}

function speedRange(project: DemoProject, range: TimelineRange, speed: number): DemoProject {
  const originalDuration = range.end - range.start;
  const newTimelineDuration = originalDuration / speed;
  const delta = newTimelineDuration - originalDuration;
  const shiftStart = range.end;

  return {
    ...project,
    duration: roundTime(project.duration + delta),
    tracks: project.tracks.map((track) => ({
      ...track,
      clips: track.clips.flatMap((clip) => speedClip(clip, range, speed, delta)),
    })),
    zooms: project.zooms.map((zoom) => speedZoom(zoom, range, delta, shiftStart)),
    cursorEvents: project.cursorEvents.map((event) => speedCursorEvent(event, range, delta)),
  };
}

function removeZoom(project: DemoProject, id: string): ApplyEditOperationsResult {
  if (!project.zooms.some((zoom) => zoom.id === id)) {
    return { ok: false, errors: [`unknown zoom '${id}'`] };
  }

  return { ok: true, project: { ...project, zooms: project.zooms.filter((zoom) => zoom.id !== id) } };
}

function removeClip(project: DemoProject, id: string): ApplyEditOperationsResult {
  const hasClip = project.tracks.some((track) => track.clips.some((clip) => clip.id === id));

  if (!hasClip) {
    return { ok: false, errors: [`unknown clip '${id}'`] };
  }

  return {
    ok: true,
    project: {
      ...project,
      tracks: project.tracks.map((track) => ({
        ...track,
        clips: track.clips.filter((clip) => clip.id !== id),
      })),
    },
  };
}

function trimClip(clip: Clip, range: TimelineRange, delta: number): Clip[] {
  if (clip.end <= range.start) {
    return [clip];
  }

  if (clip.start >= range.end) {
    return [shiftClip(clip, -delta)];
  }

  const clips: Clip[] = [];

  if (clip.start < range.start) {
    const beforeEnd = range.start;
    clips.push({
      ...clip,
      id: `${clip.id}_before_trim`,
      end: roundTime(beforeEnd),
      sourceEnd: sourceAt(clip, beforeEnd),
    });
  }

  if (clip.end > range.end) {
    const afterStart = range.start;
    const afterEnd = clip.end - delta;
    clips.push({
      ...clip,
      id: `${clip.id}_after_trim`,
      start: roundTime(afterStart),
      end: roundTime(afterEnd),
      sourceStart: sourceAt(clip, range.end),
    });
  }

  return clips.filter((nextClip) => nextClip.end > nextClip.start);
}

function speedClip(clip: Clip, range: TimelineRange, speed: number, delta: number): Clip[] {
  if (clip.end <= range.start) {
    return [clip];
  }

  if (clip.start >= range.end) {
    return [shiftClip(clip, delta)];
  }

  const clips: Clip[] = [];
  const overlapStart = Math.max(clip.start, range.start);
  const overlapEnd = Math.min(clip.end, range.end);
  const overlapTimelineDuration = overlapEnd - overlapStart;
  const spedTimelineDuration = overlapTimelineDuration / speed;

  if (clip.start < overlapStart) {
    clips.push({
      ...clip,
      id: `${clip.id}_before_speed`,
      end: roundTime(overlapStart),
      sourceEnd: sourceAt(clip, overlapStart),
    });
  }

  clips.push({
    ...clip,
    id: `${clip.id}_speed_${formatIdNumber(speed)}`,
    start: roundTime(overlapStart),
    end: roundTime(overlapStart + spedTimelineDuration),
    sourceStart: sourceAt(clip, overlapStart),
    sourceEnd: sourceAt(clip, overlapEnd),
    playbackRate: speed,
  });

  if (clip.end > overlapEnd) {
    const afterDelta = spedTimelineDuration - overlapTimelineDuration;
    clips.push({
      ...clip,
      id: `${clip.id}_after_speed`,
      start: roundTime(overlapStart + spedTimelineDuration),
      end: roundTime(clip.end + afterDelta),
      sourceStart: sourceAt(clip, overlapEnd),
    });
  }

  return clips.filter((nextClip) => nextClip.end > nextClip.start);
}

function trimZoom(zoom: ZoomRegion, range: TimelineRange, delta: number): ZoomRegion[] {
  if (zoom.end <= range.start) {
    return [zoom];
  }

  if (zoom.start >= range.end) {
    return [shiftZoom(zoom, -delta)];
  }

  if (zoom.start >= range.start && zoom.end <= range.end) {
    return [];
  }

  const start = zoom.start < range.start ? zoom.start : range.start;
  const end = zoom.end > range.end ? zoom.end - delta : range.start;

  if (end <= start) {
    return [];
  }

  const nextZoom = { ...zoom, start: roundTime(start), end: roundTime(end) };

  if (nextZoom.mode === "auto") {
    return [
      {
        ...nextZoom,
        keyframes: nextZoom.keyframes
          .filter((keyframe) => keyframe.time < range.start || keyframe.time >= range.end)
          .map((keyframe) =>
            keyframe.time >= range.end
              ? { ...keyframe, time: roundTime(keyframe.time - delta) }
              : keyframe,
          ),
      },
    ].filter((autoZoom) => autoZoom.keyframes.length > 0);
  }

  return [nextZoom];
}

function trimCursorEvent(event: CursorEvent, range: TimelineRange, delta: number): CursorEvent[] {
  if (event.time >= range.start && event.time < range.end) {
    return [];
  }

  if (event.time >= range.end) {
    return [{ ...event, time: roundTime(event.time - delta) }];
  }

  return [event];
}

function speedZoom(
  zoom: ZoomRegion,
  range: TimelineRange,
  delta: number,
  shiftStart: number,
): ZoomRegion {
  const shifted = {
    ...zoom,
    start: shiftTimeForSpeed(zoom.start, range, delta, shiftStart),
    end: shiftTimeForSpeed(zoom.end, range, delta, shiftStart),
  };

  if (shifted.mode === "auto") {
    return {
      ...shifted,
      keyframes: shifted.keyframes.map((keyframe) => ({
        ...keyframe,
        time: shiftTimeForSpeed(keyframe.time, range, delta, shiftStart),
      })),
    };
  }

  return shifted;
}

function speedCursorEvent(event: CursorEvent, range: TimelineRange, delta: number): CursorEvent {
  return { ...event, time: shiftTimeForSpeed(event.time, range, delta, range.end) };
}

function shiftTimeForSpeed(
  time: number,
  range: TimelineRange,
  delta: number,
  shiftStart: number,
): number {
  if (time >= shiftStart) {
    return roundTime(time + delta);
  }

  if (time > range.start && time < range.end) {
    const rate = (range.end - range.start + delta) / (range.end - range.start);
    return roundTime(range.start + (time - range.start) * rate);
  }

  return roundTime(time);
}

function shiftClip(clip: Clip, delta: number): Clip {
  return { ...clip, start: roundTime(clip.start + delta), end: roundTime(clip.end + delta) };
}

function shiftZoom(zoom: ZoomRegion, delta: number): ZoomRegion {
  const shifted = {
    ...zoom,
    start: roundTime(zoom.start + delta),
    end: roundTime(zoom.end + delta),
  };

  if (shifted.mode === "auto") {
    return {
      ...shifted,
      keyframes: shifted.keyframes.map((keyframe) => ({
        ...keyframe,
        time: roundTime(keyframe.time + delta),
      })),
    };
  }

  return shifted;
}

function targetFromCursorEvent(project: DemoProject, event: CursorEvent): Rect {
  const videoAsset = project.assets.find((asset) => asset.type === "video");
  const width = videoAsset?.width ?? 1920;
  const height = videoAsset?.height ?? 1080;
  const targetWidth = Math.min(AUTO_ZOOM_TARGET_WIDTH, width);
  const targetHeight = Math.min(AUTO_ZOOM_TARGET_HEIGHT, height);

  return {
    x: roundTime(clamp(event.x - targetWidth / 2, 0, Math.max(0, width - targetWidth))),
    y: roundTime(clamp(event.y - targetHeight / 2, 0, Math.max(0, height - targetHeight))),
    width: targetWidth,
    height: targetHeight,
  };
}

function compactKeyframes(keyframes: ZoomKeyframePoint[]): ZoomKeyframePoint[] {
  const seen = new Set<string>();

  return keyframes.filter((keyframe) => {
    const key = `${keyframe.time}:${keyframe.target.x}:${keyframe.target.y}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function sourceAt(clip: Clip, timelineTime: number): number {
  return roundTime(clip.sourceStart + (timelineTime - clip.start) * clip.playbackRate);
}

function validateRange(range: TimelineRange, duration: number): string | undefined {
  if (range.start < 0 || range.end <= range.start || range.end > duration) {
    return "operation range must satisfy 0 <= start < end <= project.duration";
  }

  return undefined;
}

function nextId(prefix: string, items: Array<{ id: string }>): string {
  let index = 1;
  const existing = new Set(items.map((item) => item.id));

  while (existing.has(`${prefix}_${String(index).padStart(3, "0")}`)) {
    index += 1;
  }

  return `${prefix}_${String(index).padStart(3, "0")}`;
}

function cloneProject(project: DemoProject): DemoProject {
  return JSON.parse(JSON.stringify(project)) as DemoProject;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTime(value: number): number {
  return Number(value.toFixed(6));
}

function formatIdNumber(value: number): string {
  return String(value).replace(".", "_");
}
