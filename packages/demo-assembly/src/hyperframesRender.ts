import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_LINT_TIMEOUT_MS = 120_000;
const DEFAULT_RENDER_TIMEOUT_MS = 600_000;

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
  return [`stdout:\n${result.stdout}`, `stderr:\n${result.stderr}`].join("\n\n");
}

async function defaultRunCommand(command: HyperframesCommand): Promise<HyperframesCommandResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, { cwd: command.cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, command.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("exit", (status) => {
      clearTimeout(timeout);
      resolve({ status, stdout, stderr, timedOut });
    });
  });
}

export async function runHyperframesRender(input: RunHyperframesRenderInput): Promise<RunHyperframesRenderResult> {
  const runCommand = input.runCommand ?? defaultRunCommand;
  const lintLogPath = join(input.hyperframesDir, "lint.log");
  const renderLogPath = join(input.hyperframesDir, "render.log");

  const lintResult = await runCommand({
    command: "npx",
    args: ["hyperframes", "lint"],
    cwd: input.hyperframesDir,
    timeoutMs: effectiveTimeout(input.lintTimeoutMs, DEFAULT_LINT_TIMEOUT_MS),
  });
  await writeFile(lintLogPath, `${formatLog(lintResult)}\n`);
  if (lintResult.timedOut || lintResult.status !== 0) {
    throw new Error(`Hyperframes lint failed; see ${lintLogPath}`);
  }

  const renderResult = await runCommand({
    command: "npx",
    args: ["hyperframes", "render", "--output", input.outputVideoPath],
    cwd: input.hyperframesDir,
    timeoutMs: effectiveTimeout(input.renderTimeoutMs, DEFAULT_RENDER_TIMEOUT_MS),
  });
  await writeFile(renderLogPath, `${formatLog(renderResult)}\n`);
  if (renderResult.timedOut || renderResult.status !== 0) {
    throw new Error(`Hyperframes render failed; see ${renderLogPath}`);
  }

  return { lintLogPath, renderLogPath, outputVideoPath: input.outputVideoPath };
}
