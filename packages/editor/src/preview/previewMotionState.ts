import type { DemoProject } from "@tinker/project-schema";
import {
  normalizeCursorTelemetry,
  normalizeZoomRegions,
  resolveDeterministicCameraTransform,
  sampleSmoothedCursor,
  smoothCursorTelemetry,
  type CameraTransform,
  type MotionFrame,
  type NormalizedCursorPoint,
} from "@tinker/motion";

export type PreviewMotionState = {
  frame: MotionFrame;
  camera: CameraTransform;
  cursor?: NormalizedCursorPoint;
  clickEvents: NormalizedCursorPoint[];
  activeZoomIds: string[];
};

const FALLBACK_FRAMES: Record<DemoProject["aspectRatio"], MotionFrame> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
};

const CAMERA_TRANSITION_SECONDS = 0.2;
const CLICK_DISPLAY_SECONDS = 0.5;

export function buildPreviewMotionState(project: DemoProject, time: number): PreviewMotionState {
  const safeTime = clampTime(time, project.duration);
  const frame = inferProjectSourceFrame(project);
  const cursorPoints = normalizeCursorTelemetry(project.cursorEvents, { frame, duration: project.duration });
  const smoothedCursorPoints = smoothCursorTelemetry(cursorPoints);
  const zoomRegions = normalizeZoomRegions(project.zooms, frame);
  const camera = resolveDeterministicCameraTransform(zoomRegions, smoothedCursorPoints, safeTime, {
    maxTime: project.duration,
    transitionSeconds: CAMERA_TRANSITION_SECONDS,
  });

  return {
    frame,
    camera,
    cursor: sampleSmoothedCursor(cursorPoints, safeTime),
    clickEvents: cursorPoints.filter((point) => point.type === "click" && isActiveClickEvent(point, safeTime, project.duration)),
    activeZoomIds: zoomRegions
      .filter((region) => region.start <= safeTime && safeTime < region.end)
      .map((region) => region.id),
  };
}

function inferProjectSourceFrame(project: DemoProject): MotionFrame {
  const sourceAsset = project.assets.find(
    (asset) => (asset.type === "video" || asset.type === "image") && isPositiveFinite(asset.width) && isPositiveFinite(asset.height),
  );
  const width = sourceAsset?.width;
  const height = sourceAsset?.height;

  if (isPositiveFinite(width) && isPositiveFinite(height)) {
    return { width, height };
  }

  return FALLBACK_FRAMES[project.aspectRatio];
}

function isActiveClickEvent(point: NormalizedCursorPoint, time: number, duration: number) {
  return point.time <= time && time <= Math.min(duration, point.time + CLICK_DISPLAY_SECONDS);
}

function clampTime(time: number, duration: number) {
  if (!Number.isFinite(time)) {
    return 0;
  }

  return Math.min(Math.max(0, time), duration);
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
