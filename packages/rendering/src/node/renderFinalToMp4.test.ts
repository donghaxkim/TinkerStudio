import { DemoProjectSchema } from "@tinker/project-schema";
import { describe, expect, it } from "vitest";
import sampleProjectInput from "../../../project-schema/fixtures/demo-project.sample.json";
import { renderFinalToMp4 } from "./renderFinalToMp4.js";

const sampleProject = DemoProjectSchema.parse(sampleProjectInput);

describe("renderFinalToMp4", () => {
  it("refuses non-MP4 output paths", async () => {
    await expect(renderFinalToMp4(sampleProject, { outputPath: "/tmp/sample.webm" })).rejects.toThrow(/MP4/);
  });

  it("invokes ffmpeg with a deterministic MP4 command", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];

    const result = await renderFinalToMp4(sampleProject, {
      outputPath: "/tmp/sample-product-demo.mp4",
      runCommand: async (command, args) => {
        calls.push({ command, args });
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe("ffmpeg");
    expect(calls[0]?.args).toEqual(
      expect.arrayContaining([
        "-f",
        "lavfi",
        "-i",
        "color=c=#0f172a:s=1920x1080:r=30:d=45",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "/tmp/sample-product-demo.mp4",
      ]),
    );
    expect(result.artifact.path).toBe("/tmp/sample-product-demo.mp4");
    expect(result.artifact.mimeType).toBe("video/mp4");
    expect(result.plan.layers.length).toBeGreaterThan(0);
  });
});
