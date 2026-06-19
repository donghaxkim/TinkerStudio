import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CreateDemoRequest } from "@tinker/generation-contract";
import { loadLocalEnvFile, resolveWorkspaceEnvPath } from "../src/localEnv.js";

type LocalGenerationJobModule = typeof import("../src/localGenerationJob.js");

const aspectRatios = ["16:9", "9:16", "1:1"] as const satisfies readonly CreateDemoRequest["aspectRatio"][];
const packagesToBuild = [
  "@tinker/generation-contract",
  "@tinker/project-schema",
  "@tinker/browser-capture",
  "@tinker/product-analysis",
  "@tinker/motion",
] as const;

loadLocalEnvFile(resolveWorkspaceEnvPath(import.meta.url));

function readArg(name: string) {
  const index = process.argv.indexOf(name);

  if (index === -1 || process.argv[index + 1]?.startsWith("--")) {
    return undefined;
  }

  return process.argv[index + 1];
}

function hasAspectRatio(value: string): value is CreateDemoRequest["aspectRatio"] {
  return aspectRatios.some((aspectRatio) => aspectRatio === value);
}

function buildRequiredPackages() {
  for (const packageName of packagesToBuild) {
    const result = spawnSync("pnpm", ["--filter", packageName, "build"], { stdio: "inherit" });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
}

async function printPipelineSummary(outputDirectory: string) {
  const at = (...parts: string[]) => join(outputDirectory, ...parts);
  let warnings: string[] = [];
  try {
    const summary = JSON.parse(await readFile(at("run-summary.json"), "utf8")) as { warnings?: unknown };
    warnings = Array.isArray(summary.warnings) ? summary.warnings.map(String) : [];
  } catch {
    // run-summary is best-effort for the printout.
  }

  const finalMp4 = at("playwright", "final.mp4");
  const backend = (process.env.TINKER_AGENT_BACKEND ?? "").trim().toLowerCase() || "opencode";

  console.log("\n=== Pipeline complete ===");
  console.log(`run folder            : ${outputDirectory}`);
  console.log(`agent backend         : ${backend}${backend === "opencode" ? "  (set TINKER_AGENT_BACKEND=claude-code for the local Claude Code CLI)" : ""}`);
  console.log(`input.json            : ${at("input.json")}`);
  console.log(`product-understanding : ${at("product-understanding.json")}`);
  console.log(`demo-strategy         : ${at("demo-strategy.json")}`);
  console.log(`storyboard            : ${at("storyboard.json")}`);
  console.log(`capture-plan          : ${at("playwright", "capture-plan.json")}`);
  console.log(`action-trace          : ${at("playwright", "action-trace.json")}`);
  console.log(`capture-lineage       : ${at("playwright", "capture-lineage.json")}`);
  console.log(`render-plan           : ${at("playwright", "render-plan.json")}`);
  console.log(`director-plan         : ${at("playwright", "director-plan.json")}`);
  console.log(`edit-decision-list    : ${at("playwright", "edit-decision-list.json")}`);
  console.log(`final.mp4             : ${existsSync(finalMp4) ? finalMp4 : "(not produced - ffmpeg unavailable)"}`);
  console.log(`run-summary           : ${at("run-summary.json")}`);
  console.log(`warnings              : ${warnings.length ? warnings.join(" | ") : "(none)"}`);
}

const productUrl = readArg("--url");
const repoUrl = readArg("--repo");

if (!productUrl) {
  console.error("--url is required");
  process.exitCode = 1;
} else if (!repoUrl) {
  console.error("--repo is required for AI URL demo generation");
  process.exitCode = 1;
} else {
  const id = readArg("--id") ?? "ai-url-local-job";
  const prompt = readArg("--prompt") ?? "Make a short demo of the main value prop.";
  const durationCapSeconds = Number(readArg("--duration") ?? "12");
  const aspectRatioValue = readArg("--aspect-ratio") ?? "16:9";

  if (!Number.isFinite(durationCapSeconds) || durationCapSeconds <= 0) {
    console.error("--duration must be a positive number");
    process.exitCode = 1;
  } else if (!hasAspectRatio(aspectRatioValue)) {
    console.error("--aspect-ratio must be one of 16:9, 9:16, 1:1");
    process.exitCode = 1;
  } else {
    buildRequiredPackages();

    const { LocalGenerationJobError, runLocalGenerationJob }: LocalGenerationJobModule = await import(
      "../src/localGenerationJob.js"
    );

    const request: CreateDemoRequest = {
      id,
      durationCapSeconds,
      aspectRatio: aspectRatioValue,
      mode: "ai-url-planning",
      productUrl,
      repoUrl,
      outputDirectory: `generated/local-job/${id}`,
      prompt,
    };

    try {
      const result = await runLocalGenerationJob(request, {
        onProgress: (event) => {
          console.log(JSON.stringify(event));
        },
      });

      await printPipelineSummary(result.outputDirectory);
    } catch (error) {
      if (error instanceof LocalGenerationJobError) {
        console.error(JSON.stringify(error.generationError, null, 2));
      } else {
        console.error(error);
      }

      process.exitCode = 1;
    }
  }
}
