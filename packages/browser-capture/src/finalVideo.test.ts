import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { chmod, mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transcodeToMp4 } from "./finalVideo.js";

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

function assertProcessExited(pidPath: string) {
  const pid = Number.parseInt(readFileSync(pidPath, "utf8"), 10);
  assert.throws(() => process.kill(pid, 0));
}

const root = await mkdtemp(join(tmpdir(), "tinker-final-video-"));

try {
  const inputPath = join(root, "capture.webm");
  const outputPath = join(root, "out", "final.mp4");
  const controller = new AbortController();
  await mkdir(join(root, "out"), { recursive: true });
  await writeFile(inputPath, "fake webm bytes");

  await assert.rejects(
    () =>
      transcodeToMp4(inputPath, outputPath, {
        signal: controller.signal,
        runFfmpeg: async (_command, _args, options) => {
          assert.equal(options.signal, controller.signal);
          controller.abort();
          throw new DOMException("Transcode cancelled.", "AbortError");
        },
      }),
    (error) => error instanceof DOMException && error.name === "AbortError",
  );
} finally {
  await rm(root, { recursive: true, force: true });
}

if (process.platform !== "win32") {
  const abortRoot = await mkdtemp(join(tmpdir(), "tinker-final-video-ignore-sigterm-"));
  const inputPath = join(abortRoot, "capture.webm");
  const outputPath = join(abortRoot, "out", "final.mp4");
  const fakeFfmpegPath = join(abortRoot, "ffmpeg");
  const pidPath = join(abortRoot, "pid.txt");
  const sigtermPath = join(abortRoot, "sigterm.txt");
  const controller = new AbortController();
  let runPromise: Promise<string> | undefined;

  try {
    await mkdir(join(abortRoot, "out"), { recursive: true });
    await writeFile(inputPath, "fake webm bytes");
    await writeFile(
      fakeFfmpegPath,
      [
        "#!/usr/bin/env node",
        "const { writeFileSync } = require('node:fs');",
        `writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));`,
        `process.on('SIGTERM', () => { writeFileSync(${JSON.stringify(sigtermPath)}, 'SIGTERM'); });`,
        "setInterval(() => {}, 1000);",
      ].join("\n"),
    );
    await chmod(fakeFfmpegPath, 0o755);

    runPromise = transcodeToMp4(inputPath, outputPath, {
      ffmpegPath: fakeFfmpegPath,
      signal: controller.signal,
    });
    await waitForPath(pidPath);
    controller.abort();

    await assert.rejects(expectWithin(runPromise, 2_000), (error) => error instanceof DOMException && error.name === "AbortError");
    assert.equal(existsSync(sigtermPath), true);
    assertProcessExited(pidPath);
  } finally {
    killProcessFromPidFile(pidPath);
    await runPromise?.catch(() => undefined);
    await rm(abortRoot, { recursive: true, force: true });
  }
}

console.log("final video tests passed");
