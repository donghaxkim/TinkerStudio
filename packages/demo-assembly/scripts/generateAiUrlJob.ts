import { spawnSync } from "node:child_process";
import type { CreateDemoRequest } from "@tinker/generation-contract";
import { isAiUrlRenderer } from "../src/aiUrlRenderer.js";
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

const productUrl = readArg("--url");
const repoUrl = readArg("--repo");
const rendererValue = readArg("--renderer") ?? "hyperframes";

if (!productUrl) {
  console.error("--url is required");
  process.exitCode = 1;
} else if (!repoUrl) {
  console.error("--repo is required for AI URL demo generation");
  process.exitCode = 1;
} else if (!isAiUrlRenderer(rendererValue)) {
  console.error("--renderer must be one of hyperframes, playwright, both");
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
      renderer: rendererValue,
      outputDirectory: `generated/local-job/${id}`,
      prompt,
    };

    try {
      const result = await runLocalGenerationJob(request, {
        onProgress: (event) => {
          console.log(JSON.stringify(event));
        },
      });

      console.log(JSON.stringify(result, null, 2));
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
