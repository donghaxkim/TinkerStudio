import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_LINT_TIMEOUT_MS = 120_000;
const DEFAULT_RENDER_TIMEOUT_MS = 600_000;
const TIMEOUT_KILL_GRACE_MS = 5_000;
const TIMEOUT_CLOSE_FALLBACK_MS = 5_000;

export type HyperframesCommand = {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  timeoutKillGraceMs?: number;
  timeoutCloseFallbackMs?: number;
};

export type HyperframesCommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
};

export type HyperframesCommandRun = (command: HyperframesCommand) => Promise<HyperframesCommandResult>;

export type RunHyperframesRenderInput = {
  hyperframesDir: string;
  outputVideoPath: string;
  runCommand?: HyperframesCommandRun;
  lintTimeoutMs?: number;
  renderTimeoutMs?: number;
  timeoutKillGraceMs?: number;
  timeoutCloseFallbackMs?: number;
};

export type RunHyperframesRenderResult = {
  lintLogPath: string;
  renderLogPath: string;
  outputVideoPath: string;
};

function effectiveTimeout(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function formatLog(result: HyperframesCommandResult) {
  return [`status: ${result.status ?? "null"}`, `timedOut: ${result.timedOut === true}`, `stdout:\n${result.stdout}`, `stderr:\n${result.stderr}`].join("\n\n");
}

function formatError(error: unknown) {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

async function defaultRunCommand(command: HyperframesCommand): Promise<HyperframesCommandResult> {
  return await new Promise((resolve, reject) => {
    const detached = process.platform !== "win32";
    const child = spawn(command.command, command.args, { cwd: command.cwd, detached, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let killTimeout: ReturnType<typeof setTimeout> | undefined;
    let closeFallbackTimeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutKillGraceMs = effectiveTimeout(command.timeoutKillGraceMs, TIMEOUT_KILL_GRACE_MS);
    const timeoutCloseFallbackMs = effectiveTimeout(command.timeoutCloseFallbackMs, TIMEOUT_CLOSE_FALLBACK_MS);
    const timeout = setTimeout(() => {
      timedOut = true;
      killChild("SIGTERM");
      killTimeout = setTimeout(() => {
        killChild("SIGKILL");
        // Prefer close for flushed streams; this fallback breaks inherited pipe hangs.
        closeFallbackTimeout = setTimeout(() => {
          destroyStreams();
          resolveOnce({ status: null, stdout, stderr, timedOut });
        }, timeoutCloseFallbackMs);
      }, timeoutKillGraceMs);
    }, command.timeoutMs);

    function killChild(signal: NodeJS.Signals) {
      if (detached && child.pid !== undefined) {
        try {
          process.kill(-child.pid, signal);
          return;
        } catch {
          // Fall back to the direct child below when process-group kill is unavailable.
        }
      }

      try {
        child.kill(signal);
      } catch {
        // The process may have already exited between timeout callbacks.
      }
    }

    function clearTimers() {
      clearTimeout(timeout);
      if (killTimeout !== undefined) {
        clearTimeout(killTimeout);
      }
      if (closeFallbackTimeout !== undefined) {
        clearTimeout(closeFallbackTimeout);
      }
    }

    function cleanupListeners() {
      child.stdout.removeAllListeners("data");
      child.stderr.removeAllListeners("data");
      child.removeAllListeners("close");
      child.removeAllListeners("error");
    }

    function destroyStreams() {
      child.stdout.destroy();
      child.stderr.destroy();
    }

    function resolveOnce(result: HyperframesCommandResult) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimers();
      cleanupListeners();
      resolve(result);
    }

    function rejectOnce(error: Error) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimers();
      cleanupListeners();
      reject(error);
    }

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      rejectOnce(error);
    });
    child.on("close", (status) => {
      resolveOnce({ status, stdout, stderr, timedOut });
    });
  });
}

function timeoutOptionFields(input: RunHyperframesRenderInput) {
  return {
    ...(input.timeoutKillGraceMs !== undefined ? { timeoutKillGraceMs: input.timeoutKillGraceMs } : {}),
    ...(input.timeoutCloseFallbackMs !== undefined ? { timeoutCloseFallbackMs: input.timeoutCloseFallbackMs } : {}),
  };
}

async function runAndLogCommand(step: "lint" | "render", command: HyperframesCommand, logPath: string, runCommand: HyperframesCommandRun) {
  let result: HyperframesCommandResult;
  try {
    result = await runCommand(command);
  } catch (error) {
    result = { status: null, stdout: "", stderr: formatError(error) };
  }

  await writeFile(logPath, `${formatLog(result)}\n`);
  if (result.timedOut || result.status !== 0) {
    const timeoutDetail = result.timedOut ? " (timed out)" : "";
    throw new Error(`Hyperframes ${step} failed${timeoutDetail}; see ${logPath}`);
  }
}

export async function runHyperframesRender(input: RunHyperframesRenderInput): Promise<RunHyperframesRenderResult> {
  const runCommand = input.runCommand ?? defaultRunCommand;
  const lintLogPath = join(input.hyperframesDir, "lint.log");
  const renderLogPath = join(input.hyperframesDir, "render.log");
  const timeoutOptions = timeoutOptionFields(input);

  await runAndLogCommand(
    "lint",
    {
      command: "npx",
      args: ["hyperframes", "lint"],
      cwd: input.hyperframesDir,
      timeoutMs: effectiveTimeout(input.lintTimeoutMs, DEFAULT_LINT_TIMEOUT_MS),
      ...timeoutOptions,
    },
    lintLogPath,
    runCommand,
  );

  await runAndLogCommand(
    "render",
    {
      command: "npx",
      args: ["hyperframes", "render", "--output", input.outputVideoPath],
      cwd: input.hyperframesDir,
      timeoutMs: effectiveTimeout(input.renderTimeoutMs, DEFAULT_RENDER_TIMEOUT_MS),
      ...timeoutOptions,
    },
    renderLogPath,
    runCommand,
  );

  return { lintLogPath, renderLogPath, outputVideoPath: input.outputVideoPath };
}
