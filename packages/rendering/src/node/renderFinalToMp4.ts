import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import type { DemoProject } from "@tinker/project-schema";
import { buildFinalRenderPlan, type FinalRenderPlan, type RenderLayer } from "../renderFinal.js";

export type CommandRunner = (command: string, args: string[]) => Promise<void>;

export type RenderFinalToMp4Options = {
  outputPath: string;
  ffmpegPath?: string;
  runCommand?: CommandRunner;
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
};

export async function renderFinalToMp4(project: DemoProject, options: RenderFinalToMp4Options): Promise<RenderFinalToMp4Result> {
  if (!options.outputPath.toLowerCase().endsWith(".mp4")) {
    throw new Error("Export v0 only writes MP4 artifacts; outputPath must end in .mp4");
  }

  const plan = buildFinalRenderPlan(project, { fileName: basename(options.outputPath) });
  const args = buildFfmpegArgs(plan, options.outputPath);
  const runCommand = options.runCommand ?? runSpawnedCommand;

  await mkdir(dirname(options.outputPath), { recursive: true });
  await runCommand(options.ffmpegPath ?? "ffmpeg", args);

  return {
    artifact: {
      path: options.outputPath,
      mimeType: "video/mp4",
      width: plan.output.width,
      height: plan.output.height,
      duration: plan.timeline.duration,
    },
    plan,
  };
}

function buildFfmpegArgs(plan: FinalRenderPlan, outputPath: string): string[] {
  return [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=#0f172a:s=${plan.output.width}x${plan.output.height}:r=${plan.timeline.fps}:d=${plan.timeline.duration}`,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-vf",
    buildVideoFilter(plan),
    "-shortest",
    "-t",
    String(plan.timeline.duration),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    outputPath,
  ];
}

function buildVideoFilter(plan: FinalRenderPlan) {
  const filters = [
    "drawbox=x=0:y=0:w=iw:h=120:color=#020617@0.95:t=fill",
    "drawbox=x=48:y=40:w=420:h=40:color=#2563eb@0.80:t=fill",
    "drawbox=x=48:y=88:w=260:h=16:color=#93c5fd@0.80:t=fill",
    ...plan.layers.flatMap((layer) => layerToFilters(layer, plan)),
  ];

  return filters.join(",");
}

function layerToFilters(layer: RenderLayer, plan: FinalRenderPlan) {
  if (layer.kind === "caption") {
    return [
      `drawbox=x=${Math.round(plan.output.width * 0.18)}:y=${plan.output.height - 180}:w=${Math.round(plan.output.width * 0.64)}:h=92:color=#000000@0.65:t=fill:enable='between(t,${layer.start},${layer.end})'`,
      `drawbox=x=${Math.round(plan.output.width * 0.22)}:y=${plan.output.height - 136}:w=${Math.round(plan.output.width * 0.56)}:h=12:color=#ffffff@0.90:t=fill:enable='between(t,${layer.start},${layer.end})'`,
    ];
  }

  if (layer.kind === "callout") {
    return [
      `drawbox=x=${plan.output.width - 520}:y=132:w=448:h=96:color=#78350f@0.75:t=fill:enable='between(t,${layer.start},${layer.end})'`,
      `drawbox=x=${plan.output.width - 488}:y=176:w=384:h=10:color=#fde68a@0.95:t=fill:enable='between(t,${layer.start},${layer.end})'`,
    ];
  }

  if (layer.kind === "zoom") {
    const rect = scaleRect(layer.target, plan);
    return [
      `drawbox=x=${rect.x}:y=${rect.y}:w=${rect.width}:h=${rect.height}:color=#38bdf8@0.75:t=5:enable='between(t,${layer.start},${layer.end})'`,
    ];
  }

  if (layer.kind === "cursor") {
    const x = Math.round((layer.x / 1920) * plan.output.width);
    const y = Math.round((layer.y / 1080) * plan.output.height);
    const size = layer.eventType === "click" ? 30 : 20;
    const color = layer.eventType === "click" ? "#fbbf24@0.90" : "#e2e8f0@0.70";
    return [
      `drawbox=x=${x - Math.round(size / 2)}:y=${y - Math.round(size / 2)}:w=${size}:h=${size}:color=${color}:t=fill:enable='between(t,${layer.start},${layer.end})'`,
    ];
  }

  if (layer.kind === "video") {
    return [
      `drawbox=x=56:y=${plan.output.height - 72}:w=360:h=18:color=#94a3b8@0.75:t=fill:enable='between(t,${layer.start},${layer.end})'`,
    ];
  }

  return [];
}

function scaleRect(rect: { x: number; y: number; width: number; height: number }, plan: FinalRenderPlan) {
  return {
    x: Math.round((rect.x / 1920) * plan.output.width),
    y: Math.round((rect.y / 1080) * plan.output.height),
    width: Math.round((rect.width / 1920) * plan.output.width),
    height: Math.round((rect.height / 1080) * plan.output.height),
  };
}

function basename(path: string) {
  const normalized = path.replace(/\\/g, "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

async function runSpawnedCommand(command: string, args: string[]) {
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
