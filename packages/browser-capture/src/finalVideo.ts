// final-video module (first pass)
//
// Produces `final.mp4` from the Playwright recording.
//
// FIRST-PASS SCOPE / HONEST DISCLOSURE:
// This is a straight ffmpeg transcode (webm -> H.264 mp4) of the captured recording.
// It is NOT a faked copy/rename: the smoothness improvement comes from the synthetic
// cursor, click ripples and eased scrolling that are baked INTO the recording during
// capture (see syntheticCursor.ts / smoothScroll.ts). True post-render camera zoom /
// holds described in render-plan.json are intentionally deferred to a later pass —
// this transcode just guarantees a real, playable generated/<run>/final.mp4.
//
// TODO(next pass): consume render-plan.json here (or in @tinker/rendering) to apply
// the planned zoom/hold/clickEffect segments as real camera moves via an ffmpeg
// zoompan/crop filter graph instead of a 1:1 transcode.

import { spawn } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const ABORT_KILL_GRACE_MS = 500;

export type TranscodeToMp4Options = {
  ffmpegPath?: string;
  fps?: number;
  signal?: AbortSignal;
  /** Injectable runner for tests; defaults to spawning ffmpeg. */
  runFfmpeg?: (command: string, args: string[], options: { signal?: AbortSignal }) => Promise<void>;
};

function defaultRunFfmpeg(command: string, args: string[], options: { signal?: AbortSignal } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const detached = process.platform !== "win32";
    const child = spawn(command, args, { detached, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let aborted = options.signal?.aborted ?? false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    function killChild(signal: NodeJS.Signals) {
      if (detached && child.pid !== undefined) {
        try {
          process.kill(-child.pid, signal);
          return;
        } catch {
          // Fall back to direct child kill when process-group kill is unavailable.
        }
      }

      child.kill(signal);
    }

    function destroyStreams() {
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

    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      cleanup();
      reject(aborted ? new DOMException("Transcode cancelled.", "AbortError") : error);
    });
    child.on("close", (code) => {
      cleanup();
      if (aborted) {
        reject(new DOMException("Transcode cancelled.", "AbortError"));
        return;
      }

      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
      }
    });
  });
}

/**
 * Transcode a recording (webm) into an H.264 mp4 at `outputPath`. Returns the output
 * path. The input recording must exist on disk.
 */
export async function transcodeToMp4(
  inputPath: string,
  outputPath: string,
  options: TranscodeToMp4Options = {},
): Promise<string> {
  if (options.signal?.aborted) {
    throw new DOMException("Transcode cancelled.", "AbortError");
  }
  await access(inputPath);
  if (options.signal?.aborted) {
    throw new DOMException("Transcode cancelled.", "AbortError");
  }
  await mkdir(dirname(outputPath), { recursive: true });
  if (options.signal?.aborted) {
    throw new DOMException("Transcode cancelled.", "AbortError");
  }

  const fps = options.fps ?? 30;
  const args = [
    "-y",
    "-i",
    inputPath,
    "-r",
    String(fps),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-an", // captures have no audio track
    outputPath,
  ];

  const run = options.runFfmpeg ?? defaultRunFfmpeg;
  await run(options.ffmpegPath ?? "ffmpeg", args, { signal: options.signal });
  return outputPath;
}
