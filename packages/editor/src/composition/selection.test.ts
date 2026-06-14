import { describe, expect, it } from "vitest";
import { rangeSelection, clipSelection } from "./selection.js";
import type { CompositionClip } from "./compositionTimelineModel.js";

describe("CompositionSelection constructors", () => {
  it("rangeSelection normalizes start/end order", () => {
    expect(rangeSelection(7.8, 4.2)).toEqual({ kind: "range", start: 4.2, end: 7.8 });
    expect(rangeSelection(1, 3)).toEqual({ kind: "range", start: 1, end: 3 });
  });

  it("clipSelection carries id, bounds, and label", () => {
    const clip: CompositionClip = { id: "feature", label: "Feature", start: 4, end: 10 };
    expect(clipSelection(clip)).toEqual({ kind: "clip", clipId: "feature", label: "Feature", start: 4, end: 10 });
  });

  it("clipSelection omits label when the clip has none", () => {
    const clip: CompositionClip = { id: "clip-0", start: 0, end: 4 };
    expect(clipSelection(clip)).toEqual({ kind: "clip", clipId: "clip-0", start: 0, end: 4 });
  });
});
