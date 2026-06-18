// Claude Code agent backend (local LLM, alternative to opencode)
//
// The planner / repo-analysis / hyperframes seams in this codebase are all the same
// generic shape: `(prompt, { cwd }) => Promise<string>` — "run an agent CLI in this
// directory with this prompt and give me back its text". opencode is one implementation;
// this is another, backed by the locally-installed Claude Code CLI (`claude`).
//
// For planning we run with NO tools (`--allowedTools ""`) so the model returns a single
// JSON response from the prompt context (website + repo analysis are already embedded in
// the prompt). That keeps it fast, deterministic, and free of interactive permission
// prompts in a headless worker. The existing opencode output parser tolerates plain text
// around the JSON object, so no special output handling is needed.

import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 300_000;

function parsePositiveInt(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

/**
 * Build the `claude` CLI argument list from the given options.
 * Pure function — no side effects, fully testable without spawning.
 */
export function buildClaudeArgs(options: {
  allowedTools?: string;
  mcpConfigPath?: string;
  model?: string;
}): string[] {
  const args = ["-p", "--allowedTools", options.allowedTools ?? "", "--output-format", "text"];
  if (options.mcpConfigPath) args.push("--mcp-config", options.mcpConfigPath);
  if (options.model?.trim()) args.push("--model", options.model.trim());
  return args;
}

/**
 * Run the Claude Code CLI non-interactively (`claude -p`), feeding the prompt over stdin
 * and returning stdout. Supports optional tool list, MCP config, model override, and
 * per-call timeout.
 *
 * Honors `TINKER_CLAUDE_CODE_MODEL` (optional `--model` fallback when `options.model` is
 * absent) and `TINKER_CLAUDE_CODE_TIMEOUT_MS` (default 5 min). Inherits the process env
 * so Claude Code can find its existing credentials.
 */
export function runClaudeAgent(
  prompt: string,
  options: {
    cwd: string;
    allowedTools?: string;
    mcpConfigPath?: string;
    model?: string;
    timeoutMs?: number;
  },
): Promise<string> {
  const timeoutMs =
    options.timeoutMs ??
    parsePositiveInt(process.env.TINKER_CLAUDE_CODE_TIMEOUT_MS) ??
    DEFAULT_TIMEOUT_MS;
  const model = options.model?.trim() ?? process.env.TINKER_CLAUDE_CODE_MODEL?.trim();

  const args = buildClaudeArgs({ allowedTools: options.allowedTools, mcpConfigPath: options.mcpConfigPath, model });

  return new Promise<string>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const child = spawn("claude", args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`Claude Code planning timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error instanceof Error ? error : new Error(String(error)));
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
      } else {
        const suffix = stderr.trim() ? `: ${stderr.replace(/\s+/g, " ").trim().slice(0, 500)}` : "";
        reject(new Error(`Claude Code planning failed with exit code ${code ?? "unknown"}${suffix}`));
      }
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/**
 * Thin wrapper kept for backward-compatibility with the existing planner path.
 * Runs with no tools (`--allowedTools ""`), which is the original behavior.
 */
export function runClaudeCodeAgent(prompt: string, options: { cwd: string }): Promise<string> {
  return runClaudeAgent(prompt, { cwd: options.cwd, allowedTools: "" });
}
