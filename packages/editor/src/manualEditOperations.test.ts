import { describe, expect, it } from "vitest";
import { applyManualEditOperation } from "./manualEditOperations.js";
import { sampleProject } from "./test/sampleProject.js";

const now = "2026-06-10T12:00:00.000Z";

function expectOk(result: ReturnType<typeof applyManualEditOperation>) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result;
}

describe("applyManualEditOperation", () => {
  it("adds a zoom with a stable manual id and command snapshot", () => {
    const result = expectOk(
      applyManualEditOperation(
        sampleProject,
        {
          type: "upsert_zoom",
          start: 16,
          end: 20,
          target: { x: 400, y: 200, width: 500, height: 300 },
        },
        { now: () => now, commandId: "cmd_zoom" },
      ),
    );

    expect(result.project.zooms.at(-1)).toEqual(
      expect.objectContaining({
        id: "zoom_manual_001",
        target: { x: 400, y: 200, width: 500, height: 300 },
        easing: "easeInOut",
      }),
    );
    expect(result.project.updatedAt).toBe(now);
    expect(result.command).toEqual({
      type: "manual-edit",
      id: "cmd_zoom",
      label: "Add zoom",
      beforeProject: sampleProject,
      afterProject: result.project,
    });
  });

  it("preserves existing zoom easing when editing target only", () => {
    const project = {
      ...sampleProject,
      zooms: [{ ...sampleProject.zooms[0], easing: "linear" as const }],
    };

    const result = expectOk(
      applyManualEditOperation(project, {
        type: "upsert_zoom",
        id: "zoom_001",
        start: 12,
        end: 15,
        target: { x: 20, y: 40, width: 640, height: 360 },
      }),
    );

    expect(result.project.zooms[0]).toEqual(
      expect.objectContaining({
        id: "zoom_001",
        target: { x: 20, y: 40, width: 640, height: 360 },
        easing: "linear",
      }),
    );
  });

  it("trims an existing clip without deleting the asset", () => {
    const result = expectOk(
      applyManualEditOperation(sampleProject, {
        type: "trim_clip",
        id: "clip_capture_001",
        start: 1,
        end: 20,
        sourceStart: 2,
        sourceEnd: 21,
      }),
    );

    const clip = result.project.tracks[0]?.clips[0];
    expect(clip).toEqual(expect.objectContaining({ id: "clip_capture_001", start: 1, end: 20, sourceStart: 2, sourceEnd: 21 }));
    expect(result.project.assets.map((asset) => asset.id)).toContain("asset_capture_001");
  });

  it("removes zooms by id", () => {
    const result = expectOk(
      applyManualEditOperation(sampleProject, { type: "remove_entity", entityType: "zoom", id: "zoom_001" }),
    );

    expect(result.project.zooms).toHaveLength(0);
    expect(result.project.tracks.flatMap((track) => track.clips).map((clip) => clip.id)).toContain("clip_capture_001");
  });

  it("removes an entity without validating the selected range", () => {
    const result = expectOk(
      applyManualEditOperation(
        sampleProject,
        { type: "remove_entity", entityType: "zoom", id: "zoom_001" },
        { selectedRange: { start: 99, end: 120 } },
      ),
    );

    expect(result.project.zooms).toHaveLength(0);
  });

  it("fails invalid ranges and unknown ids", () => {
    const invalidRange = applyManualEditOperation(sampleProject, {
      type: "upsert_zoom",
      start: 5,
      end: 5,
      target: { x: 400, y: 200, width: 500, height: 300 },
    });
    const unknownZoom = applyManualEditOperation(sampleProject, {
      type: "upsert_zoom",
      id: "missing",
      start: 2,
      end: 4,
      target: { x: 400, y: 200, width: 500, height: 300 },
    });

    expect(invalidRange.ok).toBe(false);
    if (!invalidRange.ok) expect(invalidRange.error.code).toBe("invalid_range");
    expect(unknownZoom.ok).toBe(false);
    if (!unknownZoom.ok) expect(unknownZoom.error.message).toContain("unknown zoom");
  });

  it("does not mutate the input project", () => {
    const before = structuredClone(sampleProject);

    expectOk(
      applyManualEditOperation(sampleProject, {
        type: "upsert_zoom",
        start: 8,
        end: 10,
        target: { x: 400, y: 200, width: 500, height: 300 },
      }),
    );

    expect(sampleProject).toEqual(before);
  });
});
