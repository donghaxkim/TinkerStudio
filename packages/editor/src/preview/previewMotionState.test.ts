import type { DemoProject } from "@tinker/project-schema";
import { normalizeCursorTelemetry, normalizeZoomRegions, resolveDeterministicCameraTransform, smoothCursorTelemetry } from "@tinker/motion";
import { describe, expect, it } from "vitest";
import { sampleProject } from "../test/sampleProject.js";
import { buildPreviewMotionState } from "./previewMotionState.js";

function projectWith(overrides: Partial<DemoProject>): DemoProject {
  return {
    ...sampleProject,
    ...overrides,
  };
}

function withoutAssetDimensions(project: DemoProject, aspectRatio: DemoProject["aspectRatio"]): DemoProject {
  return projectWith({
    aspectRatio,
    assets: project.assets.map((asset) => ({
      ...asset,
      width: undefined,
      height: undefined,
    })),
  });
}

describe("preview motion state", () => {
  it("falls back to deterministic frame dimensions for every supported aspect ratio", () => {
    expect(buildPreviewMotionState(withoutAssetDimensions(sampleProject, "16:9"), 0).frame).toEqual({
      width: 1920,
      height: 1080,
    });
    expect(buildPreviewMotionState(withoutAssetDimensions(sampleProject, "9:16"), 0).frame).toEqual({
      width: 1080,
      height: 1920,
    });
    expect(buildPreviewMotionState(withoutAssetDimensions(sampleProject, "1:1"), 0).frame).toEqual({
      width: 1080,
      height: 1080,
    });
  });

  it("normalizes cursor positions through project frame dimensions instead of landscape constants", () => {
    const project = projectWith({
      aspectRatio: "9:16",
      assets: sampleProject.assets.map((asset) => ({ ...asset, width: 1080, height: 1920 })),
      cursorEvents: [{ time: 1, type: "move", x: 540, y: 480 }],
    });

    const state = buildPreviewMotionState(project, 1);

    expect(state.frame).toEqual({ width: 1080, height: 1920 });
    expect(state.cursor?.cx).toBeCloseTo(0.5);
    expect(state.cursor?.cy).toBeCloseTo(0.25);
    expect(state.cursor?.x).toBeCloseTo(540);
    expect(state.cursor?.y).toBeCloseTo(480);
  });

  it("uses the inferred project source frame even when the active clip has different asset dimensions", () => {
    const project = projectWith({
      duration: 4,
      assets: [
        { ...sampleProject.assets[0], id: "asset_first", width: 1920, height: 1080 },
        { ...sampleProject.assets[0], id: "asset_second", width: 1080, height: 1920 },
      ],
      tracks: [
        {
          ...sampleProject.tracks[0],
          clips: [
            {
              ...sampleProject.tracks[0].clips[0],
              id: "clip_first",
              assetId: "asset_first",
              start: 0,
              end: 2,
              sourceStart: 0,
              sourceEnd: 2,
            },
            {
              ...sampleProject.tracks[0].clips[0],
              id: "clip_second",
              assetId: "asset_second",
              start: 2,
              end: 4,
              sourceStart: 0,
              sourceEnd: 2,
            },
          ],
        },
      ],
      cursorEvents: [{ time: 3, type: "move", x: 960, y: 540 }],
      zooms: [
        {
          id: "zoom_later_clip",
          start: 2.5,
          end: 3.5,
          target: { x: 480, y: 270, width: 960, height: 540 },
          easing: "linear",
        },
      ],
    });

    const state = buildPreviewMotionState(project, 3);

    expect(state.frame).toEqual({ width: 1920, height: 1080 });
    expect(state.cursor?.cx).toBeCloseTo(0.5);
    expect(state.cursor?.cy).toBeCloseTo(0.5);
    expect(state.camera.activeZoomId).toBe("zoom_later_clip");
    expect(state.camera.focus.cx).toBeCloseTo(0.5);
    expect(state.camera.focus.cy).toBeCloseTo(0.5);
  });

  it("shows click indicators only from click time through the export click duration", () => {
    const project = projectWith({
      cursorEvents: [{ time: 1, type: "click", x: 960, y: 540 }],
    });

    expect(buildPreviewMotionState(project, 0.99).clickEvents).toHaveLength(0);
    expect(buildPreviewMotionState(project, 1).clickEvents).toHaveLength(1);
    expect(buildPreviewMotionState(project, 1.5).clickEvents).toHaveLength(1);
    expect(buildPreviewMotionState(project, 1.51).clickEvents).toHaveLength(0);
  });

  describe("PB-006 cursor display settings", () => {
    const clickProject = projectWith({
      cursorEvents: [
        { time: 1, type: "move", x: 960, y: 540 },
        { time: 1, type: "click", x: 960, y: 540 },
      ],
    });

    it("resolves defaults (cursor shown, ring) when cursor settings are absent", () => {
      const state = buildPreviewMotionState(clickProject, 1);

      expect(state.cursorSettings).toEqual({ hidden: false, clickEffect: "ring", clickEffectDurationMs: 500 });
      expect(state.cursor).toBeDefined();
      expect(state.clickEvents).toHaveLength(1);
    });

    it("hides the cursor and all click emphasis when cursor.hidden is true", () => {
      const state = buildPreviewMotionState(projectWith({ ...clickProject, cursor: { hidden: true } }), 1);

      expect(state.cursorSettings.hidden).toBe(true);
      expect(state.cursor).toBeUndefined();
      expect(state.clickEvents).toHaveLength(0);
    });

    it("keeps the cursor but suppresses click emphasis when clickEffect is none", () => {
      const state = buildPreviewMotionState(projectWith({ ...clickProject, cursor: { clickEffect: "none" } }), 1);

      expect(state.cursor).toBeDefined();
      expect(state.clickEvents).toHaveLength(0);
    });

    it("keeps a click emphasis event for ripple just like ring", () => {
      const ripple = buildPreviewMotionState(projectWith({ ...clickProject, cursor: { clickEffect: "ripple" } }), 1);

      expect(ripple.cursorSettings.clickEffect).toBe("ripple");
      expect(ripple.clickEvents).toHaveLength(1);
    });

    it("uses clickEffectDurationMs as the click display window", () => {
      const longClick = projectWith({ ...clickProject, cursor: { clickEffectDurationMs: 1000 } });

      // At 1.6s a 500ms window has expired, but the configured 1000ms window is still open.
      expect(buildPreviewMotionState(clickProject, 1.6).clickEvents).toHaveLength(0);
      expect(buildPreviewMotionState(longClick, 1.6).clickEvents).toHaveLength(1);
      expect(buildPreviewMotionState(longClick, 2.01).clickEvents).toHaveLength(0);
    });
  });

  it("returns camera transforms from active normalized zoom regions", () => {
    const state = buildPreviewMotionState(sampleProject, 14);

    expect(state.activeZoomIds).toContain("zoom_001");
    expect(state.camera.scale).toBeGreaterThan(1);
    expect(state.camera.activeZoomId).toBe("zoom_001");
  });

  it("returns the same state for the same timestamp after seeking elsewhere", () => {
    const first = buildPreviewMotionState(sampleProject, 14);
    buildPreviewMotionState(sampleProject, 20);
    buildPreviewMotionState(sampleProject, 2);
    const second = buildPreviewMotionState(sampleProject, 14);

    expect(second).toEqual(first);
  });

  it("uses the shared deterministic camera resolver", () => {
    const time = 14;
    const state = buildPreviewMotionState(sampleProject, time);
    const cursorPoints = smoothCursorTelemetry(normalizeCursorTelemetry(sampleProject.cursorEvents, { frame: state.frame, duration: sampleProject.duration }));
    const zoomRegions = normalizeZoomRegions(sampleProject.zooms, state.frame);

    expect(state.camera).toEqual(
      resolveDeterministicCameraTransform(zoomRegions, cursorPoints, time, {
        maxTime: sampleProject.duration,
        transitionSeconds: 0.2,
      }),
    );
  });
});
