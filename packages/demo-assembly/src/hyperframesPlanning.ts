import { spawn } from "node:child_process";
import { open, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProductAnalysis, RepoAnalysis } from "@tinker/product-analysis";
import type { AspectRatio } from "./types.js";

export const DEFAULT_OPENCODE_TIMEOUT_MS = 600_000;

export type HyperframesOpencodeRun = (prompt: string, options: { cwd: string }) => Promise<string>;

export type GenerateHyperframesProjectInput = {
  productUrl: string;
  repoUrl: string;
  prompt: string;
  durationCapSeconds: number;
  aspectRatio: AspectRatio;
  websiteAnalysis: ProductAnalysis;
  repoAnalysis: RepoAnalysis;
  repoCheckoutDirectory: string;
  hyperframesDir: string;
};

export type RepairHyperframesProjectInput = {
  repoCheckoutDirectory: string;
  hyperframesDir: string;
  failureStage: string;
  logText: string;
};

export type GenerateHyperframesProject = (input: GenerateHyperframesProjectInput) => Promise<void>;
export type RepairHyperframesProject = (input: RepairHyperframesProjectInput) => Promise<void>;

type OpencodeHyperframesOptions = {
  runOpencode?: HyperframesOpencodeRun;
};

export async function defaultRunOpencode(prompt: string, options: { cwd: string }) {
  const timeoutMs = Number(process.env.TINKER_HYPERFRAMES_OPENCODE_TIMEOUT_MS ?? DEFAULT_OPENCODE_TIMEOUT_MS);
  const effectiveTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_OPENCODE_TIMEOUT_MS;
  const stdoutPath = join(options.cwd, ".tinker-opencode-hyperframes-output.jsonl");
  const stderrPath = join(options.cwd, ".tinker-opencode-hyperframes-error.log");
  const stdoutFile = await open(stdoutPath, "w");
  const stderrFile = await open(stderrPath, "w");

  let result: { code: number | null; signal: NodeJS.Signals | null; timedOut: boolean };
  try {
    result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null; timedOut: boolean }>((resolve, reject) => {
      let timedOut = false;
      const child = spawn(
        "opencode",
        ["run", "--pure", "--format", "json", "--dir", options.cwd, "--dangerously-skip-permissions", prompt],
        { cwd: options.cwd, stdio: ["ignore", stdoutFile.fd, stderrFile.fd] },
      );
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, effectiveTimeoutMs);

      child.once("error", (error) => {
        clearTimeout(timer);
        reject(new Error(`OpenCode Hyperframes generation failed to start: ${error.message}`, { cause: error }));
      });

      child.once("close", (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal, timedOut });
      });
    });
  } finally {
    await Promise.all([stdoutFile.close(), stderrFile.close()]);
  }

  const [stdout, stderr] = await Promise.all([readFile(stdoutPath, "utf8"), readFile(stderrPath, "utf8")]);

  if (result.timedOut) {
    throw new Error(`OpenCode Hyperframes generation timed out after ${effectiveTimeoutMs}ms; see ${stderrPath}`);
  }

  if (result.code !== 0) {
    const reason = result.signal ? `signal ${result.signal}` : `exit code ${result.code ?? "unknown"}`;
    const suffix = stderr.trim() ? `: ${stderr.replace(/\s+/g, " ").trim().slice(0, 500)}` : "";
    throw new Error(`OpenCode Hyperframes generation failed with ${reason}; see ${stderrPath}${suffix}`);
  }

  return stdout;
}

function assertRequiredPath(value: string, name: string) {
  if (!value.trim()) {
    throw new Error(`${name} is required for Hyperframes generation`);
  }
}

function buildGeneratePrompt(input: GenerateHyperframesProjectInput) {
  return JSON.stringify(
    {
      task: "Create a Hyperframes project for a polished repo-backed product demo.",
      instructions: [
        "Inspect repo files, package scripts, source routes, product copy, and component styles before generating files.",
        "Write all files inside hyperframesDir. Do not write outside the requested output directory.",
        "Create index.html, asset-manifest.json, and generation-manifest.json in the output directory.",
        "Use repo evidence primarily, and use website screenshots as fallback when source evidence is incomplete.",
        "Prefer polished reconstructed UI over raw screenshots when building the Hyperframes demo.",
        "Do not include secrets, API keys, tokens, private environment values, or credentials in generated files.",
        "Set requiredGenerationManifest.outputVideoPath to output.mp4 and ensure outputVideoPath must be output.mp4.",
      ],
      productUrl: input.productUrl,
      repoUrl: input.repoUrl,
      userPrompt: input.prompt,
      durationCapSeconds: input.durationCapSeconds,
      aspectRatio: input.aspectRatio,
      outputDirectory: input.hyperframesDir,
      websiteAnalysis: input.websiteAnalysis,
      repoAnalysis: input.repoAnalysis,
      requiredGenerationManifest: {
        outputVideoPath: "output.mp4",
      },
    },
    null,
    2,
  );
}

function buildRepairPrompt(input: RepairHyperframesProjectInput) {
  return JSON.stringify(
    {
      task: "Fix only the generated Hyperframes project files after a failed validation, lint, or render step.",
      instructions: [
        "Modify only files inside hyperframesDir. Do not write outside the generated Hyperframes project.",
        "Preserve index.html, asset-manifest.json, generation-manifest.json, and the original demo intent.",
        "Keep generation-manifest.json outputVideoPath set to output.mp4.",
        "Use the failure log to make the smallest safe fix needed for validation, lint, or render to pass.",
      ],
      hyperframesDir: input.hyperframesDir,
      failureStage: input.failureStage,
      logText: input.logText.slice(0, 20_000),
    },
    null,
    2,
  );
}

export function createOpencodeHyperframesGenerator(options: OpencodeHyperframesOptions = {}): GenerateHyperframesProject {
  const runOpencode = options.runOpencode ?? defaultRunOpencode;

  return async (input) => {
    assertRequiredPath(input.repoCheckoutDirectory, "repoCheckoutDirectory");
    assertRequiredPath(input.hyperframesDir, "hyperframesDir");
    await runOpencode(buildGeneratePrompt(input), { cwd: input.repoCheckoutDirectory });
  };
}

export function createOpencodeHyperframesRepairer(options: OpencodeHyperframesOptions = {}): RepairHyperframesProject {
  const runOpencode = options.runOpencode ?? defaultRunOpencode;

  return async (input) => {
    assertRequiredPath(input.repoCheckoutDirectory, "repoCheckoutDirectory");
    assertRequiredPath(input.hyperframesDir, "hyperframesDir");
    await runOpencode(buildRepairPrompt(input), { cwd: input.repoCheckoutDirectory });
  };
}
