import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  runPlaywrightCapture,
  verifyCapturePlan,
  type CaptureAsset,
  type CapturePlan,
  type CaptureResult,
} from "@tinker/browser-capture";
import {
  analyzeRepo as defaultAnalyzeRepo,
  analyzeWebsite as defaultAnalyzeWebsite,
  parseRepoAnalysis,
  type AnalyzeRepoOptions,
  type AnalyzeWebsiteOptions,
  type ProductAnalysis,
  type RepoAnalysis,
} from "@tinker/product-analysis";
import type { AiUrlRenderer } from "./aiUrlRenderer.js";
import { compileProject } from "./compileProject.js";
import { createEnvironmentAiUrlPlanner, createOpencodeAiUrlPlanner, type AiUrlPlanner, type AiUrlPlannerResult } from "./aiPlanning.js";
import type { AspectRatio } from "./types.js";

export type AiUrlDemoPhase = "analysis" | "planning" | "verification" | "capture" | "assembly";

type AnalyzeWebsiteDependency = (url: string, options: AnalyzeWebsiteOptions) => Promise<ProductAnalysis>;
type AnalyzeRepoDependency = (repoUrl: string, options: AnalyzeRepoOptions) => Promise<RepoAnalysis>;
type RunCaptureDependency = (
  plan: CapturePlan,
  options: { outputDir: string; headless?: boolean },
) => Promise<CaptureResult>;

export type RunAiUrlDemoInput = {
  outputRoot: string;
  projectId: string;
  createdAt: string;
  productUrl: string;
  prompt: string;
  durationCapSeconds: number;
  aspectRatio: AspectRatio;
  repoUrl?: string;
  renderer?: AiUrlRenderer;
  onPhase?: (phase: AiUrlDemoPhase) => void;
  analyzeWebsite?: AnalyzeWebsiteDependency;
  analyzeRepo?: AnalyzeRepoDependency;
  planner?: AiUrlPlanner;
  runCapture?: RunCaptureDependency;
};

export type RunAiUrlDemoResult = {
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

function toPrettyJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function toCaptureAssetPath(captureOutputDir: string, asset: CaptureAsset) {
  return join(captureOutputDir, asset.uri);
}

function formatCapturePlanIssues(result: ReturnType<typeof verifyCapturePlan>) {
  return result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
}

async function cleanupRepoScratch(repoScratchDir: string | undefined, priorError: unknown) {
  if (repoScratchDir === undefined) {
    return;
  }

  try {
    await rm(repoScratchDir, { recursive: true, force: true });
  } catch (cleanupError) {
    if (priorError === undefined) {
      throw cleanupError;
    }
  }
}

export async function runAiUrlDemo(input: RunAiUrlDemoInput): Promise<RunAiUrlDemoResult> {
  const renderer = input.renderer ?? "hyperframes";
  const playwrightOutputRoot = join(input.outputRoot, "playwright");
  const captureOutputDir = join(playwrightOutputRoot, "capture");
  const analyzeWebsite = input.analyzeWebsite ?? defaultAnalyzeWebsite;
  const analyzeRepo = input.analyzeRepo ?? defaultAnalyzeRepo;
  const planner = input.planner ?? (input.repoUrl === undefined ? createEnvironmentAiUrlPlanner() : createOpencodeAiUrlPlanner());
  const runCapture = input.runCapture ?? runPlaywrightCapture;

  await rm(input.outputRoot, { recursive: true, force: true });
  await mkdir(input.outputRoot, { recursive: true });

  input.onPhase?.("analysis");
  const analysis = await analyzeWebsite(input.productUrl, {
    outputDirectory: input.outputRoot,
    screenshotFileName: "product-analysis.png",
    headless: true,
  });
  const productAnalysisPath = join(input.outputRoot, "product-analysis.json");
  await writeFile(productAnalysisPath, toPrettyJson(analysis));

  let repoAnalysis: RepoAnalysis | undefined;
  let repoAnalysisPath: string | undefined;
  let repoScratchDir: string | undefined;
  let repoCheckoutDirectory: string | undefined;

  if (input.repoUrl !== undefined) {
    repoScratchDir = join(input.outputRoot, ".repo-scratch");
    repoCheckoutDirectory = join(repoScratchDir, "checkout");

    try {
      repoAnalysis = parseRepoAnalysis(await analyzeRepo(input.repoUrl, { checkoutDirectory: repoCheckoutDirectory }), input.repoUrl);
      repoAnalysisPath = join(input.outputRoot, "repo-analysis.json");
      await writeFile(repoAnalysisPath, toPrettyJson(repoAnalysis));
    } catch (error) {
      await cleanupRepoScratch(repoScratchDir, error);
      throw error;
    }
  }

  async function runPlaywrightRenderer(): Promise<RunAiUrlDemoResult> {
    await mkdir(captureOutputDir, { recursive: true });

    input.onPhase?.("planning");
    let plannerResult: AiUrlPlannerResult;
    let plannerError: unknown;
    try {
      plannerResult = await planner({
        productUrl: analysis.url,
        prompt: input.prompt,
        durationCapSeconds: input.durationCapSeconds,
        aspectRatio: input.aspectRatio,
        analysis,
        ...(repoAnalysis === undefined ? {} : { repoAnalysis, repoCheckoutDirectory }),
      });
    } catch (error) {
      plannerError = error;
      throw error;
    } finally {
      await cleanupRepoScratch(repoScratchDir, plannerError);
    }

    const { storyboard, capturePlan } = plannerResult!;
    const storyboardPath = join(playwrightOutputRoot, "storyboard.json");
    await writeFile(storyboardPath, toPrettyJson(storyboard));

    input.onPhase?.("verification");
    const verification = verifyCapturePlan(capturePlan);
    if (!verification.valid) {
      throw new Error(`Generated capture plan failed verification: ${formatCapturePlanIssues(verification)}`);
    }
    const capturePlanPath = join(playwrightOutputRoot, "capture-plan.json");
    await writeFile(capturePlanPath, toPrettyJson(capturePlan));

    input.onPhase?.("capture");
    const captureResult = await runCapture(capturePlan, { outputDir: captureOutputDir, headless: true });
    const captureResultPath = join(playwrightOutputRoot, "capture-result.json");
    await writeFile(captureResultPath, toPrettyJson(captureResult));

    input.onPhase?.("assembly");
    const project = compileProject({
      projectId: input.projectId,
      storyboard,
      capturePlan,
      captureResult,
      outputRoot: playwrightOutputRoot,
      createdAt: input.createdAt,
      productUrl: input.productUrl,
      ...(input.repoUrl === undefined ? {} : { sourceRepoUrl: input.repoUrl }),
      prompt: input.prompt,
    });
    const projectPath = join(playwrightOutputRoot, "demo-project.json");
    await writeFile(projectPath, toPrettyJson(project));

    const artifactPaths = [
      productAnalysisPath,
      ...(repoAnalysisPath ? [repoAnalysisPath] : []),
      ...(analysis.screenshotPath ? [analysis.screenshotPath] : []),
      storyboardPath,
      capturePlanPath,
      captureResultPath,
      projectPath,
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
  }

  if (renderer === "playwright") {
    return runPlaywrightRenderer();
  }

  const rendererError = new Error("Hyperframes renderer is not implemented yet");
  await cleanupRepoScratch(repoScratchDir, rendererError);
  throw rendererError;
}
