import {
  normalizeCursorTelemetry,
  normalizeZoomRegions,
  resolveDeterministicCameraTransform,
  smoothCursorTelemetry,
} from "@tinker/motion";
import { resolveCursorSettings, type CursorSettings, type DemoProject } from "@tinker/project-schema";
import { describe, expect, it } from "vitest";
import { buildFinalRenderPlan } from "../renderFinal.js";
import { buildCameraIntervalsForExport, buildRealMediaFilterGraph } from "./ffmpegFilterGraph.js";

const baseProject: DemoProject = {
  schemaVersion: "0.1.0",
  id: "preview_export_parity",
  title: "Preview Export Parity",
  duration: 2,
  fps: 30,
  aspectRatio: "16:9",
  createdAt: "2026-06-08T00:00:00.000Z",
  updatedAt: "2026-06-08T00:00:00.000Z",
  assets: [
    {
      id: "asset_capture_001",
      type: "video",
      uri: "assets/capture-001.mp4",
      source: "captured",
      name: "Primary capture",
      mimeType: "video/mp4",
      duration: 2,
      width: 1920,
      height: 1080,
      metadata: {},
    },
  ],
  tracks: [
    {
      id: "track_video_main",
      type: "video",
      name: "Main capture",
      locked: false,
      hidden: false,
      clips: [
        {
          id: "clip_capture_001",
          assetId: "asset_capture_001",
          start: 0,
          end: 2,
          sourceStart: 0,
          sourceEnd: 2,
          name: "Capture",
          muted: false,
          opacity: 1,
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        },
      ],
    },
  ],
  zooms: [
    {
      id: "zoom_center",
      start: 0.5,
      end: 1.5,
      target: { x: 480, y: 270, width: 960, height: 540 },
      easing: "easeInOut",
    },
  ],
  cursorEvents: [],
  aiEditHistory: [],
  metadata: { notes: [] },
};

function projectWith(overrides: Partial<DemoProject>): DemoProject {
  return {
    ...baseProject,
    ...overrides,
    assets: overrides.assets ?? baseProject.assets,
    tracks: overrides.tracks ?? baseProject.tracks,
    zooms: overrides.zooms ?? baseProject.zooms,
    cursorEvents: overrides.cursorEvents ?? baseProject.cursorEvents,
    aiEditHistory: overrides.aiEditHistory ?? baseProject.aiEditHistory,
    metadata: overrides.metadata ?? baseProject.metadata,
  };
}

function directCamera(project: DemoProject, time: number) {
  const plan = buildFinalRenderPlan(project);
  return resolveDeterministicCameraTransform(
    normalizeZoomRegions(project.zooms, plan.source),
    smoothCursorTelemetry(normalizeCursorTelemetry(project.cursorEvents, {
      frame: plan.source,
      duration: plan.timeline.duration,
    })),
    time,
    {
      maxTime: plan.timeline.duration,
      transitionSeconds: 0.2,
    },
  );
}

function exportCameraAt(project: DemoProject, time: number) {
  const plan = buildFinalRenderPlan(project);
  const interval = buildCameraIntervalsForExport(project, plan).find(
    (candidate) => candidate.start <= time && time < candidate.end,
  );

  if (!interval) {
    throw new Error(`No export camera interval found at ${time}`);
  }

  return interval.transform;
}

function cropFiltersFor(project: DemoProject) {
  const plan = buildFinalRenderPlan(project);
  const graph = buildRealMediaFilterGraph(project, plan, [
    {
      ok: true,
      assetId: "asset_capture_001",
      assetUri: "assets/capture-001.mp4",
      consumer: "export",
      path: "/tmp/capture-001.mp4",
    },
  ]);

  return [...graph.filterComplex.matchAll(/crop=w=(\d+):h=(\d+):x=(\d+):y=(\d+)/g)].map((match) => ({
    width: Number(match[1]),
    height: Number(match[2]),
    x: Number(match[3]),
    y: Number(match[4]),
  }));
}

const TEST_CURSOR_IMAGE = {
  path: "/tmp/tinker-test-cursor-arrow.png",
  width: 32,
  height: 32,
  hotspotX: 3,
  hotspotY: 2,
};

function filterComplexFor(project: DemoProject) {
  const plan = buildFinalRenderPlan(project);
  const graph = buildRealMediaFilterGraph(project, plan, [
    {
      ok: true,
      assetId: "asset_capture_001",
      assetUri: "assets/capture-001.mp4",
      consumer: "export",
      path: "/tmp/capture-001.mp4",
    },
  ], { cursorImage: TEST_CURSOR_IMAGE });

  return graph.filterComplex;
}

function filterComplexWithoutCursorImageFor(project: DemoProject) {
  const plan = buildFinalRenderPlan(project);
  const graph = buildRealMediaFilterGraph(project, plan, [
    {
      ok: true,
      assetId: "asset_capture_001",
      assetUri: "assets/capture-001.mp4",
      consumer: "export",
      path: "/tmp/capture-001.mp4",
    },
  ]);

  return graph.filterComplex;
}

function filterComplexWithCursorImageFor(project: DemoProject, cursorImage: typeof TEST_CURSOR_IMAGE) {
  const plan = buildFinalRenderPlan(project);
  const graph = buildRealMediaFilterGraph(project, plan, [
    {
      ok: true,
      assetId: "asset_capture_001",
      assetUri: "assets/capture-001.mp4",
      consumer: "export",
      path: "/tmp/capture-001.mp4",
    },
  ], { cursorImage });

  return graph.filterComplex;
}

function cursorOverlaysFor(project: DemoProject) {
  return [
    ...filterComplexFor(project).matchAll(
      /overlay=x=(-?\d+):y=(-?\d+):enable='between\(t\\,(\d+(?:\.\d+)?)\\,(\d+(?:\.\d+)?)\)'\[cursor\d+\]/g,
    ),
  ].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
    start: Number(match[3]),
    end: Number(match[4]),
  }));
}

function drawboxesFor(project: DemoProject) {
  return [
    ...filterComplexFor(project).matchAll(
      /drawbox=x=(-?\d+):y=(-?\d+):w=(\d+):h=(\d+):color=([^:]+):/g,
    ),
  ].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
    width: Number(match[3]),
    height: Number(match[4]),
    color: match[5],
  }));
}

/** The amber emphasis box is the export equivalent of the preview's click-event overlay. */
const CLICK_EMPHASIS_COLOR = "#fbbf24@0.90";

function cameraFrameTrimsFor(project: DemoProject) {
  const plan = buildFinalRenderPlan(project);
  const graph = buildRealMediaFilterGraph(project, plan, [
    {
      ok: true,
      assetId: "asset_capture_001",
      assetUri: "assets/capture-001.mp4",
      consumer: "export",
      path: "/tmp/capture-001.mp4",
    },
  ]);

  return [...graph.filterComplex.matchAll(/trim=start_frame=(\d+):end_frame=(\d+)/g)].map((match) => ({
    start: Number(match[1]),
    end: Number(match[2]),
  }));
}

function expectAdjacentFrameTrims(trims: Array<{ start: number; end: number }>) {
  for (let index = 1; index < trims.length; index += 1) {
    expect(trims[index]?.start).toBe(trims[index - 1]?.end);
  }
}

describe("preview/export camera parity", () => {
  it("matches the shared camera resolver at active zoom frame timestamps", () => {
    const time = 0.7;

    expect(exportCameraAt(baseProject, time)).toEqual(directCamera(baseProject, time));
  });

  it("matches the shared camera resolver during zoom ramp easing frame timestamps", () => {
    const time = 0.566667;

    expect(exportCameraAt(baseProject, time)).toEqual(directCamera(baseProject, time));
  });

  it("matches cursor-follow focus when cursor movement leaves the safe zone", () => {
    const project = projectWith({
      cursorEvents: [{ id: "cursor_right", time: 1, type: "move", x: 1800, y: 540 }],
    });
    const time = 1;

    expect(exportCameraAt(project, time)).toEqual(directCamera(project, time));
    expect(exportCameraAt(project, time).focus.cx).toBeGreaterThan(0.7);
  });

  it.each([
    ["16:9", { width: 1128, height: 634, x: 396, y: 222 }],
    ["9:16", { width: 634, height: 1128, x: 222, y: 396 }],
    ["1:1", { width: 634, height: 634, x: 222, y: 222 }],
  ] as const)("keeps centered zoom crop placement stable for %s output", (aspectRatio, expectedCrop) => {
    const project = projectWith({ aspectRatio });

    expect(cropFiltersFor(project)).toContainEqual(expectedCrop);
  });

  it("keeps a non-frame-aligned final camera interval non-empty", () => {
    const duration = 2.01;
    const fps = 30;
    const project = projectWith({
      duration,
      fps,
      zooms: [
        {
          id: "zoom_final_partial_frame",
          start: 0.5,
          end: 1.5,
          target: { x: 0, y: 270, width: 960, height: 540 },
          easing: "linear",
        },
      ],
      tracks: baseProject.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => ({
          ...clip,
          end: duration,
          sourceEnd: duration,
        })),
      })),
      assets: baseProject.assets.map((asset) => ({ ...asset, duration })),
    });

    const trims = cameraFrameTrimsFor(project);

    expect(trims.length).toBeGreaterThan(1);
    expect(trims.at(-1)?.end).toBe(Math.ceil(duration * fps));
    expect(trims.every((trim) => trim.end > trim.start)).toBe(true);
    expectAdjacentFrameTrims(trims);
  });

  it("keeps 60fps animated camera frame trims adjacent", () => {
    const fps = 60;
    const duration = 1;
    const project = projectWith({
      duration,
      fps,
      zooms: [
        {
          id: "zoom_60fps_frame_boundaries",
          start: 0,
          end: duration,
          target: { x: 0, y: 270, width: 960, height: 540 },
          easing: "linear",
        },
      ],
      tracks: baseProject.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => ({
          ...clip,
          end: duration,
          sourceEnd: duration,
        })),
      })),
      assets: baseProject.assets.map((asset) => ({ ...asset, duration })),
    });

    const trims = cameraFrameTrimsFor(project);

    expect(trims.length).toBeGreaterThan(1);
    expect(trims[0]).toEqual({ start: 0, end: 1 });
    expect(trims.at(-1)?.end).toBe(duration * fps);
    expectAdjacentFrameTrims(trims);
  });

  it("does not composite animated camera frame segments over a black base", () => {
    const filter = filterComplexFor(baseProject);

    expect(filter).not.toContain("camera_base");
    expect(filter).toContain("concat=");
  });
});

describe("preview/export cursor-settings parity (PB-006)", () => {
  // A project with a recorded move + click so cursor/click emphasis has something to render.
  function cursorProject(cursor?: CursorSettings): DemoProject {
    return projectWith({
      cursor,
      zooms: [],
      cursorEvents: [
        { id: "move_1", time: 1, type: "move", x: 960, y: 540 },
        { id: "click_1", time: 1, type: "click", x: 960, y: 540 },
      ],
    });
  }

  it("default settings: export draws both a cursor marker and a click emphasis box", () => {
    const project = cursorProject();

    // Preview intent (shared resolver, also consumed by the browser preview).
    expect(resolveCursorSettings(project.cursor)).toEqual({
      hidden: false,
      clickEffect: "ring",
      clickEffectDurationMs: 500,
    });

    // Export reflects that intent: a cursor image plus the amber click-emphasis box.
    const overlays = cursorOverlaysFor(project);
    const boxes = drawboxesFor(project);
    expect(filterComplexFor(project)).toContain("movie='/tmp/tinker-test-cursor-arrow.png'");
    expect(overlays.length).toBeGreaterThan(0);
    expect(boxes.some((box) => box.color === CLICK_EMPHASIS_COLOR)).toBe(true);
  });

  it("escapes cursor image paths for FFmpeg movie filters", () => {
    const project = projectWith({
      zooms: [],
      cursorEvents: [{ id: "move_escape", time: 1, type: "move", x: 960, y: 540 }],
    });
    const complex = filterComplexWithCursorImageFor(project, {
      ...TEST_CURSOR_IMAGE,
      path: "/tmp/tinker\\cursor/a'b:c.png",
    });

    expect(complex).toContain(String.raw`movie='/tmp/tinker\\cursor/a'\''b\:c.png'`);
  });

  it("splits the cursor image stream for multiple cursor points", () => {
    expect(filterComplexFor(cursorProject())).toContain("split=2[cursor_icon0][cursor_icon1]");
  });

  it("omits cursor filters when no cursor image is provided", () => {
    const complex = filterComplexWithoutCursorImageFor(cursorProject());

    expect(complex).not.toContain("movie=");
    expect(complex).not.toContain("cursor_icon");
    expect(complex).not.toContain("cursor_emphasis");
    expect(complex).not.toContain("drawbox");
  });

  it("hidden: both preview-intent and export suppress the cursor entirely", () => {
    const project = cursorProject({ hidden: true });

    // Preview hides the cursor (resolved setting both sides read).
    expect(resolveCursorSettings(project.cursor).hidden).toBe(true);

    // Export emits no cursor image overlays and no click emphasis at all — no cursor in the MP4.
    expect(cursorOverlaysFor(project)).toHaveLength(0);
    expect(drawboxesFor(project)).toHaveLength(0);
    expect(filterComplexFor(project)).not.toContain("cursor-arrow.png");
    expect(filterComplexFor(project)).not.toContain("drawbox");
  });

  it("clickEffect none: both preview-intent and export suppress the click emphasis", () => {
    const project = cursorProject({ clickEffect: "none" });

    expect(resolveCursorSettings(project.cursor).clickEffect).toBe("none");

    // No amber emphasis box, but the plain cursor marker still renders (parity with preview,
    // where the cursor stays but the click-event overlay is gone).
    const overlays = cursorOverlaysFor(project);
    const boxes = drawboxesFor(project);
    expect(boxes.some((box) => box.color === CLICK_EMPHASIS_COLOR)).toBe(false);
    expect(boxes).toHaveLength(0);
    expect(overlays.length).toBeGreaterThan(0);
  });

  it("positions the cursor image by hotspot after source-to-output mapping", () => {
    const project = projectWith({
      aspectRatio: "1:1",
      zooms: [],
      cursorEvents: [{ id: "move_hotspot", time: 1, type: "move", x: 960, y: 540 }],
    });

    expect(cursorOverlaysFor(project)).toContainEqual({
      x: 537,
      y: 538,
      start: 1,
      end: 1.25,
    });
  });

  it("clickEffectDurationMs feeds the export click-emphasis enable window", () => {
    const project = cursorProject({ clickEffectDurationMs: 1000 });
    const complex = filterComplexFor(project);

    // The amber emphasis box stays enabled from the click time (1) through 1 + 1.0s = 2.
    expect(complex).toContain("color=#fbbf24@0.90:t=fill:enable='between(t\\,1\\,2)'");
  });

  it("absent cursor field keeps the current default export behavior", () => {
    const withSettings = cursorProject();
    const withoutSettings = cursorProject(undefined);

    // No `cursor` field is identical to explicit defaults — no regression for existing projects.
    expect(filterComplexFor(withoutSettings)).toEqual(filterComplexFor(withSettings));
  });

  it("clickEffect ripple: export emphasis box is 34×34 (larger than the ring 30×30)", () => {
    const project = cursorProject({ clickEffect: "ripple" });

    // Preview intent: resolver returns ripple.
    expect(resolveCursorSettings(project.cursor).clickEffect).toBe("ripple");

    // Export emits the amber emphasis box at the ripple size (34×34).
    const boxes = drawboxesFor(project);
    const emphasisBoxes = boxes.filter((box) => box.color === CLICK_EMPHASIS_COLOR);
    expect(emphasisBoxes.length).toBeGreaterThan(0);
    emphasisBoxes.forEach((box) => {
      expect(box.width).toBe(34);
      expect(box.height).toBe(34);
    });
  });
});
