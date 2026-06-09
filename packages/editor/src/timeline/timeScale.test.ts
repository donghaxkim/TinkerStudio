import { describe, expect, it } from "vitest";
import { createTimeScale } from "./timeScale.js";

describe("createTimeScale", () => {
  it("converts seconds to pixels and pixels to seconds", () => {
    const scale = createTimeScale(45, 900);

    expect(scale.secondsToPixels(22.5)).toBe(450);
    expect(scale.pixelsToSeconds(450)).toBe(22.5);
  });

  it("clamps seeks to the project duration", () => {
    const scale = createTimeScale(45, 900);

    expect(scale.clampTime(-2)).toBe(0);
    expect(scale.clampTime(100)).toBe(45);
    expect(scale.pixelsToSeconds(-20)).toBe(0);
    expect(scale.pixelsToSeconds(1000)).toBe(45);
  });
});
