import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runPlaywrightCapture, startFixtureServer, type CaptureAsset } from "@tinker/browser-capture";
import { compileProject } from "./compileProject.js";
import { createManualDemoCapturePlan, createManualDemoStoryboard } from "./manualDemo.js";

export type ManualDemoPhase = "capture" | "assembly";

export type RunManualDemoInput = {
  outputRoot: string;
  projectId: string;
  createdAt: string;
  sourceRepoUrl?: string;
  productUrl?: string;
  prompt?: string;
  onPhase?: (phase: ManualDemoPhase) => void;
};

export type RunManualDemoResult = {
  projectPath: string;
  captureResultPath: string;
  outputRoot: string;
  artifactPaths: string[];
  captureCounts: {
    clips: number;
    screenshots: number;
    events: number;
    checkpoints: number;
  };
};

const fixtureUrl = new URL("../../browser-capture/fixtures/manual-demo.html", import.meta.url);

function toCaptureAssetPath(captureOutputDir: string, asset: CaptureAsset) {
  return join(captureOutputDir, asset.uri);
}

export async function runManualDemo(input: RunManualDemoInput): Promise<RunManualDemoResult> {
  const captureOutputDir = join(input.outputRoot, "capture");

  await rm(input.outputRoot, { recursive: true, force: true });
  await mkdir(captureOutputDir, { recursive: true });

  const server = await startFixtureServer(fixtureUrl);

  try {
    const storyboard = createManualDemoStoryboard();
    const capturePlan = createManualDemoCapturePlan(server.url);

    input.onPhase?.("capture");
    const captureResult = await runPlaywrightCapture(capturePlan, { outputDir: captureOutputDir, headless: true });

    input.onPhase?.("assembly");
    const project = compileProject({
      projectId: input.projectId,
      storyboard,
      capturePlan,
      captureResult,
      outputRoot: input.outputRoot,
      createdAt: input.createdAt,
      ...(input.sourceRepoUrl === undefined ? {} : { sourceRepoUrl: input.sourceRepoUrl }),
      productUrl: input.productUrl ?? server.url,
      ...(input.prompt === undefined ? {} : { prompt: input.prompt }),
    });

    const captureResultPath = join(input.outputRoot, "capture-result.json");
    const projectPath = join(input.outputRoot, "demo-project.json");

    await writeFile(captureResultPath, `${JSON.stringify(captureResult, null, 2)}\n`);
    await writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`);

    const artifactPaths = [
      captureResultPath,
      ...captureResult.clips.map((asset) => toCaptureAssetPath(captureOutputDir, asset)),
      ...captureResult.screenshots.map((asset) => toCaptureAssetPath(captureOutputDir, asset)),
      ...(captureResult.tracePath ? [captureResult.tracePath] : []),
    ];

    return {
      projectPath,
      captureResultPath,
      outputRoot: input.outputRoot,
      artifactPaths,
      captureCounts: {
        clips: captureResult.clips.length,
        screenshots: captureResult.screenshots.length,
        events: captureResult.events.length,
        checkpoints: captureResult.checkpoints.length,
      },
    };
  } finally {
    await server.close();
  }
}

export function defaultManualDemoOutputRoot() {
  const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
  return join(repoRoot, "generated", "manual-demo");
}
