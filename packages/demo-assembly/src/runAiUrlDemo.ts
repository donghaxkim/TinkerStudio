import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
import { validateHyperframesArtifacts } from "./hyperframesArtifacts.js";
import {
  createOpencodeHyperframesGenerator,
  createOpencodeHyperframesRepairer,
  type GenerateHyperframesProject,
  type RepairHyperframesProject,
} from "./hyperframesPlanning.js";
import { runHyperframesRender, type RunHyperframesRenderInput, type RunHyperframesRenderResult } from "./hyperframesRender.js";
import type { AspectRatio } from "./types.js";

export type AiUrlDemoPhase = "analysis" | "planning" | "verification" | "capture" | "assembly";

type AnalyzeWebsiteDependency = (url: string, options: AnalyzeWebsiteOptions) => Promise<ProductAnalysis>;
type AnalyzeRepoDependency = (repoUrl: string, options: AnalyzeRepoOptions) => Promise<RepoAnalysis>;
type RunCaptureDependency = (
  plan: CapturePlan,
  options: { outputDir: string; headless?: boolean },
) => Promise<CaptureResult>;
type GenerateHyperframesProjectDependency = GenerateHyperframesProject;
type RepairHyperframesProjectDependency = RepairHyperframesProject;
type RunHyperframesDependency = (input: RunHyperframesRenderInput) => Promise<RunHyperframesRenderResult>;

type HyperframesRendererResult = {
  outputVideoPath: string;
  generationManifestPath: string;
  assetManifestPath: string;
};

type PlaywrightRendererResult = {
  projectPath: string;
  captureResultPath: string;
};

type RendererResults = {
  hyperframes?: HyperframesRendererResult;
  playwright?: PlaywrightRendererResult;
};

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
  generateHyperframes?: GenerateHyperframesProjectDependency;
  runHyperframes?: RunHyperframesDependency;
  repairHyperframes?: RepairHyperframesProjectDependency;
  maxHyperframesRepairAttempts?: number;
};

export type RunAiUrlDemoResult = {
  renderer: AiUrlRenderer;
  rendererResults: RendererResults;
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

type InternalRendererResult = Omit<RunAiUrlDemoResult, "renderer">;

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

function classifyHyperframesFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("render")) {
    return { failureStage: "render", message };
  }

  if (lowerMessage.includes("lint")) {
    return { failureStage: "lint", message };
  }

  return { failureStage: "validation", message };
}

async function readHyperframesFailureLog(hyperframesDir: string, failureStage: string, fallback: string) {
  if (failureStage !== "lint" && failureStage !== "render") {
    return fallback;
  }

  try {
    const logText = await readFile(join(hyperframesDir, `${failureStage}.log`), "utf8");
    return logText.length > 0 ? logText : fallback;
  } catch {
    return fallback;
  }
}

function normalizeRepairAttempts(value: number | undefined) {
  if (value === undefined) {
    return 1;
  }

  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 1;
}

function mergeArtifactPaths(...artifactPathGroups: string[][]) {
  return [...new Set(artifactPathGroups.flat())];
}

function combineCaptureCounts(...counts: RunAiUrlDemoResult["captureCounts"][]): RunAiUrlDemoResult["captureCounts"] {
  return counts.reduce(
    (total, count) => ({
      clips: total.clips + count.clips,
      screenshots: total.screenshots + count.screenshots,
      events: total.events + count.events,
      checkpoints: total.checkpoints + count.checkpoints,
    }),
    { clips: 0, screenshots: 0, events: 0, checkpoints: 0 },
  );
}

export async function runAiUrlDemo(input: RunAiUrlDemoInput): Promise<RunAiUrlDemoResult> {
  const renderer = input.renderer ?? "hyperframes";

  const playwrightOutputRoot = join(input.outputRoot, "playwright");
  const captureOutputDir = join(playwrightOutputRoot, "capture");
  const analyzeWebsite = input.analyzeWebsite ?? defaultAnalyzeWebsite;
  const analyzeRepo = input.analyzeRepo ?? defaultAnalyzeRepo;
  const planner = input.planner ?? (input.repoUrl === undefined ? createEnvironmentAiUrlPlanner() : createOpencodeAiUrlPlanner());
  const runCapture = input.runCapture ?? runPlaywrightCapture;
  const generateHyperframes = input.generateHyperframes ?? createOpencodeHyperframesGenerator();
  const repairHyperframes = input.repairHyperframes ?? createOpencodeHyperframesRepairer();
  const runHyperframes = input.runHyperframes ?? runHyperframesRender;
  const maxHyperframesRepairAttempts = normalizeRepairAttempts(input.maxHyperframesRepairAttempts);

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

  async function runHyperframesRenderer(): Promise<InternalRendererResult> {
    if (input.repoUrl === undefined || repoAnalysis === undefined || repoCheckoutDirectory === undefined) {
      throw new Error("repoUrl is required for Hyperframes AI URL demos");
    }

    const hyperframesDir = join(input.outputRoot, "hyperframes");
    await mkdir(hyperframesDir, { recursive: true });

    input.onPhase?.("planning");
    await generateHyperframes({
      productUrl: analysis.url,
      repoUrl: input.repoUrl,
      prompt: input.prompt,
      durationCapSeconds: input.durationCapSeconds,
      aspectRatio: input.aspectRatio,
      websiteAnalysis: analysis,
      repoAnalysis,
      repoCheckoutDirectory,
      hyperframesDir,
    });

    let validated: Awaited<ReturnType<typeof validateHyperframesArtifacts>> | undefined;
    let renderResult: RunHyperframesRenderResult | undefined;
    for (let attempt = 0; attempt <= maxHyperframesRepairAttempts; attempt += 1) {
      try {
        input.onPhase?.("verification");
        validated = await validateHyperframesArtifacts({ hyperframesDir, productUrl: analysis.url, repoUrl: input.repoUrl });

        input.onPhase?.("capture");
        renderResult = await runHyperframes({ hyperframesDir, outputVideoPath: validated.outputVideoPath });
        break;
      } catch (error) {
        if (attempt >= maxHyperframesRepairAttempts) {
          throw error;
        }

        const failure = classifyHyperframesFailure(error);
        await repairHyperframes({
          repoCheckoutDirectory,
          hyperframesDir,
          failureStage: failure.failureStage,
          logText: await readHyperframesFailureLog(hyperframesDir, failure.failureStage, failure.message),
        });
      }
    }

    if (validated === undefined || renderResult === undefined) {
      throw new Error("Hyperframes render did not produce a result");
    }

    input.onPhase?.("assembly");
    const artifactPaths = [
      productAnalysisPath,
      ...(repoAnalysisPath ? [repoAnalysisPath] : []),
      ...(analysis.screenshotPath ? [analysis.screenshotPath] : []),
      validated.indexPath,
      validated.assetManifestPath,
      validated.generationManifestPath,
      renderResult.lintLogPath,
      renderResult.renderLogPath,
      renderResult.outputVideoPath,
    ];

    return {
      projectPath: renderResult.outputVideoPath,
      captureResultPath: validated.generationManifestPath,
      outputRoot: input.outputRoot,
      artifactPaths,
      captureCounts: {
        clips: 1,
        screenshots: 0,
        events: 0,
        checkpoints: 0,
      },
      rendererResults: {
        hyperframes: {
          outputVideoPath: renderResult.outputVideoPath,
          generationManifestPath: validated.generationManifestPath,
          assetManifestPath: validated.assetManifestPath,
        },
      },
    };
  }

  async function runPlaywrightRenderer(): Promise<InternalRendererResult> {
    await mkdir(captureOutputDir, { recursive: true });

    input.onPhase?.("planning");
    const plannerResult: AiUrlPlannerResult = await planner({
      productUrl: analysis.url,
      prompt: input.prompt,
      durationCapSeconds: input.durationCapSeconds,
      aspectRatio: input.aspectRatio,
      analysis,
      ...(repoAnalysis === undefined ? {} : { repoAnalysis, repoCheckoutDirectory }),
    });

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
      rendererResults: {
        playwright: { projectPath, captureResultPath },
      },
    };
  }

  let renderError: unknown;
  try {
    if (renderer === "hyperframes") {
      return { renderer: "hyperframes", ...(await runHyperframesRenderer()) };
    }

    if (renderer === "playwright") {
      return { renderer: "playwright", ...(await runPlaywrightRenderer()) };
    }

    const hyperframesResult = await runHyperframesRenderer();
    const playwrightResult = await runPlaywrightRenderer();

    return {
      renderer: "both",
      projectPath: hyperframesResult.projectPath,
      captureResultPath: hyperframesResult.captureResultPath,
      outputRoot: input.outputRoot,
      artifactPaths: mergeArtifactPaths(hyperframesResult.artifactPaths, playwrightResult.artifactPaths),
      captureCounts: combineCaptureCounts(hyperframesResult.captureCounts, playwrightResult.captureCounts),
      rendererResults: {
        ...hyperframesResult.rendererResults,
        ...playwrightResult.rendererResults,
      },
    };
  } catch (error) {
    renderError = error;
    throw error;
  } finally {
    await cleanupRepoScratch(repoScratchDir, renderError);
  }
}
