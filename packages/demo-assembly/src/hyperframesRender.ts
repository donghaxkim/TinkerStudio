import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_LINT_TIMEOUT_MS = 120_000;
const DEFAULT_RENDER_TIMEOUT_MS = 600_000;
const TIMEOUT_KILL_GRACE_MS = 5_000;

export type HyperframesCommand = {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
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
    const child = spawn(command.command, command.args, { cwd: command.cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let killTimeout: ReturnType<typeof setTimeout> | undefined;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimeout = setTimeout(() => {
        child.kill("SIGKILL");
        resolveOnce({ status: null, stdout, stderr, timedOut });
      }, TIMEOUT_KILL_GRACE_MS);
    }, command.timeoutMs);

    function clearTimers() {
      clearTimeout(timeout);
      if (killTimeout !== undefined) {
        clearTimeout(killTimeout);
      }
    }

    function resolveOnce(result: HyperframesCommandResult) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimers();
      resolve(result);
    }

    function rejectOnce(error: Error) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimers();
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

  await runAndLogCommand(
    "lint",
    {
      command: "npx",
      args: ["hyperframes", "lint"],
      cwd: input.hyperframesDir,
      timeoutMs: effectiveTimeout(input.lintTimeoutMs, DEFAULT_LINT_TIMEOUT_MS),
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
    },
    renderLogPath,
    runCommand,
  );

  return { lintLogPath, renderLogPath, outputVideoPath: input.outputVideoPath };
}
