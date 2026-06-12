import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DemoProjectSchema } from "@tinker/project-schema";
import { describe, expect, it } from "vitest";
import sampleProjectInput from "../../../project-schema/fixtures/demo-project.sample.json";
import { AssetResolutionError } from "./assetResolution.js";
import { renderFinalToMp4 } from "./renderFinalToMp4.js";

const sampleProject = DemoProjectSchema.parse(sampleProjectInput);
const fixtureProjectRoot = fileURLToPath(new URL("../../../project-schema/fixtures/", import.meta.url));

async function withProjectRoot<T>(run: (projectRoot: string) => Promise<T>) {
  const projectRoot = await mkdtemp(join(tmpdir(), "tinker-render-"));

  try {
    await mkdir(join(projectRoot, "assets"), { recursive: true });
    await writeFile(join(projectRoot, "assets/capture-001.mp4"), "fake video bytes");
    return await run(projectRoot);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

function shortProject() {
  return {
    ...sampleProject,
    duration: 2,
    tracks: sampleProject.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => ({
        ...clip,
        start: 0,
        end: 2,
        sourceStart: 0,
        sourceEnd: 2,
      })),
    })),
    assets: sampleProject.assets.map((asset) => ({ ...asset, duration: 2 })),
    zooms: [],
    cursorEvents: [],
    aiEditHistory: [],
  };
}

const probeSummary = {
  streams: [{ codec_type: "video", codec_name: "h264" }],
  format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "2.000000" },
};

type Rgb = { r: number; g: number; b: number };

function filterComplex(args: string[]) {
  return args[args.indexOf("-filter_complex") + 1] ?? "";
}

function cropWidths(filter: string) {
  return [...filter.matchAll(/crop=w=(\d+):h=/g)].map((match) => Number(match[1]));
}

function cropXs(filter: string) {
  return [...filter.matchAll(/crop=w=\d+:h=\d+:x=(\d+):y=/g)].map((match) => Number(match[1]));
}

async function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args);
    let stderr = "";

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`ffmpeg exited with ${code ?? "unknown code"}: ${stderr.trim()}`));
    });
  });
}

async function createSplitColorFixture(path: string, duration = 2) {
  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=black:s=320x180:r=30:d=${duration}`,
    "-vf",
    [
      "drawbox=x=0:y=0:w=160:h=180:color=red:t=fill",
      "drawbox=x=160:y=0:w=160:h=180:color=blue:t=fill",
      "drawbox=x=150:y=0:w=20:h=180:color=white:t=fill",
    ].join(","),
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    path,
  ]);
}

async function createTimelineColorFixture(path: string) {
  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=320x180:r=30:d=1",
    "-f",
    "lavfi",
    "-i",
    "color=c=green:s=320x180:r=30:d=1",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=320x180:r=30:d=1",
    "-filter_complex",
    "[0:v][1:v][2:v]concat=n=3:v=1:a=0,format=yuv420p[v]",
    "-map",
    "[v]",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    path,
  ]);
}

async function createSolidFixture(path: string, color: string, duration = 2) {
  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=${color}:s=320x180:r=30:d=${duration}`,
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    path,
  ]);
}

async function withRealProjectRoot<T>(
  createFixture: (assetPath: string) => Promise<void>,
  run: (projectRoot: string) => Promise<T>,
) {
  const projectRoot = await mkdtemp(join(tmpdir(), "tinker-render-real-"));

  try {
    const assetPath = join(projectRoot, "assets/capture-001.mp4");
    await mkdir(join(projectRoot, "assets"), { recursive: true });
    await createFixture(assetPath);
    return await run(projectRoot);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

async function readRgbFrameBytes(path: string, options: { time?: number; x?: number; y?: number; width?: number; height?: number } = {}) {
  const width = options.width ?? 16;
  const height = options.height ?? 16;
  const x = options.x ?? 100;
  const y = options.y ?? 100;
  const args = [
    "-v",
    "error",
    "-i",
    path,
    "-frames:v",
    "1",
    "-vf",
    `crop=${width}:${height}:${x}:${y},format=rgb24`,
    "-f",
    "rawvideo",
    "pipe:1",
  ];

  if (options.time !== undefined) {
    args.splice(2, 0, "-ss", options.time.toFixed(3));
  }

  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn("ffmpeg", args);
    const chunks: Buffer[] = [];
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
        return;
      }

      reject(new Error(`ffmpeg frame read exited with ${code ?? "unknown code"}: ${stderr.trim()}`));
    });
  });
}

async function sampleAverageRgb(path: string, options: { time: number; x: number; y: number; width?: number; height?: number }) {
  const bytes = await readRgbFrameBytes(path, options);
  const total: Rgb = { r: 0, g: 0, b: 0 };
  const pixels = bytes.length / 3;

  for (let index = 0; index < bytes.length; index += 3) {
    total.r += bytes[index] ?? 0;
    total.g += bytes[index + 1] ?? 0;
    total.b += bytes[index + 2] ?? 0;
  }

  return {
    r: total.r / pixels,
    g: total.g / pixels,
    b: total.b / pixels,
  };
}

async function probeDuration(path: string) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path]);
    const chunks: Buffer[] = [];
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Number(Buffer.concat(chunks).toString().trim()));
        return;
      }

      reject(new Error(`ffprobe duration exited with ${code ?? "unknown code"}: ${stderr.trim()}`));
    });
  });
}

function expectDominant(rgb: Rgb, channel: keyof Rgb) {
  expect(rgb[channel]).toBeGreaterThan(90);
  for (const other of (["r", "g", "b"] as const).filter((candidate) => candidate !== channel)) {
    expect(rgb[channel]).toBeGreaterThan(rgb[other] + 35);
  }
}

describe("renderFinalToMp4", () => {
  it("refuses non-MP4 output paths", async () => {
    await withProjectRoot(async (projectRoot) => {
      await expect(
        renderFinalToMp4(sampleProject, {
          projectRoot,
          allowedOutputRoots: [projectRoot],
          outputPath: "/tmp/sample.webm",
        }),
      ).rejects.toThrow(/MP4/);
    });
  });

  it("requires an explicit allowed output root", async () => {
    await withProjectRoot(async (projectRoot) => {
      await expect(
        renderFinalToMp4(shortProject(), {
          projectRoot,
          allowedOutputRoots: [],
          outputPath: join(projectRoot, "missing-policy.mp4"),
          runCommand: async () => {},
          runProbe: async () => JSON.stringify(probeSummary),
        }),
      ).rejects.toThrow(/allowed output root/);
    });
  });

  it("rejects output paths outside allowed roots before invoking ffmpeg", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];

    await withProjectRoot(async (projectRoot) => {
      await expect(
        renderFinalToMp4(shortProject(), {
          projectRoot,
          allowedOutputRoots: [join(projectRoot, "exports")],
          outputPath: join(projectRoot, "outside.mp4"),
          runCommand: async (command, args) => {
            calls.push({ command, args });
          },
          runProbe: async () => JSON.stringify(probeSummary),
        }),
      ).rejects.toThrow(/outside allowed export output roots/);
    });

    expect(calls).toEqual([]);
  });

  it("rejects traversal-style output paths before invoking ffmpeg", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];

    await withProjectRoot(async (projectRoot) => {
      await expect(
        renderFinalToMp4(shortProject(), {
          projectRoot,
          allowedOutputRoots: [join(projectRoot, "exports")],
          outputPath: join(projectRoot, "exports", "..", "escape.mp4"),
          runCommand: async (command, args) => {
            calls.push({ command, args });
          },
          runProbe: async () => JSON.stringify(probeSummary),
        }),
      ).rejects.toThrow(/outside allowed export output roots/);
    });

    expect(calls).toEqual([]);
  });

  it("invokes ffmpeg with a deterministic MP4 command", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    let expectedAssetPath = "";

    const result = await withProjectRoot((projectRoot) => {
      expectedAssetPath = join(projectRoot, "assets/capture-001.mp4");
      return renderFinalToMp4(sampleProject, {
        projectRoot,
        allowedOutputRoots: [projectRoot],
        outputPath: join(projectRoot, "sample-product-demo.mp4"),
        runCommand: async (command, args) => {
          calls.push({ command, args });
        },
        runProbe: async () => JSON.stringify(probeSummary),
      });
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe("ffmpeg");
    expect(calls[0]?.args).not.toContain("-f");
    expect(calls[0]?.args.join(" ")).not.toContain("color=c=#0f172a:s=1920x1080:r=30:d=45");
    expect(calls[0]?.args).toEqual(expect.arrayContaining([
      "-i",
      expectedAssetPath,
      "-filter_complex",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      result.artifact.path,
    ]));
    expect(calls[0]?.args).not.toContain("anullsrc=channel_layout=stereo:sample_rate=48000");
    expect(calls[0]?.args).not.toContain("-c:a");
    expect(calls[0]?.args).not.toContain("aac");
    expect(result.artifact.path.endsWith("sample-product-demo.mp4")).toBe(true);
    expect(result.artifact.mimeType).toBe("video/mp4");
    expect(result.plan.layers.length).toBeGreaterThan(0);
  });

  it("trims source media and schedules clips in timeline time", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const project = {
      ...shortProject(),
      tracks: shortProject().tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => ({
          ...clip,
          start: 0,
          end: 1,
          sourceStart: 1,
          sourceEnd: 2,
        })),
      })),
    };

    await withProjectRoot(async (projectRoot) => {
      await renderFinalToMp4(project, {
        projectRoot,
        allowedOutputRoots: [projectRoot],
        outputPath: join(projectRoot, "trimmed.mp4"),
        runCommand: async (command, args) => {
          calls.push({ command, args });
        },
        runProbe: async () => JSON.stringify(probeSummary),
      });
    });

    const filter = filterComplex(calls[0]?.args ?? []);
    expect(filter).toContain("trim=start=1:end=2");
    expect(filter).toContain("setpts=PTS-STARTPTS+0/TB");
  });

  it("exports only the requested source segment when trimming real media", async () => {
    await withRealProjectRoot(createTimelineColorFixture, async (projectRoot) => {
      const outputPath = join(projectRoot, "trimmed-real.mp4");

      const result = await renderFinalToMp4(
        {
          ...shortProject(),
          duration: 1,
          assets: shortProject().assets.map((asset) => ({
            ...asset,
            width: 320,
            height: 180,
            duration: 3,
          })),
          tracks: shortProject().tracks.map((track) => ({
            ...track,
            clips: track.clips.map((clip) => ({
              ...clip,
              start: 0,
              end: 1,
              sourceStart: 1,
              sourceEnd: 2,
            })),
          })),
        },
        {
          projectRoot,
          allowedOutputRoots: [projectRoot],
          outputPath,
        },
      );

      const duration = await probeDuration(outputPath);
      const center = await sampleAverageRgb(outputPath, { time: 0.5, x: 952, y: 532 });

      expect(result.artifact.duration).toBeGreaterThanOrEqual(0.9);
      expect(result.artifact.duration).toBeLessThanOrEqual(1.15);
      expect(duration).toBeGreaterThanOrEqual(0.9);
      expect(duration).toBeLessThanOrEqual(1.15);
      expectDominant(center, "g");
    });
  });

  it("composes multiple video clips in timeline order", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const project = {
      ...shortProject(),
      tracks: shortProject().tracks.map((track) => ({
        ...track,
        clips: [
          {
            ...track.clips[0],
            id: "clip_first",
            start: 0,
            end: 1,
            sourceStart: 0,
            sourceEnd: 1,
          },
          {
            ...track.clips[0],
            id: "clip_second",
            start: 1,
            end: 2,
            sourceStart: 1,
            sourceEnd: 2,
          },
        ],
      })),
    };

    await withProjectRoot(async (projectRoot) => {
      await renderFinalToMp4(project, {
        projectRoot,
        allowedOutputRoots: [projectRoot],
        outputPath: join(projectRoot, "multi-clip.mp4"),
        runCommand: async (command, args) => {
          calls.push({ command, args });
        },
        runProbe: async () => JSON.stringify(probeSummary),
      });
    });

    const filter = filterComplex(calls[0]?.args ?? []);
    expect(calls[0]?.args.filter((arg) => arg.endsWith("capture-001.mp4"))).toHaveLength(2);
    expect(filter).toContain("[base][clip0]overlay=0:0:enable='between(t\\,0\\,1)'[media0]");
    expect(filter).toContain("[media0][clip1]overlay=0:0:enable='between(t\\,1\\,2)'[media1]");
  });

  it("exports multiple real clips in timeline order", async () => {
    await withRealProjectRoot(createTimelineColorFixture, async (projectRoot) => {
      const outputPath = join(projectRoot, "multi-real.mp4");

      await renderFinalToMp4(
        {
          ...shortProject(),
          assets: shortProject().assets.map((asset) => ({
            ...asset,
            width: 320,
            height: 180,
            duration: 3,
          })),
          tracks: shortProject().tracks.map((track) => ({
            ...track,
            clips: [
              {
                ...track.clips[0],
                id: "clip_green_first",
                start: 0,
                end: 1,
                sourceStart: 1,
                sourceEnd: 2,
              },
              {
                ...track.clips[0],
                id: "clip_blue_second",
                start: 1,
                end: 2,
                sourceStart: 2,
                sourceEnd: 3,
              },
            ],
          })),
        },
        {
          projectRoot,
          allowedOutputRoots: [projectRoot],
          outputPath,
        },
      );

      const first = await sampleAverageRgb(outputPath, { time: 0.5, x: 952, y: 532 });
      const second = await sampleAverageRgb(outputPath, { time: 1.5, x: 952, y: 532 });

      expectDominant(first, "g");
      expectDominant(second, "b");
    });
  });


  it("freezes a validated project snapshot before export awaits asset preflight", async () => {
    const project = shortProject();
    const calls: Array<{ command: string; args: string[] }> = [];

    await withProjectRoot(async (projectRoot) => {
      const exportPromise = renderFinalToMp4(project, {
        projectRoot,
        allowedOutputRoots: [projectRoot],
        outputPath: join(projectRoot, "snapshot.mp4"),
        runCommand: async (command, args) => {
          calls.push({ command, args });
        },
        runProbe: async () => JSON.stringify(probeSummary),
      });

      project.duration = 999;

      const result = await exportPromise;
      expect(result.artifact.duration).toBe(2);
      expect(calls[0]?.args).toContain("2");
      expect(calls[0]?.args).not.toContain("999");
    });
  });

  it("returns the ffprobe summary with the rendered artifact", async () => {
    const result = await withProjectRoot((projectRoot) => {
      return renderFinalToMp4(shortProject(), {
        projectRoot,
        allowedOutputRoots: [projectRoot],
        outputPath: join(projectRoot, "probe-summary.mp4"),
        runCommand: async () => {},
        runProbe: async () => JSON.stringify(probeSummary),
      });
    });

    expect(result.probe).toEqual(probeSummary);
    expect(result.artifact.duration).toBe(2);
  });

  it("fails preflight before invoking ffmpeg when source media is missing", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const project = {
      ...sampleProject,
      assets: sampleProject.assets.map((asset) => ({ ...asset, uri: "missing/capture.mp4" })),
    };

    await withProjectRoot(async (projectRoot) => {
      await expect(
        renderFinalToMp4(project, {
          projectRoot,
          allowedOutputRoots: [projectRoot],
          outputPath: join(projectRoot, "missing-source.mp4"),
          runCommand: async (command, args) => {
            calls.push({ command, args });
          },
        }),
      ).rejects.toMatchObject({
        issues: [expect.objectContaining({ code: "missing_file", assetId: "asset_capture_001", consumer: "export" })],
      });
    });

    expect(calls).toEqual([]);
  });

  it("reports missing clip asset references as structured asset resolution errors", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const project = {
      ...sampleProject,
      tracks: sampleProject.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => ({ ...clip, assetId: "missing_asset_id" })),
      })),
    };

    await withProjectRoot(async (projectRoot) => {
      let thrown: unknown;

      try {
        await renderFinalToMp4(project, {
          projectRoot,
          allowedOutputRoots: [projectRoot],
          outputPath: join(projectRoot, "missing-asset.mp4"),
          runCommand: async (command, args) => {
            calls.push({ command, args });
          },
        });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(AssetResolutionError);
      expect(thrown).toMatchObject({
        name: "AssetResolutionError",
        issues: [expect.objectContaining({ code: "missing_asset", assetId: "missing_asset_id", consumer: "export" })],
      });
    });

    expect(calls).toEqual([]);
  });

  it("changes the ffmpeg filter graph when edited zoom targets change", async () => {
    const originalCalls: Array<{ command: string; args: string[] }> = [];
    const editedCalls: Array<{ command: string; args: string[] }> = [];
    const editedProject = {
      ...sampleProject,
      zooms: sampleProject.zooms.map((zoom) =>
        zoom.id === "zoom_001" ? { ...zoom, target: { x: 100, y: 120, width: 400, height: 260 } } : zoom,
      ),
    };

    await withProjectRoot(async (projectRoot) => {
      await renderFinalToMp4(sampleProject, {
        projectRoot,
        allowedOutputRoots: [projectRoot],
        outputPath: join(projectRoot, "original.mp4"),
        runCommand: async (command, args) => {
          originalCalls.push({ command, args });
        },
        runProbe: async () => JSON.stringify(probeSummary),
      });
      await renderFinalToMp4(editedProject, {
        projectRoot,
        allowedOutputRoots: [projectRoot],
        outputPath: join(projectRoot, "edited.mp4"),
        runCommand: async (command, args) => {
          editedCalls.push({ command, args });
        },
        runProbe: async () => JSON.stringify(probeSummary),
      });
    });

    const originalFilter = filterComplex(originalCalls[0]?.args ?? []);
    const editedFilter = filterComplex(editedCalls[0]?.args ?? []);
    expect(originalFilter).toBeTruthy();
    expect(editedFilter).toBeTruthy();
    expect(editedFilter).not.toBe(originalFilter);
  });

  it("exports visibly zoomed pixels during the zoom window", async () => {
    await withRealProjectRoot(createSplitColorFixture, async (projectRoot) => {
      const outputPath = join(projectRoot, "zoom-real.mp4");

      await renderFinalToMp4(
        {
          ...shortProject(),
          assets: shortProject().assets.map((asset) => ({
            ...asset,
            width: 320,
            height: 180,
            duration: 2,
          })),
          zooms: [
            {
              id: "zoom_left",
              start: 0.75,
              end: 1.5,
              target: { x: 0, y: 45, width: 160, height: 90 },
              easing: "linear",
            },
          ],
        },
        {
          projectRoot,
          allowedOutputRoots: [projectRoot],
          outputPath,
        },
      );

      const beforeZoom = await sampleAverageRgb(outputPath, { time: 0.25, x: 952, y: 532 });
      const duringZoom = await sampleAverageRgb(outputPath, { time: 1.1, x: 952, y: 532 });

      expect(beforeZoom.r).toBeGreaterThan(180);
      expect(beforeZoom.g).toBeGreaterThan(180);
      expect(beforeZoom.b).toBeGreaterThan(180);
      expectDominant(duringZoom, "r");
    });
  });

  it("exports cursor click pixels at the expected output position", async () => {
    await withRealProjectRoot((assetPath) => createSolidFixture(assetPath, "black"), async (projectRoot) => {
      const outputPath = join(projectRoot, "cursor-real.mp4");

      await renderFinalToMp4(
        {
          ...shortProject(),
          assets: shortProject().assets.map((asset) => ({
            ...asset,
            width: 320,
            height: 180,
            duration: 2,
          })),
          cursorEvents: [{ time: 1, type: "click", x: 160, y: 90 }],
        },
        {
          projectRoot,
          allowedOutputRoots: [projectRoot],
          outputPath,
        },
      );

      const beforeClick = await sampleAverageRgb(outputPath, { time: 0.25, x: 952, y: 532 });
      const duringClick = await sampleAverageRgb(outputPath, { time: 1.1, x: 952, y: 532 });

      expect(Math.max(beforeClick.r, beforeClick.g, beforeClick.b)).toBeLessThan(40);
      expect(duringClick.r).toBeGreaterThan(150);
      expect(duringClick.g).toBeGreaterThan(110);
      expect(duringClick.b).toBeLessThan(110);
    });
  });

  it("exports cursor click pixels in the padded media area for square output", async () => {
    await withRealProjectRoot((assetPath) => createSolidFixture(assetPath, "black"), async (projectRoot) => {
      const outputPath = join(projectRoot, "cursor-square.mp4");

      await renderFinalToMp4(
        {
          ...shortProject(),
          aspectRatio: "1:1",
          assets: shortProject().assets.map((asset) => ({
            ...asset,
            width: 320,
            height: 180,
            duration: 2,
          })),
          cursorEvents: [{ time: 1, type: "click", x: 160, y: 45 }],
        },
        {
          projectRoot,
          allowedOutputRoots: [projectRoot],
          outputPath,
        },
      );

      const expectedPaddedPosition = await sampleAverageRgb(outputPath, { time: 1.1, x: 532, y: 380 });
      const rawFullFramePosition = await sampleAverageRgb(outputPath, { time: 1.1, x: 532, y: 262 });

      expect(expectedPaddedPosition.r).toBeGreaterThan(150);
      expect(expectedPaddedPosition.g).toBeGreaterThan(110);
      expect(expectedPaddedPosition.b).toBeLessThan(110);
      expect(Math.max(rawFullFramePosition.r, rawFullFramePosition.g, rawFullFramePosition.b)).toBeLessThan(40);
    });
  });

  it("exports cursor click pixels at the camera-transformed position during zoom", async () => {
    await withRealProjectRoot((assetPath) => createSolidFixture(assetPath, "black"), async (projectRoot) => {
      const outputPath = join(projectRoot, "cursor-during-zoom.mp4");

      await renderFinalToMp4(
        {
          ...shortProject(),
          assets: shortProject().assets.map((asset) => ({
            ...asset,
            width: 320,
            height: 180,
            duration: 2,
          })),
          zooms: [
            {
              id: "zoom_left_half",
              start: 0.5,
              end: 1.5,
              target: { x: 0, y: 45, width: 160, height: 90 },
              easing: "linear",
            },
          ],
          cursorEvents: [{ time: 1, type: "click", x: 80, y: 90 }],
        },
        {
          projectRoot,
          allowedOutputRoots: [projectRoot],
          outputPath,
        },
      );

      // Probe inside the full-zoom window (camera static at scale 1.7) so the
      // assertion is robust to +/-1 frame of seek ambiguity during the ramp.
      const transformedPosition = await sampleAverageRgb(outputPath, { time: 1.033, x: 800, y: 525 });
      const unzoomedPosition = await sampleAverageRgb(outputPath, { time: 1.033, x: 472, y: 532 });

      expect(transformedPosition.r).toBeGreaterThan(150);
      expect(transformedPosition.g).toBeGreaterThan(110);
      expect(transformedPosition.b).toBeLessThan(110);
      expect(Math.max(unzoomedPosition.r, unzoomedPosition.g, unzoomedPosition.b)).toBeLessThan(40);
    });
  });

  it("adds camera and cursor filters in the output graph", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const project = {
      ...sampleProject,
      assets: sampleProject.assets.map((asset) =>
        asset.id === "asset_capture_001" ? { ...asset, width: 1280, height: 720 } : asset,
      ),
      cursorEvents: [{ time: 1, type: "click" as const, x: 640, y: 360 }],
      zooms: [
        {
          id: "zoom_source_center",
          start: 1,
          end: 2,
          target: { x: 320, y: 180, width: 640, height: 360 },
          easing: "linear" as const,
        },
      ],
    };

    await withProjectRoot(async (projectRoot) => {
      await renderFinalToMp4(project, {
        projectRoot,
        allowedOutputRoots: [projectRoot],
        outputPath: join(projectRoot, "source-frame.mp4"),
        runCommand: async (command, args) => {
          calls.push({ command, args });
        },
        runProbe: async () => JSON.stringify(probeSummary),
      });
    });

    const filter = filterComplex(calls[0]?.args ?? []);
    expect(filter).toContain("drawbox=");
    expect(filter).toContain("crop=");
    expect(filter).toContain("scale=1920:1080");
    expect(filter).toContain("enable='between(t\\,1\\,1.5)'");
  });

  it("frame-samples zoom ramp easing instead of using one static zoom-window crop", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const project = {
      ...shortProject(),
      assets: shortProject().assets.map((asset) => ({ ...asset, width: 1280, height: 720 })),
      zooms: [
        {
          id: "zoom_ramp",
          start: 0.5,
          end: 1.5,
          target: { x: 320, y: 180, width: 640, height: 360 },
          easing: "easeInOut" as const,
        },
      ],
    };

    await withProjectRoot(async (projectRoot) => {
      await renderFinalToMp4(project, {
        projectRoot,
        allowedOutputRoots: [projectRoot],
        outputPath: join(projectRoot, "ramp-sampled.mp4"),
        runCommand: async (command, args) => {
          calls.push({ command, args });
        },
        runProbe: async () => JSON.stringify(probeSummary),
      });
    });

    const widths = new Set(cropWidths(filterComplex(calls[0]?.args ?? [])));
    expect([...widths].some((width) => width > 960 && width < 1920)).toBe(true);
  });

  it("uses cursor-follow focus when building export camera crops", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const project = {
      ...shortProject(),
      assets: shortProject().assets.map((asset) => ({ ...asset, width: 1280, height: 720 })),
      zooms: [
        {
          id: "zoom_cursor_follow",
          start: 0.5,
          end: 1.5,
          target: { x: 320, y: 180, width: 640, height: 360 },
          easing: "linear" as const,
        },
      ],
      cursorEvents: [{ id: "cursor_follow_right", time: 1, type: "move" as const, x: 1100, y: 360 }],
    };

    await withProjectRoot(async (projectRoot) => {
      await renderFinalToMp4(project, {
        projectRoot,
        allowedOutputRoots: [projectRoot],
        outputPath: join(projectRoot, "cursor-follow-camera.mp4"),
        runCommand: async (command, args) => {
          calls.push({ command, args });
        },
        runProbe: async () => JSON.stringify(probeSummary),
      });
    });

    expect(Math.max(...cropXs(filterComplex(calls[0]?.args ?? [])))).toBeGreaterThan(480);
  });

  it("exports a playable MP4 from real trimmed source media with zoom and click filters", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "tinker-real-export-"));

    try {
      const outputPath = join(outputRoot, "real-source.mp4");
      const result = await renderFinalToMp4(
        {
          ...shortProject(),
          assets: shortProject().assets.map((asset) => ({
            ...asset,
            width: 320,
            height: 180,
            duration: 3,
          })),
          zooms: [
            {
              id: "zoom_real_smoke",
              start: 0.5,
              end: 1.5,
              target: { x: 80, y: 45, width: 160, height: 90 },
              easing: "linear",
            },
          ],
          cursorEvents: [{ time: 1, type: "click", x: 160, y: 90 }],
        },
        {
          projectRoot: fixtureProjectRoot,
          allowedOutputRoots: [outputRoot],
          outputPath,
        },
      );
      const frame = await readRgbFrameBytes(outputPath);

      expect(result.probe.streams.some((stream) => stream.codec_type === "video")).toBe(true);
      expect(result.artifact.width).toBe(1920);
      expect(result.artifact.height).toBe(1080);
      expect(result.artifact.duration).toBeGreaterThanOrEqual(1.9);
      expect(result.artifact.duration).toBeLessThanOrEqual(2.2);
      expect(Math.max(...frame)).toBeGreaterThan(0);
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });
});
