import type { ZoomKeyframe } from "@tinker/project-schema";
import { interpolateCursorPosition, type MotionFrame, type NormalizedCursorPoint } from "./cursorTelemetry.js";

export type ZoomFocus = { cx: number; cy: number };

export type NormalizedZoomRegion = {
  id: string;
  start: number;
  end: number;
  focus: ZoomFocus;
  scale: number;
  transitionSeconds?: number;
  target: ZoomKeyframe["target"];
  easing: ZoomKeyframe["easing"];
};

export type CameraTransform = {
  scale: number;
  x: number;
  y: number;
  focus: ZoomFocus;
  strength: number;
  activeZoomId?: string;
};

export type CursorFollowCameraState = {
  initialized: boolean;
  lastTime: number;
  focus: ZoomFocus;
  wasZoomed: boolean;
  reachedFullZoom: boolean;
  frozenFocus: ZoomFocus;
};

type CursorFollowOptions = {
  safeZoneRadius?: number;
  fullZoomThreshold?: number;
};

type ResolveWithCursorFollowOptions = {
  transitionSeconds?: number;
} & CursorFollowOptions;

export type DeterministicCameraOptions = ResolveWithCursorFollowOptions & {
  maxTime?: number;
};

export const MAX_ZOOM_SCALE = 2.4;
export const ZOOM_CONTEXT_SCALE_FACTOR = 0.85;

const ZOOM_TRANSITION_DURATION_RATIO = 0.35;
const MIN_ZOOM_TRANSITION_SECONDS = 0.45;
const MAX_ZOOM_TRANSITION_SECONDS = 1;

const IDENTITY_FOCUS: ZoomFocus = { cx: 0.5, cy: 0.5 };
const DEFAULT_TRANSITION_SECONDS = 0.2;
const DEFAULT_SAFE_ZONE_RADIUS = 0.18;
const DEFAULT_FULL_ZOOM_THRESHOLD = 0.999;
const POST_REGION_RESET_SAMPLE_SECONDS = 0.000001;
const TERMINAL_ZOOM_EPSILON_SECONDS = 0.000001;

function cleanNumber(value: number) {
  return Number(value.toFixed(12));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function safePositive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function focusBounds(scale: number) {
  if (scale <= 1) {
    return { min: 0.5, max: 0.5 };
  }

  const inset = 1 / (2 * scale);
  return { min: inset, max: 1 - inset };
}

function clampFocus(focus: ZoomFocus, scale: number): ZoomFocus {
  const bounds = focusBounds(scale);

  return {
    cx: cleanNumber(clamp(focus.cx, bounds.min, bounds.max)),
    cy: cleanNumber(clamp(focus.cy, bounds.min, bounds.max)),
  };
}

function ease(progress: number, easing: ZoomKeyframe["easing"]) {
  const t = clamp(progress, 0, 1);

  if (easing === "linear") return t;
  if (easing === "easeIn") return t * t;
  if (easing === "easeOut") return 1 - (1 - t) * (1 - t);

  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function rampStrength(region: NormalizedZoomRegion, time: number, fallbackTransitionSeconds: number) {
  if (time < region.start || time > region.end) {
    return 0;
  }

  const duration = region.end - region.start;
  if (duration <= 0) {
    return 0;
  }

  const transition = clamp(region.transitionSeconds ?? fallbackTransitionSeconds, 0, duration / 2);
  if (transition === 0) {
    return 1;
  }

  const rampIn = clamp((time - region.start) / transition, 0, 1);
  const rampOut = clamp((region.end - time) / transition, 0, 1);

  return cleanNumber(ease(Math.min(rampIn, rampOut), region.easing));
}

function transformFromFocus(
  focus: ZoomFocus,
  targetScale: number,
  strength: number,
  activeZoomId?: string,
): CameraTransform {
  const scale = cleanNumber(1 + (targetScale - 1) * strength);
  const x = cleanNumber((0.5 - focus.cx) * (targetScale - 1) * strength);
  const y = cleanNumber((0.5 - focus.cy) * (targetScale - 1) * strength);

  return {
    scale,
    x,
    y,
    focus,
    strength: cleanNumber(strength),
    ...(activeZoomId ? { activeZoomId } : {}),
  };
}

export function createCursorFollowCameraState(): CursorFollowCameraState {
  return {
    initialized: false,
    lastTime: 0,
    focus: { ...IDENTITY_FOCUS },
    wasZoomed: false,
    reachedFullZoom: false,
    frozenFocus: { ...IDENTITY_FOCUS },
  };
}

export function normalizeZoomRegions(
  zooms: readonly ZoomKeyframe[],
  frame: MotionFrame,
): NormalizedZoomRegion[] {
  const width = safePositive(frame.width, 1);
  const height = safePositive(frame.height, 1);

  return zooms
    .filter((zoom) => Number.isFinite(zoom.start) && Number.isFinite(zoom.end) && zoom.end > zoom.start)
    .map((zoom) => {
      const targetWidth = safePositive(zoom.target.width, width);
      const targetHeight = safePositive(zoom.target.height, height);
      const fillScale = Math.max(1, Math.min(width / targetWidth, height / targetHeight));
      const derivedScale = clamp(fillScale * ZOOM_CONTEXT_SCALE_FACTOR, 1, MAX_ZOOM_SCALE);
      const scale = cleanNumber(
        zoom.scale !== undefined && Number.isFinite(zoom.scale) ? Math.max(1, zoom.scale) : derivedScale,
      );
      const start = cleanNumber(zoom.start);
      const end = cleanNumber(zoom.end);
      const transitionSeconds = cleanNumber(
        clamp((end - start) * ZOOM_TRANSITION_DURATION_RATIO, MIN_ZOOM_TRANSITION_SECONDS, MAX_ZOOM_TRANSITION_SECONDS),
      );
      const focus = clampFocus(
        {
          cx: (zoom.target.x + targetWidth / 2) / width,
          cy: (zoom.target.y + targetHeight / 2) / height,
        },
        scale,
      );

      return {
        id: zoom.id,
        start,
        end,
        focus,
        scale,
        transitionSeconds,
        target: zoom.target,
        easing: zoom.easing,
      };
    });
}

export function resolveCameraTransform(
  regions: readonly NormalizedZoomRegion[],
  time: number,
  options: { transitionSeconds?: number } = {},
): CameraTransform {
  const transitionSeconds = safePositive(options.transitionSeconds ?? DEFAULT_TRANSITION_SECONDS, 0);
  let active:
    | {
        region: NormalizedZoomRegion;
        strength: number;
      }
    | undefined;

  for (const region of regions) {
    const strength = rampStrength(region, time, transitionSeconds);
    if (strength <= 0) {
      continue;
    }

    if (
      !active ||
      strength > active.strength ||
      (strength === active.strength && region.start > active.region.start)
    ) {
      active = { region, strength };
    }
  }

  if (!active) {
    return {
      scale: 1,
      x: 0,
      y: 0,
      focus: { ...IDENTITY_FOCUS },
      strength: 0,
    };
  }

  return transformFromFocus(active.region.focus, active.region.scale, active.strength, active.region.id);
}

export function computeCursorFollowFocus(
  state: CursorFollowCameraState,
  cursorPoints: readonly NormalizedCursorPoint[],
  time: number,
  zoomScale: number,
  zoomStrength: number,
  regionFocus: ZoomFocus,
  options: CursorFollowOptions = {},
): { focus: ZoomFocus; state: CursorFollowCameraState } {
  const fullZoomThreshold = clamp(options.fullZoomThreshold ?? DEFAULT_FULL_ZOOM_THRESHOLD, 0, 1);
  const safeZoneRadius = clamp(options.safeZoneRadius ?? DEFAULT_SAFE_ZONE_RADIUS, 0, 1);
  const cursor = interpolateCursorPosition(cursorPoints, time);
  const priorState = state.initialized && time >= state.lastTime ? state : createCursorFollowCameraState();
  const wasZoomed = priorState.wasZoomed || zoomStrength > 0;
  const reachedFullZoom = priorState.reachedFullZoom || zoomStrength >= fullZoomThreshold;
  const initialFocus = priorState.initialized && priorState.wasZoomed ? priorState.focus : regionFocus;
  const frozenFocus = priorState.initialized ? priorState.frozenFocus : initialFocus;

  if (zoomStrength <= 0) {
    const resetFocus = clampFocus(regionFocus, zoomScale);

    return {
      focus: resetFocus,
      state: {
        initialized: true,
        lastTime: time,
        focus: resetFocus,
        wasZoomed: false,
        reachedFullZoom: false,
        frozenFocus: resetFocus,
      },
    };
  }

  if (priorState.reachedFullZoom && zoomStrength < fullZoomThreshold) {
    const focus = clampFocus(frozenFocus, zoomScale);

    return {
      focus,
      state: {
        ...priorState,
        initialized: true,
        lastTime: time,
        focus,
        wasZoomed,
        reachedFullZoom,
        frozenFocus: focus,
      },
    };
  }

  let nextFocus = clampFocus(initialFocus, zoomScale);

  if (cursor) {
    const cursorFocus = clampFocus({ cx: cursor.cx, cy: cursor.cy }, zoomScale);
    const outsideSafeZone =
      Math.abs(cursorFocus.cx - nextFocus.cx) > safeZoneRadius ||
      Math.abs(cursorFocus.cy - nextFocus.cy) > safeZoneRadius;

    if (outsideSafeZone) {
      nextFocus = cursorFocus;
    }
  }

  return {
    focus: nextFocus,
    state: {
      initialized: true,
      lastTime: time,
      focus: nextFocus,
      wasZoomed,
      reachedFullZoom,
      frozenFocus: reachedFullZoom ? nextFocus : frozenFocus,
    },
  };
}

export function resolveCameraTransformWithCursorFollow(
  regions: readonly NormalizedZoomRegion[],
  cursorPoints: readonly NormalizedCursorPoint[],
  time: number,
  state: CursorFollowCameraState,
  options: ResolveWithCursorFollowOptions = {},
): { transform: CameraTransform; state: CursorFollowCameraState } {
  const base = resolveCameraTransform(regions, time, options);
  const activeRegion = base.activeZoomId
    ? regions.find((region) => region.id === base.activeZoomId)
    : undefined;

  if (!activeRegion || base.strength <= 0) {
    const reset = computeCursorFollowFocus(state, [], time, 1, 0, IDENTITY_FOCUS, options);
    return { transform: base, state: reset.state };
  }

  const regionCursorPoints = cursorPoints.filter(
    (point) => point.time >= activeRegion.start && point.time <= activeRegion.end,
  );
  const cursorFollowState = regionCursorPoints.length === 0 ? createCursorFollowCameraState() : state;

  const followed = computeCursorFollowFocus(
    cursorFollowState,
    regionCursorPoints,
    time,
    activeRegion.scale,
    base.strength,
    activeRegion.focus,
    options,
  );

  return {
    transform: transformFromFocus(followed.focus, activeRegion.scale, base.strength, activeRegion.id),
    state: followed.state,
  };
}

export function resolveDeterministicCameraTransform(
  regions: readonly NormalizedZoomRegion[],
  cursorPoints: readonly NormalizedCursorPoint[],
  time: number,
  options: DeterministicCameraOptions = {},
): CameraTransform {
  const safeTime = clampTime(time, options.maxTime ?? time);
  const resolvedRegions =
    options.maxTime === undefined ? regions : holdTerminalZoomsThroughMaxTime(regions, options.maxTime);
  let state = createCursorFollowCameraState();
  let camera: CameraTransform | undefined;

  for (const sampleTime of collectDeterministicCameraSampleTimes(resolvedRegions, cursorPoints, safeTime, options)) {
    const resolved = resolveCameraTransformWithCursorFollow(resolvedRegions, cursorPoints, sampleTime, state, options);
    state = resolved.state;
    camera = resolved.transform;
  }

  return camera ?? resolveCameraTransformWithCursorFollow(resolvedRegions, cursorPoints, safeTime, state, options).transform;
}

function holdTerminalZoomsThroughMaxTime(
  regions: readonly NormalizedZoomRegion[],
  maxTime: number,
): readonly NormalizedZoomRegion[] {
  if (!Number.isFinite(maxTime)) {
    return regions;
  }

  return regions.map((region) => {
    if (region.end < maxTime - TERMINAL_ZOOM_EPSILON_SECONDS) {
      return region;
    }

    const duration = region.end - region.start;
    const transitionSeconds = clamp(
      region.transitionSeconds ?? DEFAULT_TRANSITION_SECONDS,
      0,
      duration > 0 ? duration / 2 : 0,
    );

    if (transitionSeconds <= 0) {
      return region;
    }

    return {
      ...region,
      end: cleanNumber(maxTime + transitionSeconds),
      transitionSeconds: cleanNumber(transitionSeconds),
    };
  });
}

function collectDeterministicCameraSampleTimes(
  regions: readonly NormalizedZoomRegion[],
  cursorPoints: readonly NormalizedCursorPoint[],
  time: number,
  options: DeterministicCameraOptions,
) {
  const times = new Set<number>([time]);
  const requestedTransitionSeconds = options.transitionSeconds ?? DEFAULT_TRANSITION_SECONDS;

  for (const region of regions) {
    const duration = region.end - region.start;
    const transitionSeconds = clamp(
      region.transitionSeconds ?? requestedTransitionSeconds,
      0,
      duration > 0 ? duration / 2 : 0,
    );

    addDeterministicSampleTime(times, region.start, time);
    addDeterministicSampleTime(times, region.start + transitionSeconds, time);
    addDeterministicSampleTime(times, region.end - transitionSeconds, time);
    addDeterministicSampleTime(times, region.end, time);
    addDeterministicSampleTime(times, region.end + POST_REGION_RESET_SAMPLE_SECONDS, time);
  }

  for (const point of cursorPoints) {
    addDeterministicSampleTime(times, point.time, time);
  }

  return [...times].sort((left, right) => left - right);
}

function addDeterministicSampleTime(times: Set<number>, sampleTime: number, maxTime: number) {
  if (Number.isFinite(sampleTime) && sampleTime >= 0 && sampleTime <= maxTime) {
    times.add(cleanNumber(sampleTime));
  }
}

function clampTime(time: number, maxTime: number) {
  if (!Number.isFinite(time)) {
    return 0;
  }

  return clamp(time, 0, Number.isFinite(maxTime) ? Math.max(0, maxTime) : time);
}
