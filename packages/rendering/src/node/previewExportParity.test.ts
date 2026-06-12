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
  ]);

  return graph.filterComplex;
}

/** Every cursor drawbox emitted by the export filter graph. */
function cursorDrawboxesFor(project: DemoProject) {
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
    ["16:9", { width: 960, height: 540, x: 480, y: 270 }],
    ["9:16", { width: 540, height: 960, x: 270, y: 480 }],
    ["1:1", { width: 540, height: 540, x: 270, y: 270 }],
  ] as const)("keeps centered zoom crop placement stable for %s output", (aspectRatio, expectedCrop) => {
    const project = projectWith({ aspectRatio });

    expect(cropFiltersFor(project)).toContainEqual(expectedCrop);
  });

  it("keeps a non-frame-aligned final camera interval non-empty", () => {
    const project = projectWith({
      duration: 1.01,
      zooms: [
        {
          id: "zoom_final_partial_frame",
          start: 0.99,
          end: 1.01,
          target: { x: 0, y: 270, width: 960, height: 540 },
          easing: "linear",
        },
      ],
      tracks: baseProject.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => ({
          ...clip,
          end: 1.01,
          sourceEnd: 1.01,
        })),
      })),
      assets: baseProject.assets.map((asset) => ({ ...asset, duration: 1.01 })),
    });

    const trims = cameraFrameTrimsFor(project);

    expect(trims.at(-1)).toEqual({ start: 30, end: 31 });
    expect(trims.every((trim) => trim.end > trim.start)).toBe(true);
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

    // Export reflects that intent: a plain marker plus the amber click-emphasis box.
    const boxes = cursorDrawboxesFor(project);
    expect(boxes.some((box) => box.color === CLICK_EMPHASIS_COLOR)).toBe(true);
    expect(boxes.some((box) => box.color !== CLICK_EMPHASIS_COLOR)).toBe(true);
  });

  it("hidden: both preview-intent and export suppress the cursor entirely", () => {
    const project = cursorProject({ hidden: true });

    // Preview hides the cursor (resolved setting both sides read).
    expect(resolveCursorSettings(project.cursor).hidden).toBe(true);

    // Export emits no cursor drawboxes at all — no cursor in the MP4.
    expect(cursorDrawboxesFor(project)).toHaveLength(0);
    expect(filterComplexFor(project)).not.toContain("drawbox");
  });

  it("clickEffect none: both preview-intent and export suppress the click emphasis", () => {
    const project = cursorProject({ clickEffect: "none" });

    expect(resolveCursorSettings(project.cursor).clickEffect).toBe("none");

    // No amber emphasis box, but the plain cursor marker still renders (parity with preview,
    // where the cursor stays but the click-event overlay is gone).
    const boxes = cursorDrawboxesFor(project);
    expect(boxes.some((box) => box.color === CLICK_EMPHASIS_COLOR)).toBe(false);
    expect(boxes.length).toBeGreaterThan(0);
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
    const boxes = cursorDrawboxesFor(project);
    const emphasisBoxes = boxes.filter((box) => box.color === CLICK_EMPHASIS_COLOR);
    expect(emphasisBoxes.length).toBeGreaterThan(0);
    emphasisBoxes.forEach((box) => {
      expect(box.width).toBe(34);
      expect(box.height).toBe(34);
    });
  });
});
