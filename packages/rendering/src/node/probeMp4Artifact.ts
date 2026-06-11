import { spawn } from "node:child_process";

export type ProbeCommandRunner = (command: string, args: string[]) => Promise<string>;

export type ProbedMp4Stream = {
  codec_name?: string;
  codec_type?: "video" | "audio" | string;
};

export type ProbedMp4Format = {
  format_name?: string;
  duration?: string;
};

export type ProbedMp4Artifact = {
  streams: ProbedMp4Stream[];
  format: ProbedMp4Format;
};

export type ProbeMp4ArtifactOptions = {
  ffprobePath?: string;
  runCommand?: ProbeCommandRunner;
};

export async function probeMp4Artifact(path: string, options: ProbeMp4ArtifactOptions = {}): Promise<ProbedMp4Artifact> {
  if (!path.toLowerCase().endsWith(".mp4")) {
    throw new Error("Export verification only probes MP4 artifacts; path must end in .mp4");
  }

  const runCommand = options.runCommand ?? runSpawnedFfprobeCommand;
  const output = await runCommand(options.ffprobePath ?? "ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=format_name,duration",
    "-show_entries",
    "stream=codec_name,codec_type",
    "-of",
    "json",
    path,
  ]);
  const parsed = parseFfprobeJson(output);
  const artifact = {
    streams: Array.isArray(parsed.streams) ? parsed.streams : [],
    format: parsed.format ?? {},
  };

  validateProbedMp4Artifact(artifact);
  return artifact;
}

function parseFfprobeJson(output: string): ProbedMp4Artifact {
  let parsed: unknown;

  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("Export verification expected valid ffprobe JSON output");
  }

  if (!isJsonObject(parsed)) {
    throw new Error("Export verification expected valid ffprobe JSON output");
  }

  return parsed as ProbedMp4Artifact;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateProbedMp4Artifact(artifact: ProbedMp4Artifact) {
  const formatName = artifact.format.format_name ?? "";
  const duration = Number(artifact.format.duration);
  const hasMp4Container = formatName.split(",").some((name) => name.trim() === "mp4");
  const hasVideoStream = artifact.streams.some((stream) => stream.codec_type === "video");

  if (!hasMp4Container || !Number.isFinite(duration) || duration <= 0 || !hasVideoStream) {
    throw new Error("Export verification expected a valid MP4 artifact with positive duration and a video stream");
  }
}

export async function runSpawnedFfprobeCommand(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(`${command} exited with ${code ?? "unknown code"}: ${stderr.trim()}`));
    });
  });
}
