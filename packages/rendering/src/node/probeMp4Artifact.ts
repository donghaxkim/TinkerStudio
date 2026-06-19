import { spawn } from "node:child_process";

const ABORT_KILL_GRACE_MS = 500;

export type ProbeCommandRunner = (command: string, args: string[], options: { signal?: AbortSignal }) => Promise<string>;

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
  signal?: AbortSignal;
};

export async function probeMp4Artifact(path: string, options: ProbeMp4ArtifactOptions = {}): Promise<ProbedMp4Artifact> {
  if (!path.toLowerCase().endsWith(".mp4")) {
    throw new Error("Export verification only probes MP4 artifacts; path must end in .mp4");
  }
  if (options.signal?.aborted) {
    throw new DOMException("Export verification cancelled.", "AbortError");
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
  ], { signal: options.signal });
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

export async function runSpawnedFfprobeCommand(command: string, args: string[], options: { signal?: AbortSignal } = {}) {
  return new Promise<string>((resolve, reject) => {
    const detached = process.platform !== "win32";
    const child = spawn(command, args, { detached, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let aborted = options.signal?.aborted ?? false;
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

      child.kill(signal);
    }

    function destroyStreams() {
      child.stdout?.destroy();
      child.stderr?.destroy();
    }

    function cleanup() {
      options.signal?.removeEventListener("abort", onAbort);
      if (killTimer !== undefined) {
        clearTimeout(killTimer);
        killTimer = undefined;
      }
    }

    const onAbort = () => {
      aborted = true;
      destroyStreams();
      killChild("SIGTERM");
      killTimer ??= setTimeout(() => {
        destroyStreams();
        killChild("SIGKILL");
      }, ABORT_KILL_GRACE_MS);
      killTimer.unref?.();
    };

    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (aborted) {
      killChild("SIGTERM");
    }

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      cleanup();
      reject(aborted ? new DOMException("Export verification cancelled.", "AbortError") : error);
    });
    child.on("close", (code) => {
      cleanup();
      if (aborted) {
        reject(new DOMException("Export verification cancelled.", "AbortError"));
        return;
      }

      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(`${command} exited with ${code ?? "unknown code"}: ${stderr.trim()}`));
    });
  });
}
