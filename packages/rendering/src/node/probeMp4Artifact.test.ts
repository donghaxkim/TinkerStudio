import { existsSync, readFileSync } from "node:fs";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { probeMp4Artifact, runSpawnedFfprobeCommand } from "./probeMp4Artifact.js";

async function waitForPath(path: string) {
  const startedAt = Date.now();
  while (!existsSync(path)) {
    if (Date.now() - startedAt > 2_000) {
      throw new Error(`Timed out waiting for ${path}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function expectWithin<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    }),
  ]);
}

function killProcessFromPidFile(pidPath: string) {
  if (!existsSync(pidPath)) return;
  const pid = Number.parseInt(readFileSync(pidPath, "utf8"), 10);
  if (!Number.isFinite(pid)) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already exited.
    }
  }
}

function expectProcessExited(pidPath: string) {
  const pid = Number.parseInt(readFileSync(pidPath, "utf8"), 10);
  expect(() => process.kill(pid, 0)).toThrow();
}

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

  it("settles as AbortError and kills spawned ffprobe when SIGTERM is ignored", async () => {
    if (process.platform === "win32") return;

    const root = await mkdtemp(join(tmpdir(), "tinker-ffprobe-abort-"));
    const fakeFfprobePath = join(root, "ffprobe");
    const pidPath = join(root, "pid.txt");
    const sigtermPath = join(root, "sigterm.txt");
    const controller = new AbortController();
    let runPromise: Promise<string> | undefined;

    try {
      await writeFile(
        fakeFfprobePath,
        [
          "#!/usr/bin/env node",
          "const { writeFileSync } = require('node:fs');",
          `writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));`,
          `process.on('SIGTERM', () => { writeFileSync(${JSON.stringify(sigtermPath)}, 'SIGTERM'); });`,
          "setInterval(() => {}, 1000);",
        ].join("\n"),
      );
      await chmod(fakeFfprobePath, 0o755);

      runPromise = runSpawnedFfprobeCommand(fakeFfprobePath, [], { signal: controller.signal });
      await waitForPath(pidPath);
      controller.abort();

      await expect(expectWithin(runPromise, 2_000)).rejects.toMatchObject({ name: "AbortError" });
      expect(existsSync(sigtermPath)).toBe(true);
      expectProcessExited(pidPath);
    } finally {
      killProcessFromPidFile(pidPath);
      await runPromise?.catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  });
});
