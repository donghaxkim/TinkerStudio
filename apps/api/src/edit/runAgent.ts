import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultRunOpencode } from "@tinker/demo-assembly";
import type { RunAgent } from "./composeRunEdit.js";

/**
 * Real edit-agent runner. defaultRunOpencode sandboxes a `cwd` (copied into a read-only
 * repository/) and returns the agent's text output. A composition edit ignores the repo,
 * so cwd is a throwaway dir and repoCheckoutDirectory is omitted; logDir collects logs.
 */
export function createDefaultRunAgent(): RunAgent {
  return async (prompt, options) => {
    const cwd = await mkdtemp(join(tmpdir(), "tinker-edit-agent-"));
    return defaultRunOpencode(prompt, { cwd, logDir: options.logDir });
  };
}
