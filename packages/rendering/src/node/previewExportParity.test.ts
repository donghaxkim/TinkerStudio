import {
  normalizeCursorTelemetry,
  normalizeZoomRegions,
  resolveDeterministicCameraTransform,
  smoothCursorTelemetry,
} from "@tinker/motion";
import type { DemoProject } from "@tinker/project-schema";
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
    ["16:9", { width: 1128, height: 634, x: 396, y: 222 }],
    ["9:16", { width: 634, height: 1128, x: 222, y: 396 }],
    ["1:1", { width: 634, height: 634, x: 222, y: 222 }],
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
