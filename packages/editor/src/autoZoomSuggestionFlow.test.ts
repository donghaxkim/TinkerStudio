import type { CursorEvent, DemoProject } from "@tinker/project-schema";
import { describe, expect, it } from "vitest";
import {
  acceptAutoZoomSuggestions,
  buildAutoZoomSuggestionState,
} from "./autoZoomSuggestionFlow.js";
import { sampleProject } from "./test/sampleProject.js";

const now = "2026-06-11T12:00:00.000Z";

function dwellProject(overrides: Partial<DemoProject> = {}): DemoProject {
  const cursorEvents: CursorEvent[] = [
    { time: 3, type: "move", x: 420, y: 310 },
    { time: 3.4, type: "move", x: 422, y: 312 },
    { time: 3.8, type: "move", x: 421, y: 311 },
  ];

  return {
    ...sampleProject,
    zooms: [],
    cursorEvents,
    ...overrides,
  };
}

describe("auto zoom suggestion flow", () => {
  it("builds deterministic preview-only suggestions without mutating the source project", () => {
    const project = dwellProject();
    const first = buildAutoZoomSuggestionState(project);
    const second = buildAutoZoomSuggestionState(project);

    expect(first.suggestions).toHaveLength(1);
    expect(first.suggestions).toEqual(second.suggestions);
    expect(first.previewProject.zooms).toHaveLength(project.zooms.length + 1);
    expect(first.previewProject.zooms.at(-1)).toEqual(first.suggestions[0]);
    expect(project.zooms).toHaveLength(0);
  });

  it("avoids duplicate suggestions that overlap existing zooms by default", () => {
    const project = dwellProject({
      zooms: [
        {
          id: "zoom_existing",
          start: 3.1,
          end: 4.1,
          target: { x: 200, y: 100, width: 700, height: 400 },
          easing: "easeInOut",
        },
      ],
    });

    const state = buildAutoZoomSuggestionState(project);

    expect(state.suggestions).toEqual([]);
    expect(state.previewProject).toEqual(project);
  });

  it("uses the active clip frame at the dwell time when clips have different dimensions", () => {
    const project = dwellProject({
      duration: 10,
      assets: [
        {
          ...sampleProject.assets[0],
          id: "asset_first",
          width: 1920,
          height: 1080,
        },
        {
          ...sampleProject.assets[0],
          id: "asset_second",
          width: 1000,
          height: 500,
        },
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
              end: 5,
              sourceStart: 0,
              sourceEnd: 5,
            },
            {
              ...sampleProject.tracks[0].clips[0],
              id: "clip_second",
              assetId: "asset_second",
              start: 5,
              end: 10,
              sourceStart: 0,
              sourceEnd: 5,
            },
          ],
        },
      ],
      cursorEvents: [
        { time: 6, type: "move", x: 500, y: 250 },
        { time: 6.4, type: "move", x: 502, y: 251 },
        { time: 6.8, type: "move", x: 501, y: 249 },
      ],
    });

    const state = buildAutoZoomSuggestionState(project);

    expect(state.suggestions).toHaveLength(1);
    expect(state.suggestions[0].target).toMatchObject({
      x: 226,
      y: 112.5,
      width: 550,
      height: 275,
    });
  });

  it("accepts suggestions as one undoable manual edit command", () => {
    const project = dwellProject();
    const { suggestions } = buildAutoZoomSuggestionState(project);

    const result = acceptAutoZoomSuggestions(project, suggestions, {
      now: () => now,
      commandId: "cmd_auto_zoom",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.project.zooms).toHaveLength(1);
    expect(result.project.zooms[0]?.id).toBe(suggestions[0]?.id);
    expect(result.command).toEqual({
      type: "manual-edit",
      id: "cmd_auto_zoom",
      label: "Accept auto zoom suggestions",
      beforeProject: project,
      afterProject: result.project,
    });
  });
});
