import { describe, expect, it } from "vitest";
import { formatTimecode } from "./formatTimecode.js";

describe("formatTimecode", () => {
  it("formats seconds as m:ss.s", () => {
    expect(formatTimecode(3.2)).toBe("0:03.2");
    expect(formatTimecode(0)).toBe("0:00.0");
    expect(formatTimecode(72.45)).toBe("1:12.5");
  });

  it("clamps non-finite or negative input to zero", () => {
    expect(formatTimecode(-5)).toBe("0:00.0");
    expect(formatTimecode(Number.NaN)).toBe("0:00.0");
  });
});
