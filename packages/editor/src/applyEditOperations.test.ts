import { describe, expect, it } from "vitest";
import type { AIEditProposal } from "./applyEditOperations.js";
import { applyEditOperations } from "./applyEditOperations.js";
import { sampleProject } from "./test/sampleProject.js";

const acceptedAt = "2026-06-08T12:00:00.000Z";

function expectOk(result: ReturnType<typeof applyEditOperations>) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result;
}

describe("applyEditOperations", () => {
  it("adds a zoom with a stable generated id", () => {
    const result = expectOk(
      applyEditOperations(sampleProject, {
        prompt: "Add a tighter zoom",
        targetRange: { start: 12, end: 18 },
        operations: [
          {
            type: "add_zoom",
            start: 12.5,
            end: 17,
            target: { x: 700, y: 300, width: 480, height: 240 },
            easing: "easeInOut",
          },
        ],
      }),
    );

    expect(result.project.zooms.at(-1)).toEqual({
      id: "zoom_ai_001",
      start: 12.5,
      end: 17,
      target: { x: 700, y: 300, width: 480, height: 240 },
      easing: "easeInOut",
    });
  });

  it("adds a callout", () => {
    const result = expectOk(
      applyEditOperations(sampleProject, {
        prompt: "Call out analytics",
        targetRange: { start: 13, end: 18 },
        operations: [
          {
            type: "add_callout",
            start: 13.5,
            end: 17.5,
            text: "Revenue impact",
            position: "top-right",
          },
        ],
      }),
    );

    expect(result.project.callouts.at(-1)).toEqual(
      expect.objectContaining({
        id: "callout_ai_001",
        start: 13.5,
        end: 17.5,
        text: "Revenue impact",
        position: "top-right",
      }),
    );
  });

  it("adds a caption", () => {
    const result = expectOk(
      applyEditOperations(sampleProject, {
        prompt: "Add caption",
        targetRange: { start: 2, end: 5 },
        operations: [{ type: "add_caption", start: 2.2, end: 4.8, text: "AI generated caption" }],
      }),
    );

    expect(result.project.captions.at(-1)).toEqual(
      expect.objectContaining({
        id: "caption_ai_001",
        start: 2.2,
        end: 4.8,
        text: "AI generated caption",
      }),
    );
  });

  it("removes captions, zooms, callouts, and clips by id", () => {
    const projectWithExtraClip = {
      ...sampleProject,
      tracks: sampleProject.tracks.map((track) =>
        track.id === "track_video_main"
          ? {
              ...track,
              clips: [
                ...track.clips,
                {
                  id: "clip_short_001",
                  assetId: "asset_capture_001",
                  start: 20,
                  end: 22,
                  sourceStart: 20,
                  sourceEnd: 22,
                  muted: false,
                  opacity: 1,
                  transform: { x: 0, y: 0, scale: 1, rotation: 0 },
                },
              ],
            }
          : track,
      ),
    };

    const result = expectOk(
      applyEditOperations(projectWithExtraClip, {
        prompt: "Remove selected entities",
        operations: [
          { type: "remove_entity", entityType: "caption", id: "caption_001" },
          { type: "remove_entity", entityType: "zoom", id: "zoom_001" },
          { type: "remove_entity", entityType: "callout", id: "callout_001" },
          { type: "remove_entity", entityType: "clip", id: "clip_short_001" },
        ],
      }),
    );

    expect(result.project.captions).toHaveLength(0);
    expect(result.project.zooms).toHaveLength(0);
    expect(result.project.callouts).toHaveLength(0);
    expect(result.project.tracks.flatMap((track) => track.clips).map((clip) => clip.id)).not.toContain(
      "clip_short_001",
    );
    expect(result.project.assets.map((asset) => asset.id)).toContain("asset_capture_001");
  });

  it("fails when removing an unknown id", () => {
    const result = applyEditOperations(sampleProject, {
      prompt: "Remove missing caption",
      operations: [{ type: "remove_entity", entityType: "caption", id: "missing" }],
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "unknown_entity", message: "Cannot remove unknown caption 'missing'" },
    });
  });

  it("fails invalid operation ranges", () => {
    const result = applyEditOperations(sampleProject, {
      prompt: "Bad range",
      operations: [{ type: "add_caption", start: 5, end: 5, text: "No duration" }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid_range");
  });

  it("fails operations outside project duration", () => {
    const result = applyEditOperations(sampleProject, {
      prompt: "Too late",
      operations: [{ type: "add_caption", start: 44, end: 46, text: "Past the end" }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("project duration");
  });

  it("enforces operations inside targetRange by default", () => {
    const result = applyEditOperations(sampleProject, {
      prompt: "Outside selection",
      targetRange: { start: 12, end: 18 },
      operations: [{ type: "add_caption", start: 2, end: 4, text: "Outside" }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("targetRange");
  });

  it("does not mutate the original project", () => {
    const before = structuredClone(sampleProject);

    expectOk(
      applyEditOperations(sampleProject, {
        prompt: "Add caption",
        operations: [{ type: "add_caption", start: 2, end: 4, text: "New" }],
      }),
    );

    expect(sampleProject).toEqual(before);
  });

  it("does not append accepted AI history in preview mode", () => {
    const result = expectOk(
      applyEditOperations(sampleProject, {
        prompt: "Preview only",
        targetRange: { start: 2, end: 5 },
        operations: [{ type: "add_caption", start: 2.2, end: 4.8, text: "Preview" }],
      }),
    );

    expect(result.project.updatedAt).toBe(sampleProject.updatedAt);
    expect(result.project.aiEditHistory).toHaveLength(sampleProject.aiEditHistory.length);
    expect(result.aiEdit).toBeUndefined();
  });

  it("updates updatedAt and appends accepted AI history in accept mode", () => {
    const proposal: AIEditProposal = {
      prompt: "Accept caption",
      targetRange: { start: 2, end: 5 },
      operations: [{ type: "add_caption", start: 2.2, end: 4.8, text: "Accepted" }],
    };

    const result = expectOk(
      applyEditOperations(sampleProject, proposal, {
        mode: "accept",
        now: () => acceptedAt,
        editId: "ai_edit_test",
      }),
    );

    expect(result.project.updatedAt).toBe(acceptedAt);
    expect(result.project.aiEditHistory.at(-1)).toEqual({
      id: "ai_edit_test",
      createdAt: acceptedAt,
      prompt: "Accept caption",
      targetRange: { start: 2, end: 5 },
      operations: proposal.operations,
      status: "accepted",
    });
    expect(result.aiEdit).toEqual(result.project.aiEditHistory.at(-1));
  });
});
