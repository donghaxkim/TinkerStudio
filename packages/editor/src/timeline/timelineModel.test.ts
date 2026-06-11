import { describe, expect, it } from "vitest";
import { sampleProject } from "../test/sampleProject.js";
import { buildTimelineRows } from "./timelineModel.js";

describe("buildTimelineRows", () => {
  it("creates track and overlay rows from the sample project", () => {
    const rows = buildTimelineRows(sampleProject);

    expect(rows.map((row) => row.id)).toEqual(["track_video_main", "zooms"]);
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

    expect(rows.find((row) => row.id === "zooms")?.items[0]).toEqual(
      expect.objectContaining({ id: "zoom_001", start: 12, end: 18 }),
    );
  });
});
