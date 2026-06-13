import {
  resolveCursorSettings,
  type DemoProject,
  type ResolvedCursorSettings,
} from "@tinker/project-schema";
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
  /** Resolved cursor/click display settings (PB-006), shared with export for parity. */
  cursorSettings: ResolvedCursorSettings;
};

const FALLBACK_FRAMES: Record<DemoProject["aspectRatio"], MotionFrame> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
};

const CAMERA_TRANSITION_SECONDS = 0.2;

export function buildPreviewMotionState(project: DemoProject, time: number): PreviewMotionState {
  const safeTime = clampTime(time, project.duration);
  const frame = inferProjectSourceFrame(project);
  // PB-006: resolved cursor/click display settings, shared verbatim with export.
  const cursorSettings = resolveCursorSettings(project.cursor);
  const cursorPoints = normalizeCursorTelemetry(project.cursorEvents, { frame, duration: project.duration });
  const smoothedCursorPoints = smoothCursorTelemetry(cursorPoints);
  const zoomRegions = normalizeZoomRegions(project.zooms, frame);
  const camera = resolveDeterministicCameraTransform(zoomRegions, smoothedCursorPoints, safeTime, {
    maxTime: project.duration,
    transitionSeconds: CAMERA_TRANSITION_SECONDS,
  });

  // When the cursor is hidden, neither the cursor overlay nor click emphasis renders.
  // When clickEffect is "none", the cursor still renders but no click emphasis shows.
  const clickDisplaySeconds = cursorSettings.clickEffectDurationMs / 1000;
  const showClickEmphasis = !cursorSettings.hidden && cursorSettings.clickEffect !== "none";

  return {
    frame,
    camera,
    cursor: cursorSettings.hidden ? undefined : sampleSmoothedCursor(cursorPoints, safeTime),
    clickEvents: showClickEmphasis
      ? cursorPoints.filter(
          (point) => point.type === "click" && isActiveClickEvent(point, safeTime, project.duration, clickDisplaySeconds),
        )
      : [],
    activeZoomIds: zoomRegions
      .filter((region) => region.start <= safeTime && safeTime < region.end)
      .map((region) => region.id),
    cursorSettings,
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

function isActiveClickEvent(point: NormalizedCursorPoint, time: number, duration: number, displaySeconds: number) {
  return point.time <= time && time <= Math.min(duration, point.time + displaySeconds);
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
