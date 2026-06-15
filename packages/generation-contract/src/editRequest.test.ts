import { describe, expect, it } from "vitest";
import { EditCompositionRequestBodySchema } from "./editRequest.js";

describe("EditCompositionRequestBodySchema", () => {
  it("accepts an instruction with range + clip context", () => {
    expect(EditCompositionRequestBodySchema.safeParse({
      instruction: "punch in on the modal",
      context: [
        { kind: "range", start: 4.2, end: 7.8 },
        { kind: "clip", clipId: "scene-feature", label: "feature", start: 4.2, end: 7.8 },
      ],
    }).success).toBe(true);
  });
  it("accepts an empty context and an optional id on a ref", () => {
    expect(EditCompositionRequestBodySchema.safeParse({ instruction: "brighter", context: [] }).success).toBe(true);
    expect(EditCompositionRequestBodySchema.safeParse({ instruction: "x", context: [{ id: "r1", kind: "range", start: 1, end: 2 }] }).success).toBe(true);
  });
  it("rejects an empty instruction and unknown keys", () => {
    expect(EditCompositionRequestBodySchema.safeParse({ instruction: "", context: [] }).success).toBe(false);
    expect(EditCompositionRequestBodySchema.safeParse({ instruction: "x", context: [], extra: 1 }).success).toBe(false);
  });
});
