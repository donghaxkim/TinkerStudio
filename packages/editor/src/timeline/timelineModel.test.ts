import { describe, expect, it } from "vitest";
import { sampleProject } from "../test/sampleProject.js";
import { buildTimelineRows } from "./timelineModel.js";

describe("buildTimelineRows", () => {
  it("creates track and overlay rows from the sample project", () => {
    const rows = buildTimelineRows(sampleProject);

    expect(rows.map((row) => row.id)).toEqual([
      "track_video_main",
      "track_audio_narration",
      "captions",
      "zooms",
      "callouts",
    ]);
    expect(rows.find((row) => row.id === "track_video_main")?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "clip_capture_001",
          kind: "clip",
          label: "Browser flow",
          start: 0,
          end: 45,
        }),
      ]),
    );
  });

  it("preserves overlay ranges and labels", () => {
    const rows = buildTimelineRows(sampleProject);

    expect(rows.find((row) => row.id === "captions")?.items[0]).toEqual(
      expect.objectContaining({
        id: "caption_001",
        kind: "caption",
        label: "Turn product flows into polished demo videos.",
        start: 2,
        end: 5,
      }),
    );
    expect(rows.find((row) => row.id === "zooms")?.items[0]).toEqual(
      expect.objectContaining({ id: "zoom_001", start: 12, end: 18 }),
    );
    expect(rows.find((row) => row.id === "callouts")?.items[0]).toEqual(
      expect.objectContaining({ id: "callout_001", label: "Real-time analytics", start: 13, end: 18 }),
    );
  });
});
