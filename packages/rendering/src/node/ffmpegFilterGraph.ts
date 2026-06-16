import { resolveCursorSettings, type DemoProject } from "@tinker/project-schema";
import {
  type CameraTransform,
  type NormalizedCursorPoint,
  normalizeCursorTelemetry,
  normalizeZoomRegions,
  resolveDeterministicCameraTransform,
  smoothCursorTelemetry,
} from "@tinker/motion";
import type { FinalRenderPlan } from "../renderFinal.js";
import type { NodeAssetFileResolution } from "./assetResolution.js";
import type { CursorImage } from "./cursorPng.js";

export type FfmpegInput = {
  assetId: string;
  path: string;
  clipId: string;
};

export type FfmpegFilterGraph = {
  inputs: FfmpegInput[];
  filterComplex: string;
  outputLabel: string;
};

type ResolvedAsset = Extract<NodeAssetFileResolution, { ok: true }>;
type CameraInterval = {
  start: number;
  end: number;
  transform: CameraTransform;
};
type SourceToOutputPlacement = {
  width: number;
  height: number;
  padX: number;
  padY: number;
};
type CursorOverlayPoint = {
  time: number;
  x: number;
  y: number;
};
type CursorOverlaySegment = {
  start: number;
  end: number;
  x: string;
  y: string;
};
type FfmpegFilterGraphOptions = {
  cursorImage?: CursorImage;
};

const MIN_INTERVAL_SECONDS = 0.000001;
const FRAME_TIME_QUANTIZATION_SECONDS = 0.000001;

export function buildRealMediaFilterGraph(
  project: DemoProject,
  plan: FinalRenderPlan,
  resolutions: readonly NodeAssetFileResolution[],
  options: FfmpegFilterGraphOptions = {},
): FfmpegFilterGraph {
  const pathByAssetId = new Map(
    resolutions
      .filter((resolution): resolution is ResolvedAsset => resolution.ok)
      .map((resolution) => [resolution.assetId, resolution.path]),
  );
  const clips = project.tracks
    .filter((track) => track.type === "video")
    .flatMap((track) => track.clips.map((clip) => ({ track, clip })))
    .sort((left, right) => {
      if (left.clip.start !== right.clip.start) return left.clip.start - right.clip.start;
      return left.clip.id.localeCompare(right.clip.id);
    });
  const inputs = clips.map(({ clip }) => ({
    assetId: clip.assetId,
    path: pathByAssetId.get(clip.assetId) ?? "",
    clipId: clip.id,
  }));
  const filters = [
    `color=c=#000000:s=${plan.output.width}x${plan.output.height}:r=${plan.timeline.fps}:d=${ffmpegNumber(plan.timeline.duration)}[base]`,
  ];
  let composedLabel = "base";

  clips.forEach(({ clip }, index) => {
    const clipLabel = `clip${index}`;
    const nextLabel = `media${index}`;
    const clipDuration = clip.end - clip.start;
    const sourceEnd = clip.sourceEnd ?? clip.sourceStart + clipDuration;

    filters.push(
      [
        `[${index}:v]trim=start=${ffmpegNumber(clip.sourceStart)}:end=${ffmpegNumber(sourceEnd)}`,
        "setpts=PTS-STARTPTS+" + `${ffmpegNumber(clip.start)}/TB`,
        `scale=${plan.output.width}:${plan.output.height}:force_original_aspect_ratio=decrease`,
        `pad=${plan.output.width}:${plan.output.height}:(ow-iw)/2:(oh-ih)/2`,
        `setsar=1[${clipLabel}]`,
      ].join(","),
    );
    filters.push(
      `[${composedLabel}][${clipLabel}]overlay=0:0:enable='${enableBetween(clip.start, clip.end)}'[${nextLabel}]`,
    );
    composedLabel = nextLabel;
  });

  const cursorLabel = appendCursorFilters(filters, composedLabel, project, plan, options.cursorImage);
  const cameraLabel = appendCameraFilters(filters, cursorLabel, project, plan);
  filters.push(`[${cameraLabel}]format=yuv420p[vout]`);

  return {
    inputs,
    filterComplex: filters.join(";"),
    outputLabel: "vout",
  };
}

function ffmpegNumber(value: number) {
  return Number(value.toFixed(6)).toString();
}

function enableBetween(start: number, end: number) {
  return `between(t\\,${ffmpegNumber(start)}\\,${ffmpegNumber(end)})`;
}

function appendCursorFilters(
  filters: string[],
  inputLabel: string,
  project: DemoProject,
  plan: FinalRenderPlan,
  cursorImage: CursorImage | undefined,
) {
  const cursorSettings = resolveCursorSettings(project.cursor);

  if (cursorSettings.hidden || !cursorImage) {
    return inputLabel;
  }

  const cursorPoints = normalizeCursorTelemetry(project.cursorEvents, {
    frame: plan.source,
    duration: plan.timeline.duration,
  });

  if (cursorPoints.length === 0) {
    return inputLabel;
  }

  const placement = sourceToOutputPlacement(plan);
  const emphasizeClicks = cursorSettings.clickEffect !== "none";
  const clickDisplaySeconds = cursorSettings.clickEffectDurationMs / 1000;
  const cursorSegments = buildCursorOverlaySegments(cursorPoints, placement, cursorImage, plan.timeline.duration);
  const cursorLabels = cursorSegments.map((_, index) => `cursor_icon${index}`);
  let currentLabel = inputLabel;

  if (cursorSegments.length === 0) {
    return inputLabel;
  }

  if (cursorLabels.length === 1) {
    filters.push(`movie=${ffmpegFilterPath(cursorImage.path)},format=rgba[${cursorLabels[0]}]`);
  } else {
    filters.push(`movie=${ffmpegFilterPath(cursorImage.path)},format=rgba,split=${cursorLabels.length}${cursorLabels.map((label) => `[${label}]`).join("")}`);
  }

  cursorPoints.forEach((point, index) => {
    const isEmphasizedClick = point.type === "click" && emphasizeClicks;
    const emphasisSize = cursorSettings.clickEffect === "ripple" ? 34 : 30;
    const position = mapSourcePointToOutput(point.cx, point.cy, placement);

    if (isEmphasizedClick) {
      const emphasisLabel = `cursor_emphasis${index}`;
      const clickX = Math.round(position.x - emphasisSize / 2);
      const clickY = Math.round(position.y - emphasisSize / 2);
      const clickEnd = Math.min(plan.timeline.duration, point.time + clickDisplaySeconds);
      filters.push(
        `[${currentLabel}]drawbox=x=${clickX}:y=${clickY}:w=${emphasisSize}:h=${emphasisSize}:color=#fbbf24@0.90:t=fill:enable='${enableBetween(point.time, clickEnd)}'[${emphasisLabel}]`,
      );
      currentLabel = emphasisLabel;
    }
  });

  cursorSegments.forEach((segment, index) => {
    const nextLabel = `cursor${index}`;
    filters.push(
      `[${currentLabel}][${cursorLabels[index]}]overlay=x='${segment.x}':y='${segment.y}':enable='${enableBetween(segment.start, segment.end)}'[${nextLabel}]`,
    );
    currentLabel = nextLabel;
  });

  return currentLabel;
}

function buildCursorOverlaySegments(
  cursorPoints: readonly NormalizedCursorPoint[],
  placement: SourceToOutputPlacement,
  cursorImage: CursorImage,
  duration: number,
): CursorOverlaySegment[] {
  const points = coalesceCursorOverlayPoints(cursorPoints, placement, cursorImage, duration);
  const segments: CursorOverlaySegment[] = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];

    if (right.time - left.time <= MIN_INTERVAL_SECONDS) {
      continue;
    }

    segments.push({
      start: left.time,
      end: right.time,
      x: overlayLinearExpression(left.x, right.x, left.time, right.time),
      y: overlayLinearExpression(left.y, right.y, left.time, right.time),
    });
  }

  const last = points.at(-1);
  if (last) {
    const end = cleanTime(Math.min(duration, last.time + 0.25));

    if (end - last.time > MIN_INTERVAL_SECONDS) {
      segments.push({ start: last.time, end, x: ffmpegNumber(last.x), y: ffmpegNumber(last.y) });
    }
  }

  return segments;
}

function coalesceCursorOverlayPoints(
  cursorPoints: readonly NormalizedCursorPoint[],
  placement: SourceToOutputPlacement,
  cursorImage: CursorImage,
  duration: number,
): CursorOverlayPoint[] {
  const points: CursorOverlayPoint[] = [];

  for (const point of cursorPoints) {
    const position = mapSourcePointToOutput(point.cx, point.cy, placement);
    const next = {
      time: cleanTime(clampTime(point.time, duration)),
      x: cleanTime(position.x - cursorImage.hotspotX),
      y: cleanTime(position.y - cursorImage.hotspotY),
    };
    const previous = points.at(-1);

    if (previous && Math.abs(previous.time - next.time) <= MIN_INTERVAL_SECONDS) {
      points[points.length - 1] = next;
    } else {
      points.push(next);
    }
  }

  return points;
}

function overlayLinearExpression(start: number, end: number, startTime: number, endTime: number) {
  const duration = endTime - startTime;

  if (duration <= MIN_INTERVAL_SECONDS || Math.abs(end - start) <= MIN_INTERVAL_SECONDS) {
    return ffmpegNumber(start);
  }

  return `${ffmpegNumber(start)}+(${ffmpegNumber(end - start)})*(t-${ffmpegNumber(startTime)})/${ffmpegNumber(duration)}`;
}

function ffmpegFilterPath(path: string) {
  const movieOptionValue = path.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:");

  return movieOptionValue.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/[\[\];,]/g, "\\$&");
}

function appendCameraFilters(
  filters: string[],
  inputLabel: string,
  project: DemoProject,
  plan: FinalRenderPlan,
) {
  const intervals = buildCameraIntervalsForExport(project, plan);

  if (intervals.length <= 1) {
    const outputLabel = "camera0";
    const transform = intervals[0]?.transform ?? resolveDeterministicCameraTransform([], [], 0);
    filters.push(`[${inputLabel}]${staticCameraFilter(transform, plan)}[${outputLabel}]`);
    return outputLabel;
  }

  const outputLabel = "camera0";
  const fpsLabel = "camera_fps";
  const splitLabels = intervals.map((_, index) => `camera_src${index}`);
  const segmentLabels = intervals.map((_, index) => `camera_seg${index}`);

  filters.push(`[${inputLabel}]fps=${ffmpegNumber(plan.timeline.fps)}[${fpsLabel}]`);
  filters.push(`[${fpsLabel}]split=${intervals.length}${splitLabels.map((label) => `[${label}]`).join("")}`);

  intervals.forEach((interval, index) => {
    const { startFrame, endFrame } = intervalToFrameRange(interval, plan.timeline.fps);

    filters.push(
      [
        `[${splitLabels[index]}]trim=start_frame=${startFrame}:end_frame=${endFrame}`,
        "setpts=PTS-STARTPTS",
        `${staticCameraFilter(interval.transform, plan)}[${segmentLabels[index]}]`,
      ].join(","),
    );
  });
  filters.push(
    `${segmentLabels.map((label) => `[${label}]`).join("")}concat=n=${intervals.length}:v=1:a=0,setpts=N/${ffmpegNumber(plan.timeline.fps)}/TB[${outputLabel}]`,
  );

  return outputLabel;
}

function intervalToFrameRange(interval: CameraInterval, fps: number) {
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 30;
  const startFrame = Math.max(0, timeToFrameIndex(interval.start, safeFps, "start"));
  const endFrame = Math.max(startFrame + 1, timeToFrameIndex(interval.end, safeFps, "end"));

  return { startFrame, endFrame };
}

function timeToFrameIndex(time: number, fps: number, mode: "start" | "end") {
  const frameFloat = time * fps;
  const nearestFrame = Math.round(frameFloat);
  const tolerance = fps * FRAME_TIME_QUANTIZATION_SECONDS;

  if (Math.abs(frameFloat - nearestFrame) <= tolerance) {
    return nearestFrame;
  }

  return mode === "start" ? Math.floor(frameFloat) : Math.ceil(frameFloat);
}

export function buildCameraIntervalsForExport(project: DemoProject, plan: FinalRenderPlan): CameraInterval[] {
  const duration = Math.max(0, plan.timeline.duration);
  const fps = Number.isFinite(plan.timeline.fps) && plan.timeline.fps > 0 ? plan.timeline.fps : 30;
  const frameStep = 1 / fps;
  const regions = normalizeZoomRegions(project.zooms, plan.source);
  const cursorPoints = smoothCursorTelemetry(normalizeCursorTelemetry(project.cursorEvents, {
    frame: plan.source,
    duration,
  }));
  const ordered = collectFrameBoundaries(duration, frameStep);
  const intervals: CameraInterval[] = [];

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const start = ordered[index] ?? 0;
    const end = ordered[index + 1] ?? 0;

    if (end - start <= MIN_INTERVAL_SECONDS) {
      continue;
    }

    intervals.push({
      start,
      end,
      transform: resolveDeterministicCameraTransform(regions, cursorPoints, start, {
        maxTime: duration,
        transitionSeconds: 0.2,
      }),
    });
  }

  return mergeCameraIntervals(intervals, plan);
}

function collectFrameBoundaries(duration: number, frameStep: number) {
  if (duration <= 0) {
    return [0];
  }

  const boundaries = [0];

  for (let time = frameStep; time < duration; time += frameStep) {
    boundaries.push(cleanTime(time));
  }

  boundaries.push(cleanTime(duration));
  return [...new Set(boundaries)].sort((left, right) => left - right);
}

function mergeCameraIntervals(intervals: CameraInterval[], plan: FinalRenderPlan): CameraInterval[] {
  const merged: CameraInterval[] = [];

  for (const interval of intervals) {
    const previous = merged.at(-1);

    if (
      previous &&
      Math.abs(previous.end - interval.start) <= MIN_INTERVAL_SECONDS &&
      staticCameraFilter(previous.transform, plan) === staticCameraFilter(interval.transform, plan)
    ) {
      previous.end = interval.end;
      continue;
    }

    merged.push({ ...interval });
  }

  return merged;
}

function staticCameraFilter(transform: CameraTransform, plan: FinalRenderPlan) {
  const scale = Number.isFinite(transform.scale) && transform.scale > 1 ? transform.scale : 1;
  const cropWidth = evenFloor(plan.output.width / scale);
  const cropHeight = evenFloor(plan.output.height / scale);
  const placement = sourceToOutputPlacement(plan);
  const outputFocus = mapSourcePointToOutput(transform.focus.cx, transform.focus.cy, placement);
  const focusX = clamp(outputFocus.x / plan.output.width, 0, 1);
  const focusY = clamp(outputFocus.y / plan.output.height, 0, 1);
  const cropX = evenFloorOffset(clamp(focusX * plan.output.width - cropWidth / 2, 0, plan.output.width - cropWidth));
  const cropY = evenFloorOffset(clamp(focusY * plan.output.height - cropHeight / 2, 0, plan.output.height - cropHeight));

  return [
    `crop=w=${cropWidth}:h=${cropHeight}:x=${cropX}:y=${cropY}`,
    `scale=${plan.output.width}:${plan.output.height}`,
    "setsar=1",
  ].join(",");
}

function clampTime(time: number, duration: number) {
  if (!Number.isFinite(time)) return 0;
  return clamp(time, 0, duration);
}

function cleanTime(time: number) {
  return Number(time.toFixed(6));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function sourceToOutputPlacement(plan: FinalRenderPlan): SourceToOutputPlacement {
  const sourceWidth = Number.isFinite(plan.source.width) && plan.source.width > 0 ? plan.source.width : plan.output.width;
  const sourceHeight = Number.isFinite(plan.source.height) && plan.source.height > 0 ? plan.source.height : plan.output.height;
  const scale = Math.min(plan.output.width / sourceWidth, plan.output.height / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;

  return {
    width,
    height,
    padX: (plan.output.width - width) / 2,
    padY: (plan.output.height - height) / 2,
  };
}

function mapSourcePointToOutput(cx: number, cy: number, placement: SourceToOutputPlacement) {
  return {
    x: placement.padX + clamp(cx, 0, 1) * placement.width,
    y: placement.padY + clamp(cy, 0, 1) * placement.height,
  };
}

function evenFloor(value: number) {
  const rounded = Math.floor(value);
  return Math.max(2, rounded - (rounded % 2));
}

function evenFloorOffset(value: number) {
  const rounded = Math.floor(value);
  return Math.max(0, rounded - (rounded % 2));
}
