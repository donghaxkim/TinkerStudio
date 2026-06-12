import { describe, expect, it } from "vitest";
import sampleProjectInput from "../fixtures/demo-project.sample.json" with { type: "json" };
import { CursorSettingsSchema, DemoProjectSchema } from "./validators.js";

describe("DemoProjectSchema MVP scope", () => {
  it("parses sample projects without text or audio timeline fields", () => {
    const project = DemoProjectSchema.parse(sampleProjectInput);

    expect("captions" in project).toBe(false);
    expect("callouts" in project).toBe(false);
    expect(JSON.stringify(project.assets)).not.toContain('"type":"audio"');
    expect(JSON.stringify(project.tracks)).not.toContain('"type":"audio"');
  });

  it("rejects legacy captions, callouts, audio assets, and audio tracks", () => {
    expect(DemoProjectSchema.safeParse({ ...sampleProjectInput, captions: [] }).success).toBe(false);
    expect(DemoProjectSchema.safeParse({ ...sampleProjectInput, callouts: [] }).success).toBe(false);
    expect(
      DemoProjectSchema.safeParse({
        ...sampleProjectInput,
        assets: [
          ...sampleProjectInput.assets,
          { id: "asset_audio", type: "audio", uri: "audio.wav", source: "generated" },
        ],
      }).success,
    ).toBe(false);
    expect(
      DemoProjectSchema.safeParse({
        ...sampleProjectInput,
        tracks: [
          ...sampleProjectInput.tracks,
          { id: "track_audio", type: "audio", name: "Audio", clips: [] },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("DemoProjectSchema cursor display settings (PB-006, Person B)", () => {
  it("validates a project WITHOUT a cursor field (backward compatible)", () => {
    expect("cursor" in sampleProjectInput).toBe(false);

    const result = DemoProjectSchema.safeParse(sampleProjectInput);

    expect(result.success).toBe(true);
    if (result.success) {
      // Absent stays absent — no field is injected, so omitting validators is unaffected.
      expect(result.data.cursor).toBeUndefined();
    }
  });

  it("validates a project WITH a fully specified valid cursor field", () => {
    const result = DemoProjectSchema.safeParse({
      ...sampleProjectInput,
      cursor: { hidden: true, clickEffect: "ripple", clickEffectDurationMs: 750 },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cursor).toEqual({
        hidden: true,
        clickEffect: "ripple",
        clickEffectDurationMs: 750,
      });
    }
  });

  it("validates a project with a partial cursor field (every member optional)", () => {
    expect(DemoProjectSchema.safeParse({ ...sampleProjectInput, cursor: {} }).success).toBe(true);
    expect(
      DemoProjectSchema.safeParse({ ...sampleProjectInput, cursor: { clickEffect: "none" } }).success,
    ).toBe(true);
    expect(
      DemoProjectSchema.safeParse({ ...sampleProjectInput, cursor: { hidden: false } }).success,
    ).toBe(true);
  });

  it("rejects a negative or zero click-effect duration", () => {
    expect(CursorSettingsSchema.safeParse({ clickEffectDurationMs: -1 }).success).toBe(false);
    expect(CursorSettingsSchema.safeParse({ clickEffectDurationMs: 0 }).success).toBe(false);
    expect(
      DemoProjectSchema.safeParse({ ...sampleProjectInput, cursor: { clickEffectDurationMs: -250 } })
        .success,
    ).toBe(false);
  });

  it("rejects an unknown clickEffect value", () => {
    expect(CursorSettingsSchema.safeParse({ clickEffect: "sparkle" }).success).toBe(false);
    expect(
      DemoProjectSchema.safeParse({ ...sampleProjectInput, cursor: { clickEffect: "sparkle" } })
        .success,
    ).toBe(false);
  });

  it("rejects unknown keys inside the cursor object (strict)", () => {
    expect(CursorSettingsSchema.safeParse({ color: "#fff" }).success).toBe(false);
    expect(
      DemoProjectSchema.safeParse({ ...sampleProjectInput, cursor: { color: "#fff" } }).success,
    ).toBe(false);
  });
});
