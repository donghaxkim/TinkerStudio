import { describe, expect, it } from "vitest";
import { sampleProject } from "../test/sampleProject.js";
import { getActivePreviewOverlays } from "./activeOverlays.js";

describe("getActivePreviewOverlays", () => {
  it("returns the sample caption at 3s", () => {
    const overlays = getActivePreviewOverlays(sampleProject, 3);

    expect(overlays.captions).toEqual([
      expect.objectContaining({ id: "caption_001", text: "Turn product flows into polished demo videos." }),
    ]);
  });

  it("returns the sample zoom and callout at 14s", () => {
    const overlays = getActivePreviewOverlays(sampleProject, 14);

    expect(overlays.zooms).toEqual([expect.objectContaining({ id: "zoom_001" })]);
    expect(overlays.callouts).toEqual([expect.objectContaining({ id: "callout_001", text: "Real-time analytics" })]);
  });

  it("returns cursor events near the current timestamp", () => {
    const overlays = getActivePreviewOverlays(sampleProject, 12.1);

    expect(overlays.cursorEvents).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "click", label: "Open analytics" })]),
    );
    expect(overlays.latestCursor).toEqual(expect.objectContaining({ type: "click" }));
  });
});
