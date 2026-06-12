import type { ZoomKeyframe } from "@tinker/project-schema";
import { describe, expect, it } from "vitest";
import {
  computeCursorFollowFocus,
  createCursorFollowCameraState,
  normalizeZoomRegions,
  resolveCameraTransform,
  resolveDeterministicCameraTransform,
  resolveCameraTransformWithCursorFollow,
} from "./cameraTransform.js";
import type { NormalizedCursorPoint } from "./cursorTelemetry.js";

describe("camera transform", () => {
  const frame = { width: 1000, height: 500 };

  const zoom = (overrides: Partial<ZoomKeyframe> = {}): ZoomKeyframe => ({
    id: "zoom_001",
    start: 1,
    end: 5,
    target: { x: 250, y: 125, width: 250, height: 125 },
    easing: "linear",
    ...overrides,
  });

  it("resolves zoom transform math deterministically for the same timestamp and input", () => {
    const regions = normalizeZoomRegions([zoom()], frame);

    const first = resolveCameraTransform(regions, 2, { transitionSeconds: 1 });
    const second = resolveCameraTransform(regions, 2, { transitionSeconds: 1 });

    expect(first).toEqual(second);
    expect(first).toEqual({
      scale: 2.4,
      x: 0.175,
      y: 0.175,
      focus: { cx: 0.375, cy: 0.375 },
      strength: 1,
      activeZoomId: "zoom_001",
    });
  });

  it("returns identity transform when no zoom is active", () => {
    const regions = normalizeZoomRegions([zoom()], frame);

    expect(resolveCameraTransform(regions, 0.5)).toEqual({
      scale: 1,
      x: 0,
      y: 0,
      focus: { cx: 0.5, cy: 0.5 },
      strength: 0,
    });
  });

  it("chooses the strongest overlapping zoom and uses later starts as tie breakers", () => {
    const regions = normalizeZoomRegions(
      [
        zoom({ id: "early", start: 1, end: 5, target: { x: 250, y: 125, width: 500, height: 250 } }),
        zoom({ id: "late", start: 2, end: 6, target: { x: 250, y: 125, width: 250, height: 125 } }),
      ],
      frame,
    );

    expect(resolveCameraTransform(regions, 3, { transitionSeconds: 0 }).activeZoomId).toBe("late");
  });

  it("clamps zoom target focus within valid bounds near frame edges", () => {
    const regions = normalizeZoomRegions(
      [
        zoom({
          target: { x: 0, y: 0, width: 100, height: 100 },
        }),
      ],
      frame,
    );

    expect(regions[0]).toMatchObject({
      scale: 2.4,
      focus: { cx: 0.208333333333, cy: 0.208333333333 },
    });

    const farEdge = normalizeZoomRegions(
      [
        zoom({
          target: { x: 990, y: 490, width: 10, height: 10 },
        }),
      ],
      frame,
    );

    expect(farEdge[0]).toMatchObject({
      scale: 2.4,
      focus: { cx: 0.791666666667, cy: 0.791666666667 },
    });
  });

  const point = (time: number, cx: number, cy: number): NormalizedCursorPoint => ({
    time,
    cx,
    cy,
    x: cx * frame.width,
    y: cy * frame.height,
    type: "move",
  });

  it("does not recenter cursor-follow focus while cursor stays inside the safe zone", () => {
    const state = {
      ...createCursorFollowCameraState(),
      initialized: true,
      focus: { cx: 0.5, cy: 0.5 },
      frozenFocus: { cx: 0.5, cy: 0.5 },
    };

    const result = computeCursorFollowFocus(state, [point(1, 0.56, 0.54)], 1, 3, 1, { cx: 0.5, cy: 0.5 });

    expect(result.focus).toEqual({ cx: 0.5, cy: 0.5 });
    expect(result.state.focus).toEqual({ cx: 0.5, cy: 0.5 });
    expect(result.state).not.toBe(state);
  });

  it("recenters cursor-follow focus after cursor leaves the safe zone", () => {
    const state = {
      ...createCursorFollowCameraState(),
      initialized: true,
      focus: { cx: 0.5, cy: 0.5 },
      frozenFocus: { cx: 0.5, cy: 0.5 },
    };

    const result = computeCursorFollowFocus(
      state,
      [point(1, 0.82, 0.2)],
      1,
      3,
      1,
      { cx: 0.5, cy: 0.5 },
      { safeZoneRadius: 0.12 },
    );

    expect(result.focus).toEqual({ cx: 0.82, cy: 0.2 });
    expect(result.state.focus).toEqual({ cx: 0.82, cy: 0.2 });
  });

  it("freezes cursor-follow focus during zoom-out after full zoom was reached", () => {
    const state = {
      ...createCursorFollowCameraState(),
      initialized: true,
      focus: { cx: 0.42, cy: 0.44 },
      wasZoomed: true,
      reachedFullZoom: true,
      frozenFocus: { cx: 0.42, cy: 0.44 },
    };

    const result = computeCursorFollowFocus(state, [point(4, 0.9, 0.9)], 4, 3, 0.4, { cx: 0.5, cy: 0.5 });

    expect(result.focus).toEqual({ cx: 0.42, cy: 0.44 });
    expect(result.state.focus).toEqual({ cx: 0.42, cy: 0.44 });
  });

  it("resets cursor-follow state through inactive gaps before a later zoom", () => {
    const regions = normalizeZoomRegions(
      [
        zoom({ id: "first", start: 1, end: 3 }),
        zoom({ id: "second", start: 5, end: 7, target: { x: 500, y: 250, width: 250, height: 125 } }),
      ],
      frame,
    );
    const fullZoomState = {
      ...createCursorFollowCameraState(),
      initialized: true,
      focus: { cx: 0.42, cy: 0.44 },
      wasZoomed: true,
      reachedFullZoom: true,
      frozenFocus: { cx: 0.42, cy: 0.44 },
    };

    const inactive = resolveCameraTransformWithCursorFollow(regions, [point(4, 0.9, 0.9)], 4, fullZoomState);
    const next = resolveCameraTransformWithCursorFollow(regions, [point(5.1, 0.75, 0.75)], 5.1, inactive.state);

    expect(inactive.state.reachedFullZoom).toBe(false);
    expect(next.transform.activeZoomId).toBe("second");
    expect(next.state.reachedFullZoom).toBe(false);
    expect(next.transform.focus).not.toEqual({ cx: 0.42, cy: 0.44 });
  });

  it("refreshes cursor-follow state during active zooms even without cursor samples", () => {
    const regions = normalizeZoomRegions([zoom()], frame);
    const staleState = {
      ...createCursorFollowCameraState(),
      initialized: true,
      focus: { cx: 0.9, cy: 0.9 },
      frozenFocus: { cx: 0.9, cy: 0.9 },
    };

    const result = resolveCameraTransformWithCursorFollow(regions, [], 2, staleState, { transitionSeconds: 0 });

    expect(result.transform.activeZoomId).toBe("zoom_001");
    expect(result.state.focus).toEqual({ cx: 0.375, cy: 0.375 });
    expect(result.state.wasZoomed).toBe(true);
  });

  it("resets cursor-follow state when sampling moves backward in time", () => {
    const futureState = {
      ...createCursorFollowCameraState(),
      initialized: true,
      lastTime: 4,
      focus: { cx: 0.9, cy: 0.9 },
      wasZoomed: true,
      reachedFullZoom: true,
      frozenFocus: { cx: 0.9, cy: 0.9 },
    };

    const result = computeCursorFollowFocus(futureState, [point(2, 0.45, 0.45)], 2, 3, 0.5, { cx: 0.42, cy: 0.44 });

    expect(result.focus).toEqual({ cx: 0.42, cy: 0.44 });
    expect(result.state.reachedFullZoom).toBe(false);
    expect(result.state.lastTime).toBe(2);
  });

  it("resolves deterministic cursor-follow camera transforms without external state", () => {
    const regions = normalizeZoomRegions([zoom({ target: { x: 0, y: 0, width: 250, height: 125 } })], frame);
    const cursorPoints = [point(2, 0.82, 0.2)];

    const first = resolveDeterministicCameraTransform(regions, cursorPoints, 2, {
      safeZoneRadius: 0.12,
      transitionSeconds: 0,
    });
    resolveCameraTransformWithCursorFollow(regions, cursorPoints, 4, createCursorFollowCameraState());
    const second = resolveDeterministicCameraTransform(regions, cursorPoints, 2, {
      safeZoneRadius: 0.12,
      transitionSeconds: 0,
    });

    expect(second).toEqual(first);
    expect(first.focus).toEqual({ cx: 0.791666666667, cy: 0.208333333333 });
    expect(first.activeZoomId).toBe("zoom_001");
  });

  it("replays prior cursor samples before resolving deterministic cursor-follow focus", () => {
    const regions = normalizeZoomRegions([zoom({ target: { x: 0, y: 0, width: 250, height: 125 } })], frame);
    const cursorPoints = [point(1.2, 0.55, 0.55), point(2.2, 0.84, 0.18)];

    const transform = resolveDeterministicCameraTransform(regions, cursorPoints, 2.2, {
      safeZoneRadius: 0.12,
      transitionSeconds: 0,
    });

    // Full zoom locks at t=2 on the cursor's in-flight position; the final
    // cursor sample at t=2.2 lands inside the safe zone so focus holds steady.
    expect(transform.focus).toEqual({ cx: 0.782, cy: 0.254 });
    expect(transform.scale).toBe(2.4);
  });

  it("preserves zoom ramp and easing strength at deterministic timestamps", () => {
    const regions = normalizeZoomRegions([zoom({ start: 1, end: 5, easing: "easeInOut" })], frame);

    const ramp = resolveDeterministicCameraTransform(regions, [], 1.1, { transitionSeconds: 1 });
    const full = resolveDeterministicCameraTransform(regions, [], 2.5, { transitionSeconds: 1 });

    expect(ramp.activeZoomId).toBe("zoom_001");
    expect(ramp.strength).toBeCloseTo(0.02);
    expect(ramp.scale).toBeCloseTo(1.028);
    expect(full.strength).toBe(1);
    expect(full.scale).toBe(2.4);
  });

  it("matches stateful playback for short zooms whose transition is clamped to half duration", () => {
    const regions = normalizeZoomRegions(
      [zoom({ start: 1, end: 1.3, target: { x: 0, y: 0, width: 250, height: 125 } })],
      frame,
    );
    const cursorPoints = [point(1.05, 0.82, 0.2), point(1.25, 0.25, 0.8)];
    let state = createCursorFollowCameraState();

    for (const time of [1, 1.15, 1.25]) {
      state = resolveCameraTransformWithCursorFollow(regions, cursorPoints, time, state, { transitionSeconds: 1 }).state;
    }

    const stateful = resolveCameraTransformWithCursorFollow(regions, cursorPoints, 1.25, state, {
      transitionSeconds: 1,
    }).transform;
    const deterministic = resolveDeterministicCameraTransform(regions, cursorPoints, 1.25, {
      transitionSeconds: 1,
    });

    expect(deterministic).toEqual(stateful);
    expect(deterministic.focus).not.toEqual({ cx: 0.25, cy: 0.8 });
  });

  it("replays inactive gaps so later zooms do not inherit stale cursor-follow focus", () => {
    const regions = normalizeZoomRegions(
      [
        zoom({ id: "first", start: 1, end: 2, target: { x: 695, y: 37.5, width: 250, height: 125 } }),
        zoom({ id: "second", start: 4, end: 5, target: { x: 250, y: 125, width: 250, height: 125 } }),
      ],
      frame,
    );
    let state = createCursorFollowCameraState();

    for (const time of [1, 1.5, 2, 3, 4.1]) {
      state = resolveCameraTransformWithCursorFollow(regions, [], time, state, { transitionSeconds: 0 }).state;
    }

    const stateful = resolveCameraTransformWithCursorFollow(regions, [], 4.1, state, {
      transitionSeconds: 0,
    }).transform;
    const deterministic = resolveDeterministicCameraTransform(regions, [], 4.1, {
      transitionSeconds: 0,
    });

    expect(deterministic).toEqual(stateful);
    expect(deterministic.activeZoomId).toBe("second");
    expect(deterministic.focus).toEqual({ cx: 0.375, cy: 0.375 });
  });
});

describe("zoom scale safety and pacing", () => {
  const frame = { width: 1920, height: 1080 };

  it("caps derived zoom scale for tiny targets instead of filling the frame", () => {
    // LongCut regression: 188x29 "Chat" button produced a 10.2x zoom.
    const regions = normalizeZoomRegions(
      [
        {
          id: "zoom-3",
          start: 6.062,
          end: 8.562,
          target: { x: 1451, y: -29, width: 188, height: 29 },
          easing: "easeInOut",
        },
      ],
      frame,
    );

    expect(regions[0]?.scale).toBe(2.4);

    const inset = 1 / (2 * 2.4);
    expect(regions[0]?.focus.cy).toBeCloseTo(inset, 9);
    expect(regions[0]?.focus.cx).toBeCloseTo(1 - inset, 9);
  });

  it("pads derived zoom scale with surrounding context below the cap", () => {
    const regions = normalizeZoomRegions(
      [
        {
          id: "zoom-pad",
          start: 0,
          end: 2,
          target: { x: 460, y: 290, width: 1000, height: 500 },
          easing: "easeInOut",
        },
      ],
      frame,
    );

    expect(regions[0]?.scale).toBeCloseTo(1.92 * 0.85, 5);
  });

  it("respects an explicit keyframe scale override", () => {
    const regions = normalizeZoomRegions(
      [
        {
          id: "zoom-explicit",
          start: 0,
          end: 2,
          scale: 3.1,
          target: { x: 800, y: 400, width: 188, height: 29 },
          easing: "easeInOut",
        },
      ],
      frame,
    );

    expect(regions[0]?.scale).toBe(3.1);
  });

  it("derives per-zoom transition seconds from the zoom duration", () => {
    const target = { x: 800, y: 400, width: 320, height: 180 };
    const [medium] = normalizeZoomRegions(
      [{ id: "medium", start: 6.062, end: 8.562, target, easing: "easeInOut" }],
      frame,
    );
    const [long] = normalizeZoomRegions([{ id: "long", start: 0, end: 6, target, easing: "easeInOut" }], frame);
    const [short] = normalizeZoomRegions([{ id: "short", start: 0, end: 0.8, target, easing: "easeInOut" }], frame);

    expect(medium?.transitionSeconds).toBeCloseTo(0.875, 5);
    expect(long?.transitionSeconds).toBe(1);
    expect(short?.transitionSeconds).toBeCloseTo(0.45, 5);
  });

  it("lets the per-zoom transition override a renderer-supplied transition", () => {
    const regions = normalizeZoomRegions(
      [
        {
          id: "zoom-pace",
          start: 1,
          end: 5,
          target: { x: 250, y: 125, width: 250, height: 125 },
          easing: "linear",
        },
      ],
      { width: 1000, height: 500 },
    );

    const ramping = resolveCameraTransform(regions, 1.2, { transitionSeconds: 0.2 });

    expect(ramping.strength).toBeCloseTo(0.2, 5);
    expect(ramping.strength).toBeLessThan(1);
  });
});
