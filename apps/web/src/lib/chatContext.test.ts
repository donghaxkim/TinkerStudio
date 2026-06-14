import { describe, expect, it } from "vitest";
import { chatContextRefFromSelection, formatContextLabel } from "./chatContext.js";

describe("chatContextRefFromSelection", () => {
  it("builds a range ref", () => {
    expect(chatContextRefFromSelection({ kind: "range", start: 4.2, end: 7.8 }, "r1")).toEqual({
      id: "r1", kind: "range", start: 4.2, end: 7.8,
    });
  });
  it("builds a clip ref with id + label", () => {
    expect(
      chatContextRefFromSelection({ kind: "clip", clipId: "feature", label: "Feature", start: 4, end: 10 }, "c1"),
    ).toEqual({ id: "c1", kind: "clip", clipId: "feature", label: "Feature", start: 4, end: 10 });
  });
});

describe("formatContextLabel", () => {
  it("formats a range as seconds", () => {
    expect(formatContextLabel({ id: "r1", kind: "range", start: 4.2, end: 7.84 })).toBe("4.2s–7.8s");
  });
  it("uses the clip label, falling back to the clip id", () => {
    expect(formatContextLabel({ id: "c1", kind: "clip", clipId: "feature", label: "Feature", start: 4, end: 10 })).toBe("Feature");
    expect(formatContextLabel({ id: "c2", kind: "clip", clipId: "scene-2", start: 4, end: 10 })).toBe("scene-2");
  });
});
