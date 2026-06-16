import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import type { DemoProject } from "@tinker/project-schema";
import { buildFinalRenderPlan, type FinalRenderPlan } from "../renderFinal.js";
import { preflightExportAssets } from "./assetResolution.js";
import { writeDefaultCursorPng } from "./cursorPng.js";
import { freezeExportProjectSnapshot } from "./exportSnapshot.js";
import { buildRealMediaFilterGraph, type FfmpegFilterGraph } from "./ffmpegFilterGraph.js";
import { probeMp4Artifact, type ProbeCommandRunner, type ProbedMp4Artifact } from "./probeMp4Artifact.js";

export type CommandRunner = (command: string, args: string[]) => Promise<void>;

export type RenderFinalToMp4Options = {
  outputPath: string;
  projectRoot: string;
  allowedOutputRoots: string[];
  allowedInputRoots?: string[];
  ffmpegPath?: string;
  ffprobePath?: string;
  runCommand?: CommandRunner;
  runProbe?: ProbeCommandRunner;
};

export type RenderedMp4Artifact = {
  path: string;
  mimeType: "video/mp4";
  width: number;
  height: number;
  duration: number;
};

export type RenderFinalToMp4Result = {
  artifact: RenderedMp4Artifact;
  plan: FinalRenderPlan;
  probe: ProbedMp4Artifact;
};

export async function renderFinalToMp4(project: DemoProject, options: RenderFinalToMp4Options): Promise<RenderFinalToMp4Result> {
  const snapshot = freezeExportProjectSnapshot(project);
  const outputPath = resolve(options.outputPath);

  if (!outputPath.toLowerCase().endsWith(".mp4")) {
    throw new Error("Export v0 only writes MP4 artifacts; outputPath must end in .mp4");
  }

  validateExportOutputPath(outputPath, options.allowedOutputRoots);

  const resolutions = await preflightExportAssets(snapshot, {
    projectRoot: options.projectRoot,
    allowedRoots: options.allowedInputRoots,
    consumer: "export",
  });
  const plan = buildFinalRenderPlan(snapshot, { fileName: basename(outputPath) });
  const renderTempRoot = await mkdtemp(join(tmpdir(), "tinker-render-"));
  const runCommand = options.runCommand ?? runSpawnedFfmpegCommand;
  let primaryError: unknown;

  try {
    const cursorImage = await writeDefaultCursorPng(renderTempRoot);
    const graph = buildRealMediaFilterGraph(snapshot, plan, resolutions, { cursorImage });
    const args = buildFfmpegArgs(plan, graph, outputPath);

    await mkdir(dirname(outputPath), { recursive: true });
    await runCommand(options.ffmpegPath ?? "ffmpeg", args);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      await rm(renderTempRoot, { recursive: true, force: true });
    } catch (cleanupError) {
      if (!primaryError) {
        throw cleanupError;
      }
    }
  }

  const probe = await probeMp4Artifact(outputPath, {
    ffprobePath: options.ffprobePath,
    runCommand: options.runProbe,
  });
  const probedDuration = Number(probe.format.duration);

  return {
    artifact: {
      path: outputPath,
      mimeType: "video/mp4",
      width: plan.output.width,
      height: plan.output.height,
      duration: Number.isFinite(probedDuration) && probedDuration > 0 ? probedDuration : plan.timeline.duration,
    },
    plan,
    probe,
  };
}

function validateExportOutputPath(outputPath: string, allowedOutputRoots: string[] | undefined) {
  if (!allowedOutputRoots || allowedOutputRoots.length === 0) {
    throw new Error("Export output requires at least one allowed output root");
  }

  const normalizedRoots = allowedOutputRoots.map((root) => resolve(root));
  const isAllowed = normalizedRoots.some((root) => isPathInsideRoot(outputPath, root));

  if (!isAllowed) {
    throw new Error("Export output path resolves outside allowed export output roots");
  }
}

function isPathInsideRoot(path: string, root: string) {
  const fromRoot = relative(root, path);
  return fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot));
}

function buildFfmpegArgs(plan: FinalRenderPlan, graph: FfmpegFilterGraph, outputPath: string): string[] {
  return [
    "-y",
    ...graph.inputs.flatMap((input) => ["-i", input.path]),
    "-filter_complex",
    graph.filterComplex,
    "-map",
    `[${graph.outputLabel}]`,
    "-t",
    String(plan.timeline.duration),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputPath,
  ];
}

function basename(path: string) {
  const normalized = path.replace(/\\/g, "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

export async function runSpawnedFfmpegCommand(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
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

      reject(new Error(`${command} exited with ${code ?? "unknown code"}: ${stderr.trim()}`));
    });
  });
}
