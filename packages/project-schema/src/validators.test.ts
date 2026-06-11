import { describe, expect, it } from "vitest";
import sampleProjectInput from "../fixtures/demo-project.sample.json" with { type: "json" };
import { DemoProjectSchema } from "./validators.js";

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
