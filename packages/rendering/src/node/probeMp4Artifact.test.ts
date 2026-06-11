import { describe, expect, it } from "vitest";
import { probeMp4Artifact } from "./probeMp4Artifact.js";

describe("probeMp4Artifact", () => {
  it("refuses non-MP4 paths", async () => {
    await expect(probeMp4Artifact("/tmp/sample.webm")).rejects.toThrow(/MP4/);
  });

  it("invokes ffprobe with deterministic JSON output arguments", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const result = await probeMp4Artifact("/tmp/sample.mp4", {
      runCommand: async (command, args) => {
        calls.push({ command, args });
        return JSON.stringify({
          streams: [{ codec_name: "h264", codec_type: "video" }],
          format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "45.000000" },
        });
      },
    });

    expect(calls).toEqual([
      {
        command: "ffprobe",
        args: [
          "-v",
          "error",
          "-show_entries",
          "format=format_name,duration",
          "-show_entries",
          "stream=codec_name,codec_type",
          "-of",
          "json",
          "/tmp/sample.mp4",
        ],
      },
    ]);
    expect(result.streams.map((stream) => stream.codec_type)).toEqual(["video"]);
    expect(result.format.duration).toBe("45.000000");
  });

  it("rejects probe output without valid MP4 video media", async () => {
    await expect(
      probeMp4Artifact("/tmp/sample.mp4", {
        runCommand: async () =>
          JSON.stringify({
            streams: [{ codec_name: "aac", codec_type: "audio" }],
            format: { format_name: "matroska,webm", duration: "0" },
          }),
      }),
    ).rejects.toThrow(/valid MP4/);
  });

  it("rejects malformed ffprobe JSON with a verification error", async () => {
    await expect(
      probeMp4Artifact("/tmp/sample.mp4", {
        runCommand: async () => "{not json",
      }),
    ).rejects.toThrow(/valid ffprobe JSON/);
  });

  it("rejects null ffprobe JSON with a verification error", async () => {
    await expect(
      probeMp4Artifact("/tmp/sample.mp4", {
        runCommand: async () => "null",
      }),
    ).rejects.toThrow(/valid ffprobe JSON/);
  });
});
