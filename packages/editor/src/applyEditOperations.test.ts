import { describe, expect, it } from "vitest";
import type { DemoProject } from "@tinker/project-schema";
import { applyEditOperations } from "./applyEditOperations.js";

function makeProject(): DemoProject {
  return {
    schemaVersion: "0.2.0",
    id: "project_test",
    title: "Test Project",
    duration: 30,
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
        duration: 30,
        width: 1920,
        height: 1080,
        metadata: {},
      },
    ],
    tracks: [
      {
        id: "track_video",
        type: "video",
        name: "Main capture",
        locked: false,
        hidden: false,
        clips: [
          {
            id: "clip_main",
            assetId: "asset_video",
            start: 0,
            end: 30,
            sourceStart: 0,
            sourceEnd: 30,
            playbackRate: 1,
            muted: false,
            opacity: 1,
            transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          },
        ],
      },
    ],
    zooms: [
      {
        id: "zoom_manual_existing",
        mode: "manual",
        start: 20,
        end: 24,
        target: { x: 500, y: 300, width: 420, height: 260 },
        scale: 2,
        easing: "easeInOut",
      },
    ],
    cursorEvents: [
      { time: 6, type: "click", x: 400, y: 320 },
      { time: 12, type: "click", x: 700, y: 480 },
      { time: 22, type: "click", x: 900, y: 520 },
    ],
    aiEditHistory: [],
    metadata: { notes: [] },
  };
}

describe("applyEditOperations", () => {
  it("rejects ranges outside 0 <= start < end <= project.duration", () => {
    const result = applyEditOperations(makeProject(), [{ type: "trim", start: 10, end: 10 }]);

    expect(result.ok).toBe(false);
  });

  it("adds manual zooms", () => {
    const result = applyEditOperations(makeProject(), [
      {
        type: "add_zoom",
        start: 4,
        end: 8,
        target: { x: 100, y: 120, width: 400, height: 300 },
        scale: 2,
      },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.zooms).toContainEqual(
      expect.objectContaining({ mode: "manual", start: 4, end: 8, scale: 2 }),
    );
  });

  it("adds auto zooms from cursor events in [start, end)", () => {
    const result = applyEditOperations(makeProject(), [
      { type: "auto_zoom", start: 5, end: 13, scale: 2 },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.zooms).toContainEqual(
      expect.objectContaining({
        mode: "auto",
        start: 5,
        end: 13,
        keyframes: expect.arrayContaining([
          expect.objectContaining({ time: 6 }),
          expect.objectContaining({ time: 12 }),
        ]),
      }),
    );
  });

  it("fails auto zoom when the selected range has no cursor data", () => {
    const result = applyEditOperations(makeProject(), [
      { type: "auto_zoom", start: 13, end: 18, scale: 2 },
    ]);

    expect(result.ok).toBe(false);
  });

  it("trims [start, end), shortens duration, splits clips, and shifts later entities", () => {
    const original = makeProject();
    const result = applyEditOperations(original, [{ type: "trim", start: 10, end: 15 }]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.project.duration).toBe(25);
    expect(result.project.tracks[0]?.clips).toEqual([
      expect.objectContaining({
        id: "clip_main_before_trim",
        start: 0,
        end: 10,
        sourceStart: 0,
        sourceEnd: 10,
      }),
      expect.objectContaining({
        id: "clip_main_after_trim",
        start: 10,
        end: 25,
        sourceStart: 15,
        sourceEnd: 30,
      }),
    ]);
    expect(result.project.zooms[0]).toEqual(expect.objectContaining({ start: 15, end: 19 }));
    expect(result.project.cursorEvents.map((event) => event.time)).toEqual([6, 17]);
    expect(original.duration).toBe(30);
  });

  it("speeds 10s-20s at 2x, preserving source duration and shifting later entities left", () => {
    const result = applyEditOperations(makeProject(), [{ type: "speed", start: 10, end: 20, speed: 2 }]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.project.duration).toBe(25);
    expect(result.project.tracks[0]?.clips).toEqual([
      expect.objectContaining({ start: 0, end: 10, sourceStart: 0, sourceEnd: 10, playbackRate: 1 }),
      expect.objectContaining({
        start: 10,
        end: 15,
        sourceStart: 10,
        sourceEnd: 20,
        playbackRate: 2,
      }),
      expect.objectContaining({ start: 15, end: 25, sourceStart: 20, sourceEnd: 30, playbackRate: 1 }),
    ]);
    expect(result.project.zooms[0]).toEqual(expect.objectContaining({ start: 15, end: 19 }));
    expect(result.project.cursorEvents.map((event) => event.time)).toEqual([6, 11, 17]);
  });

  it("speeds 10s-20s at 0.5x, preserving source duration and shifting later entities right", () => {
    const result = applyEditOperations(makeProject(), [
      { type: "speed", start: 10, end: 20, speed: 0.5 },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.project.duration).toBe(40);
    expect(result.project.tracks[0]?.clips).toContainEqual(
      expect.objectContaining({
        start: 10,
        end: 30,
        sourceStart: 10,
        sourceEnd: 20,
        playbackRate: 0.5,
      }),
    );
    expect(result.project.zooms[0]).toEqual(expect.objectContaining({ start: 30, end: 34 }));
    expect(result.project.cursorEvents.map((event) => event.time)).toEqual([6, 14, 32]);
  });

  it("removes zooms and clips with dedicated operations", () => {
    const result = applyEditOperations(makeProject(), [
      { type: "remove_zoom", id: "zoom_manual_existing" },
      { type: "remove_clip", id: "clip_main" },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.zooms).toEqual([]);
    expect(result.project.tracks[0]?.clips).toEqual([]);
  });

  it("records accepted operations without mutating the input project", () => {
    const original = makeProject();
    const result = applyEditOperations(
      original,
      [{ type: "trim", start: 1, end: 2 }],
      {
        mode: "accept",
        prompt: "Cut dead air",
        now: "2026-06-09T00:00:00.000Z",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(original.aiEditHistory).toEqual([]);
    expect(result.project.aiEditHistory).toHaveLength(1);
    expect(result.project.aiEditHistory[0]).toEqual(
      expect.objectContaining({ prompt: "Cut dead air", status: "accepted" }),
    );
  });
});
