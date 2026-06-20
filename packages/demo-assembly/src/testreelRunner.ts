import { spawn } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { TestreelGenerationPlan } from "./testreelPlan.js";

export type RunTestreelCli = (args: string[], options?: { signal?: AbortSignal }) => Promise<{ stdout: string; stderr: string }>;
export type RunFfmpegCli = (args: string[], options?: { signal?: AbortSignal }) => Promise<{ stdout: string; stderr: string }>;
export type SpawnedTestreelCliCommand = { command: string; argsPrefix: string[]; cwd: string };
export type RunTestreelRecordingInput = {
  testreelRoot: string;
  plan: TestreelGenerationPlan;
  signal?: AbortSignal;
  runCli?: RunTestreelCli;
  runFfmpeg?: RunFfmpegCli;
  onPhase?: (phase: "verification" | "capture" | "assembly") => void;
};
export type RunTestreelRecordingResult = {
  recordingPlanPath: string;
  recordingPath: string;
  outputDirectory: string;
  finalVideoPath: string;
  manifestPath?: string;
  screenshotPaths: string[];
  artifactPaths: string[];
  stdout: string;
  stderr: string;
};

const ABORT_KILL_GRACE_MS = 500;

function toPrettyJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function resolveTestreelCliPath() {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve("testreel")), "cli.cjs");
}

function defaultTestreelCli(): RunTestreelCli {
  return createSpawnedTestreelCliRunner({ command: process.execPath, argsPrefix: [resolveTestreelCliPath()], cwd: process.cwd() });
}

function defaultFfmpegCli(): RunFfmpegCli {
  return createSpawnedFfmpegRunner(process.env.FFMPEG_PATH ?? "ffmpeg");
}

function abortError() {
  return new DOMException("Testreel recording aborted.", "AbortError");
}

function trimProcessError(stderr: string) {
  return stderr.replace(/\s+/g, " ").trim().slice(0, 500);
}

export function createSpawnedTestreelCliRunner(command: SpawnedTestreelCliCommand): RunTestreelCli {
  return (args, options) =>
    runSpawnedCli({
      command: command.command,
      args: [...command.argsPrefix, ...args],
      cwd: command.cwd,
      failureLabel: "Testreel",
      signal: options?.signal,
    });
}

function createSpawnedFfmpegRunner(command: string): RunFfmpegCli {
  return (args, options) => runSpawnedCli({ command, args, failureLabel: "ffmpeg", signal: options?.signal });
}

function runSpawnedCli(input: { command: string; args: string[]; cwd?: string; failureLabel: string; signal?: AbortSignal }) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    if (input.signal?.aborted) {
      reject(abortError());
      return;
    }

    const detached = process.platform !== "win32";
    const child = spawn(input.command, input.args, { cwd: input.cwd, detached, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let aborted = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    function killChild(signal: NodeJS.Signals) {
      if (detached && child.pid !== undefined) {
        try {
          process.kill(-child.pid, signal);
          return;
        } catch {
          // Fall back to the direct child when process-group kill is unavailable.
        }
      }

      try {
        child.kill(signal);
      } catch {
        // The process may have exited between abort callbacks.
      }
    }

    function destroyStreams() {
      child.stdout?.destroy();
      child.stderr?.destroy();
    }

    function cleanup() {
      input.signal?.removeEventListener("abort", abort);
      if (killTimer !== undefined) {
        clearTimeout(killTimer);
        killTimer = undefined;
      }
    }

    function abort() {
      if (aborted) return;
      aborted = true;
      destroyStreams();
      killChild("SIGTERM");
      killTimer = setTimeout(() => {
        destroyStreams();
        killChild("SIGKILL");
      }, ABORT_KILL_GRACE_MS);
      killTimer.unref?.();
    }

    input.signal?.addEventListener("abort", abort, { once: true });

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(aborted ? abortError() : error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (aborted) {
        reject(abortError());
        return;
      }
      if (code !== 0) {
        reject(new Error(`${input.failureLabel} failed with exit code ${code}: ${trimProcessError(stderr)}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function readManifestVideo(outputDirectory: string) {
  const manifestPath = join(outputDirectory, "output.json");
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { video?: unknown };
    return typeof manifest.video === "string" && manifest.video.trim() !== "" ? join(outputDirectory, manifest.video) : undefined;
  } catch {
    return undefined;
  }
}

async function selectVideo(outputDirectory: string) {
  const files = await listFiles(outputDirectory);
  const mp4s = files.filter((file) => file.toLowerCase().endsWith(".mp4"));
  const manifestVideo = await readManifestVideo(outputDirectory);
  if (mp4s.length === 0 && manifestVideo !== undefined) return manifestVideo;
  if (mp4s.length === 0) throw new Error("Testreel completed without producing an MP4 or convertible video");
  const withStats = await Promise.all(mp4s.map(async (path) => ({ path, stat: await stat(path) })));
  withStats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs || a.path.localeCompare(b.path));
  return withStats[0]!.path;
}

async function ensureFinalMp4(input: { sourceVideoPath: string; finalVideoPath: string; runFfmpeg: RunFfmpegCli; signal?: AbortSignal }) {
  let result = { stdout: "", stderr: "" };
  if (input.sourceVideoPath.toLowerCase().endsWith(".mp4")) {
    if (input.sourceVideoPath !== input.finalVideoPath) await copyFile(input.sourceVideoPath, input.finalVideoPath);
  } else {
    result = await input.runFfmpeg(
      ["-y", "-loglevel", "error", "-i", input.sourceVideoPath, "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", input.finalVideoPath],
      { signal: input.signal },
    );
  }

  const finalVideo = await stat(input.finalVideoPath).catch(() => undefined);
  if (finalVideo === undefined || finalVideo.size === 0) {
    throw new Error(`Testreel assembly failed to create non-empty final.mp4 at ${input.finalVideoPath}`);
  }
  return result;
}

export async function runTestreelRecording(input: RunTestreelRecordingInput): Promise<RunTestreelRecordingResult> {
  const runCli = input.runCli ?? defaultTestreelCli();
  const runFfmpeg = input.runFfmpeg ?? defaultFfmpegCli();
  const recordingPlanPath = join(input.testreelRoot, "recording-plan.json");
  const recordingPath = join(input.testreelRoot, "recording.json");
  const outputDirectory = join(input.testreelRoot, "output");
  const finalVideoPath = join(input.testreelRoot, "final.mp4");
  await mkdir(input.testreelRoot, { recursive: true });
  await writeFile(recordingPlanPath, toPrettyJson(input.plan));
  await writeFile(recordingPath, toPrettyJson(input.plan.definition));

  input.onPhase?.("verification");
  const validation = await runCli(["validate", recordingPath, "--quiet"], { signal: input.signal });

  input.onPhase?.("capture");
  const recording = await runCli([recordingPath, "--output", outputDirectory, "--format", "mp4", "--clean", "--quiet"], { signal: input.signal });

  input.onPhase?.("assembly");
  const selectedVideo = await selectVideo(outputDirectory);
  const finalization = await ensureFinalMp4({ sourceVideoPath: selectedVideo, finalVideoPath, runFfmpeg, signal: input.signal });
  const files = await listFiles(outputDirectory);
  const manifestPath = files.find((file) => file.endsWith("output.json"));
  const screenshotPaths = files.filter((file) => file.toLowerCase().endsWith(".png"));
  const artifactPaths = [recordingPlanPath, recordingPath, ...(manifestPath ? [manifestPath] : []), ...screenshotPaths, finalVideoPath];

  return {
    recordingPlanPath,
    recordingPath,
    outputDirectory,
    finalVideoPath,
    ...(manifestPath ? { manifestPath } : {}),
    screenshotPaths,
    artifactPaths,
    stdout: [validation.stdout, recording.stdout, finalization.stdout].filter(Boolean).join("\n"),
    stderr: [validation.stderr, recording.stderr, finalization.stderr].filter(Boolean).join("\n"),
  };
}
