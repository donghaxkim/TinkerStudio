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
  type AnalyzeRepoOptions,
  type AnalyzeWebsiteOptions,
  type ProductAnalysis,
  type RepoAnalysis,
} from "@tinker/product-analysis";
import { compileProject } from "./compileProject.js";
import { createEnvironmentAiUrlPlanner, type AiUrlPlanner } from "./aiPlanning.js";
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

export async function runAiUrlDemo(input: RunAiUrlDemoInput): Promise<RunAiUrlDemoResult> {
  const captureOutputDir = join(input.outputRoot, "capture");
  const analyzeWebsite = input.analyzeWebsite ?? defaultAnalyzeWebsite;
  const analyzeRepo = input.analyzeRepo ?? defaultAnalyzeRepo;
  const planner = input.planner ?? createEnvironmentAiUrlPlanner();
  const runCapture = input.runCapture ?? runPlaywrightCapture;

  await rm(input.outputRoot, { recursive: true, force: true });
  await mkdir(captureOutputDir, { recursive: true });

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

  if (input.repoUrl !== undefined) {
    const repoScratchDir = join(input.outputRoot, ".repo-scratch");
    const checkoutDirectory = join(repoScratchDir, "checkout");

    try {
      repoAnalysis = await analyzeRepo(input.repoUrl, { checkoutDirectory });
      repoAnalysisPath = join(input.outputRoot, "repo-analysis.json");
      await writeFile(repoAnalysisPath, toPrettyJson(repoAnalysis));
    } finally {
      await rm(repoScratchDir, { recursive: true, force: true });
    }
  }

  input.onPhase?.("planning");
  const { storyboard, capturePlan } = await planner({
    productUrl: analysis.url,
    prompt: input.prompt,
    durationCapSeconds: input.durationCapSeconds,
    aspectRatio: input.aspectRatio,
    analysis,
    ...(repoAnalysis === undefined ? {} : { repoAnalysis }),
  });
  const storyboardPath = join(input.outputRoot, "storyboard.json");
  await writeFile(storyboardPath, toPrettyJson(storyboard));

  input.onPhase?.("verification");
  const verification = verifyCapturePlan(capturePlan);
  if (!verification.valid) {
    throw new Error(`Generated capture plan failed verification: ${formatCapturePlanIssues(verification)}`);
  }
  const capturePlanPath = join(input.outputRoot, "capture-plan.json");
  await writeFile(capturePlanPath, toPrettyJson(capturePlan));

  input.onPhase?.("capture");
  const captureResult = await runCapture(capturePlan, { outputDir: captureOutputDir, headless: true });
  const captureResultPath = join(input.outputRoot, "capture-result.json");
  await writeFile(captureResultPath, toPrettyJson(captureResult));

  input.onPhase?.("assembly");
  const project = compileProject({
    projectId: input.projectId,
    storyboard,
    capturePlan,
    captureResult,
    outputRoot: input.outputRoot,
    createdAt: input.createdAt,
    productUrl: input.productUrl,
    ...(input.repoUrl === undefined ? {} : { sourceRepoUrl: input.repoUrl }),
    prompt: input.prompt,
  });
  const projectPath = join(input.outputRoot, "demo-project.json");
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
