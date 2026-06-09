import { describe, expect, it } from "vitest";
import { sampleProject } from "../test/sampleProject.js";
import { getActiveClip, getClipSourceTime, isBrowserRenderableMedia } from "./assetResolver.js";

describe("assetResolver", () => {
  it("selects the clip active at the current project time", () => {
    const project = {
      ...sampleProject,
      assets: [
        ...sampleProject.assets,
        { id: "asset_second", type: "video" as const, uri: "https://example.com/second.mp4", source: "captured" as const, metadata: {} },
      ],
      tracks: [
        {
          ...sampleProject.tracks[0],
          clips: [
            { ...sampleProject.tracks[0].clips[0], id: "clip_first", start: 0, end: 10, sourceStart: 0, sourceEnd: 10 },
            { ...sampleProject.tracks[0].clips[0], id: "clip_second", assetId: "asset_second", start: 10, end: 20, sourceStart: 4, sourceEnd: 14 },
          ],
        },
      ],
    };

    expect(getActiveClip(project, 5)?.clip.id).toBe("clip_first");
    expect(getActiveClip(project, 12)?.clip.id).toBe("clip_second");
  });

  it("maps project time to source media time", () => {
    const clip = { ...sampleProject.tracks[0].clips[0], start: 10, end: 20, sourceStart: 4 };

    expect(getClipSourceTime(clip, 13)).toBe(7);
  });

  it("only treats browser-resolvable asset URIs as renderable", () => {
    expect(isBrowserRenderableMedia({ id: "remote", type: "video", uri: "https://example.com/video.mp4", source: "remote", metadata: {} })).toBe(true);
    expect(isBrowserRenderableMedia({ id: "local", type: "video", uri: "assets/capture.mp4", source: "captured", metadata: {} })).toBe(false);
  });
});
