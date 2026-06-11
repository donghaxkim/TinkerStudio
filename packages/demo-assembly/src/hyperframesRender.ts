import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_LINT_TIMEOUT_MS = 120_000;
const DEFAULT_RENDER_TIMEOUT_MS = 600_000;
const TIMEOUT_KILL_GRACE_MS = 5_000;
const TIMEOUT_CLOSE_FALLBACK_MS = 5_000;
const LOG_STREAM_RETAIN_BYTES = 64 * 1024;

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
  stdoutOmittedBytes?: number;
  stderrOmittedBytes?: number;
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

type RetainedOutput = {
  chunks: Buffer[];
  retainedBytes: number;
  omittedBytes: number;
};

function createRetainedOutput(): RetainedOutput {
  return { chunks: [], retainedBytes: 0, omittedBytes: 0 };
}

function appendRetainedOutput(output: RetainedOutput, chunk: Buffer) {
  output.chunks.push(chunk);
  output.retainedBytes += chunk.length;

  while (output.retainedBytes > LOG_STREAM_RETAIN_BYTES) {
    const excessBytes = output.retainedBytes - LOG_STREAM_RETAIN_BYTES;
    const firstChunk = output.chunks[0];
    if (firstChunk === undefined) {
      break;
    }

    if (firstChunk.length <= excessBytes) {
      output.chunks.shift();
      output.retainedBytes -= firstChunk.length;
      output.omittedBytes += firstChunk.length;
    } else {
      output.chunks[0] = firstChunk.subarray(excessBytes);
      output.retainedBytes -= excessBytes;
      output.omittedBytes += excessBytes;
    }
  }
}

function retainedOutputToResult(output: RetainedOutput) {
  return {
    text: Buffer.concat(output.chunks, output.retainedBytes).toString("utf8"),
    omittedBytes: output.omittedBytes,
  };
}

function formatLogStream(name: "stdout" | "stderr", value: string, omittedBytes = 0) {
  const buffer = Buffer.from(value, "utf8");
  const excessBytes = Math.max(0, buffer.length - LOG_STREAM_RETAIN_BYTES);
  const retained = excessBytes > 0 ? buffer.subarray(excessBytes) : buffer;
  const totalOmittedBytes = omittedBytes + excessBytes;
  const text = retained.toString("utf8");

  if (totalOmittedBytes === 0) {
    return text;
  }

  return `[${name} truncated: omitted ${totalOmittedBytes} bytes; retained last ${retained.length} bytes]\n${text}`;
}

function formatLog(result: HyperframesCommandResult) {
  return [
    `status: ${result.status ?? "null"}`,
    `timedOut: ${result.timedOut === true}`,
    `stdout:\n${formatLogStream("stdout", result.stdout, result.stdoutOmittedBytes)}`,
    `stderr:\n${formatLogStream("stderr", result.stderr, result.stderrOmittedBytes)}`,
  ].join("\n\n");
}

function formatError(error: unknown) {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

async function sanitizedHyperframesEnv(hyperframesDir: string) {
  const runnerHome = join(hyperframesDir, ".tinker-hyperframes-runner-home");
  const npmCache = join(hyperframesDir, ".tinker-hyperframes-npm-cache");
  const npmUserconfig = join(hyperframesDir, ".tinker-hyperframes-npmrc");
  await mkdir(runnerHome, { recursive: true });
  await mkdir(npmCache, { recursive: true });

  const allowedNames = new Set(["PATH", "USER", "LOGNAME", "SHELL", "TMPDIR"]);
  const env: NodeJS.ProcessEnv = {};

  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && allowedNames.has(name)) {
      env[name] = value;
    }
  }

  env.HOME = runnerHome;
  env.NPM_CONFIG_CACHE = npmCache;
  env.NPM_CONFIG_USERCONFIG = npmUserconfig;

  return env;
}

async function defaultRunCommand(command: HyperframesCommand): Promise<HyperframesCommandResult> {
  const env = await sanitizedHyperframesEnv(command.cwd);
  return await new Promise((resolve, reject) => {
    const detached = process.platform !== "win32";
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      detached,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = createRetainedOutput();
    const stderr = createRetainedOutput();
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
          resolveOnce({ status: null, ...commandOutput(), timedOut });
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

    function commandOutput() {
      const stdoutResult = retainedOutputToResult(stdout);
      const stderrResult = retainedOutputToResult(stderr);
      return {
        stdout: stdoutResult.text,
        stderr: stderrResult.text,
        ...(stdoutResult.omittedBytes > 0 ? { stdoutOmittedBytes: stdoutResult.omittedBytes } : {}),
        ...(stderrResult.omittedBytes > 0 ? { stderrOmittedBytes: stderrResult.omittedBytes } : {}),
      };
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

    child.stdout.on("data", (chunk) => {
      appendRetainedOutput(stdout, Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8"));
    });
    child.stderr.on("data", (chunk) => {
      appendRetainedOutput(stderr, Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8"));
    });
    child.on("error", (error) => {
      rejectOnce(error);
    });
    child.on("close", (status) => {
      resolveOnce({ status, ...commandOutput(), timedOut });
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
      args: ["--yes", "--package", "hyperframes", "hyperframes", "lint"],
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
      args: ["--yes", "--package", "hyperframes", "hyperframes", "render", "--output", input.outputVideoPath],
      cwd: input.hyperframesDir,
      timeoutMs: effectiveTimeout(input.renderTimeoutMs, DEFAULT_RENDER_TIMEOUT_MS),
      ...timeoutOptions,
    },
    renderLogPath,
    runCommand,
  );

  return { lintLogPath, renderLogPath, outputVideoPath: input.outputVideoPath };
}
