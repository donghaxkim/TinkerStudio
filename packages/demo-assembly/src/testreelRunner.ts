import { spawn } from "node:child_process";
import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { TestreelGenerationPlan } from "./testreelPlan.js";

export type RunTestreelCli = (args: string[], options?: { signal?: AbortSignal }) => Promise<{ stdout: string; stderr: string }>;
export type SpawnedTestreelCliCommand = { command: string; argsPrefix: string[]; cwd: string };
export type RunTestreelRecordingInput = {
  testreelRoot: string;
  plan: TestreelGenerationPlan;
  signal?: AbortSignal;
  runCli?: RunTestreelCli;
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

function abortError() {
  return new DOMException("Testreel recording aborted.", "AbortError");
}

function trimProcessError(stderr: string) {
  return stderr.replace(/\s+/g, " ").trim().slice(0, 500);
}

export function createSpawnedTestreelCliRunner(command: SpawnedTestreelCliCommand): RunTestreelCli {
  return (args, options) =>
    new Promise((resolve, reject) => {
      if (options?.signal?.aborted) {
        reject(abortError());
        return;
      }

      const child = spawn(command.command, [...command.argsPrefix, ...args], {
        cwd: command.cwd,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      let aborted = false;

      function settle(error?: unknown) {
        if (settled) return;
        settled = true;
        options?.signal?.removeEventListener("abort", abort);
        if (error !== undefined) reject(error);
      }

      function killChild(signal: NodeJS.Signals = "SIGTERM") {
        if (process.platform !== "win32" && child.pid !== undefined) {
          try {
            process.kill(-child.pid, signal);
            return;
          } catch {
            child.kill(signal);
            return;
          }
        }
        child.kill(signal);
      }

      function abort() {
        aborted = true;
        killChild();
      }
      options?.signal?.addEventListener("abort", abort, { once: true });

      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr?.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", (error) => settle(error));
      child.on("close", (code) => {
        if (settled) return;
        options?.signal?.removeEventListener("abort", abort);
        if (aborted) {
          reject(abortError());
          return;
        }
        if (code !== 0) {
          reject(new Error(`Testreel failed with exit code ${code}: ${trimProcessError(stderr)}`));
          return;
        }
        settled = true;
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

async function selectMp4(outputDirectory: string) {
  const files = await listFiles(outputDirectory);
  const mp4s = files.filter((file) => file.toLowerCase().endsWith(".mp4"));
  if (mp4s.length === 0) throw new Error("Testreel completed without producing an MP4");
  const withStats = await Promise.all(mp4s.map(async (path) => ({ path, stat: await stat(path) })));
  withStats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs || a.path.localeCompare(b.path));
  return withStats[0]!.path;
}

export async function runTestreelRecording(input: RunTestreelRecordingInput): Promise<RunTestreelRecordingResult> {
  const runCli = input.runCli ?? defaultTestreelCli();
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
  const selectedMp4 = await selectMp4(outputDirectory);
  if (selectedMp4 !== finalVideoPath) await copyFile(selectedMp4, finalVideoPath);
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
    stdout: [validation.stdout, recording.stdout].filter(Boolean).join("\n"),
    stderr: [validation.stderr, recording.stderr].filter(Boolean).join("\n"),
  };
}
