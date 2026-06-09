import { describe, expect, it } from "vitest";
import { PROJECT_SCHEMA_VERSION, safeParseDemoProject } from "./validators.js";

const baseProject = {
  schemaVersion: PROJECT_SCHEMA_VERSION,
  id: "project_test",
  title: "Test Project",
  duration: 20,
  fps: 30,
  aspectRatio: "16:9",
  createdAt: "2026-06-08T00:00:00.000Z",
  updatedAt: "2026-06-08T00:00:00.000Z",
  assets: [
    {
      id: "asset_video",
      type: "video",
      uri: "assets/video.mp4",
      source: "captured",
      duration: 20,
      width: 1920,
      height: 1080,
    },
  ],
  tracks: [
    {
      id: "track_video",
      type: "video",
      name: "Main capture",
      clips: [
        {
          id: "clip_video",
          assetId: "asset_video",
          start: 0,
          end: 20,
          sourceStart: 0,
          sourceEnd: 20,
        },
      ],
    },
  ],
  zooms: [
    {
      id: "zoom_manual",
      mode: "manual",
      start: 4,
      end: 8,
      target: { x: 100, y: 120, width: 400, height: 300 },
      scale: 2,
    },
  ],
  cursorEvents: [{ time: 5, type: "click", x: 300, y: 260 }],
  aiEditHistory: [],
  metadata: { notes: [] },
} as const;

describe("DemoProjectSchema v0.2.0", () => {
  it("accepts a simplified screen-recording project", () => {
    const result = safeParseDemoProject(baseProject);

    expect(result.success).toBe(true);
  });

  it.each([
    ["captions", [{ id: "caption", start: 1, end: 2, text: "Nope" }]],
    ["callouts", [{ id: "callout", start: 1, end: 2, text: "Nope", position: "top-right" }]],
  ])("rejects removed top-level field %s", (field, value) => {
    const result = safeParseDemoProject({ ...baseProject, [field]: value });

    expect(result.success).toBe(false);
  });

  it("rejects separate audio assets and tracks", () => {
    const result = safeParseDemoProject({
      ...baseProject,
      assets: [
        ...baseProject.assets,
        { id: "asset_audio", type: "audio", uri: "assets/audio.wav", source: "generated" },
      ],
      tracks: [
        ...baseProject.tracks,
        { id: "track_audio", type: "audio", name: "Narration", clips: [] },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects removed caption and callout operations", () => {
    const result = safeParseDemoProject({
      ...baseProject,
      aiEditHistory: [
        {
          id: "edit_removed_ops",
          createdAt: "2026-06-08T00:00:00.000Z",
          prompt: "Add old entities",
          status: "proposed",
          operations: [
            { type: "add_caption", start: 1, end: 2, text: "Caption" },
            { type: "add_callout", start: 3, end: 4, text: "Callout", position: "top-right" },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("accepts the MVP operation set", () => {
    const result = safeParseDemoProject({
      ...baseProject,
      aiEditHistory: [
        {
          id: "edit_mvp_ops",
          createdAt: "2026-06-08T00:00:00.000Z",
          prompt: "Polish range",
          targetRange: { start: 4, end: 10 },
          status: "proposed",
          operations: [
            { type: "auto_zoom", start: 4, end: 10, scale: 2 },
            {
              type: "add_zoom",
              start: 4,
              end: 8,
              target: { x: 100, y: 120, width: 400, height: 300 },
              scale: 2,
            },
            { type: "trim", start: 8, end: 9 },
            { type: "speed", start: 9, end: 12, speed: 2 },
            { type: "remove_zoom", id: "zoom_manual" },
            { type: "remove_clip", id: "clip_video" },
          ],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("validates operation ranges as [start, end) within project duration", () => {
    const result = safeParseDemoProject({
      ...baseProject,
      aiEditHistory: [
        {
          id: "edit_bad_range",
          createdAt: "2026-06-08T00:00:00.000Z",
          prompt: "Bad range",
          status: "proposed",
          operations: [{ type: "trim", start: 10, end: 10 }],
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
