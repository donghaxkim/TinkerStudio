import { access, cp, mkdir, open, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildRenderPlan,
  deriveActionTraceFromCapture,
  runPlaywrightCapture,
  transcodeToMp4,
  verifyCapturePlan,
  type ActionTrace,
  type CaptureAsset,
  type CapturePlan,
  type CaptureResult,
} from "@tinker/browser-capture";
import {
  analyzeRepo as defaultAnalyzeRepo,
  analyzeWebsite as defaultAnalyzeWebsite,
  exploreNarrativeWebsite as defaultExploreNarrativeWebsite,
  parseRepoAnalysis,
  type AnalyzeRepoOptions,
  type AnalyzeWebsiteOptions,
  type ExploreNarrativeWebsiteOptions,
  type NarrativeExploration,
  type ProductAnalysis,
  type RepoAnalysis,
} from "@tinker/product-analysis";
import type { AiUrlRenderer } from "./aiUrlRenderer.js";
import { compileProject } from "./compileProject.js";
import {
  createClaudeCodeAiUrlPlanner,
  createOpencodeAiUrlPlanner,
  type AiUrlPlanner,
  type AiUrlPlannerResult,
} from "./aiPlanning.js";
import { deriveProductUnderstanding, type UnderstandProduct } from "./productUnderstanding.js";
import { deriveDemoStrategy, type Storyboard, type Strategize } from "./demoStrategy.js";
import { createClaudeUnderstandingAgent, UNDERSTANDING_FALLBACK_WARNINGS } from "./understandingAgent.js";
import { createClaudeStrategyAgent, STRATEGY_FALLBACK_WARNING } from "./demoStrategyAgent.js";
import { buildCoreCoverage } from "./coreCoverage.js";
import type { CaptureLineage } from "./captureLineage.js";
import type { RunExecution } from "./runSummary.js";
import { beatIndexForPosition, buildCaptureLineage } from "./captureLineage.js";
import { buildEditDecisionList } from "./editDecisionList.js";
import { buildDirectorPlan } from "./directorPlan.js";
import { applyEditDecisionList } from "./applyEditDecisionList.js";
import { buildRunInput, buildRunSummary } from "./runSummary.js";
import { renderFinalToMp4 } from "@tinker/rendering/node";
import { DEFAULT_SYSTEM_PROMPT } from "@tinker/generation-contract";
import type { DemoProject } from "@tinker/project-schema";
import { validateHyperframesArtifacts } from "./hyperframesArtifacts.js";
import {
  createOpencodeHyperframesGenerator,
  createOpencodeHyperframesRepairer,
  type GenerateHyperframesProject,
  type HyperframesAgent,
  type RepairHyperframesProject,
} from "./hyperframesPlanning.js";
import { runHyperframesRender, type RunHyperframesRenderInput, type RunHyperframesRenderResult } from "./hyperframesRender.js";
import type { AspectRatio } from "./types.js";

export type AiUrlDemoPhase =
  | "analysis"
  | "understanding"
  | "strategy"
  | "planning"
  | "validation"
  | "verification"
  | "capture"
  | "assembly";

const MAX_HYPERFRAMES_REPAIR_LOG_BYTES = 20_000;
const PRODUCT_ANALYSIS_SCREENSHOT_FILE_NAME = "product-analysis.png";

type AnalyzeWebsiteDependency = (url: string, options: AnalyzeWebsiteOptions) => Promise<ProductAnalysis>;
type AnalyzeRepoDependency = (repoUrl: string, options: AnalyzeRepoOptions) => Promise<RepoAnalysis>;
type ExploreNarrativeWebsiteDependency = (
  productUrl: string,
  options: ExploreNarrativeWebsiteOptions,
) => Promise<NarrativeExploration | undefined>;
type RunCaptureDependency = (
  plan: CapturePlan,
  options: { outputDir: string; headless?: boolean; smooth?: boolean },
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
  prompt?: string;
  /** Optional user-edited directive for the LLM Understanding + Strategy agents. */
  systemPrompt?: string;
  durationCapSeconds: number;
  aspectRatio: AspectRatio;
  repoUrl?: string;
  renderer?: AiUrlRenderer;
  hyperframesAgent?: HyperframesAgent;
  onPhase?: (phase: AiUrlDemoPhase) => void;
  analyzeWebsite?: AnalyzeWebsiteDependency;
  analyzeRepo?: AnalyzeRepoDependency;
  enableNarrativeExploration?: boolean;
  exploreNarrativeWebsite?: ExploreNarrativeWebsiteDependency;
  onWarning?: (message: string) => void;
  planner?: AiUrlPlanner;
  runCapture?: RunCaptureDependency;
  generateHyperframes?: GenerateHyperframesProjectDependency;
  runHyperframes?: RunHyperframesDependency;
  repairHyperframes?: RepairHyperframesProjectDependency;
  maxHyperframesRepairAttempts?: number;
  /** Seam: override the (default deterministic) Product Understanding phase. */
  understandProduct?: UnderstandProduct;
  /** Seam: override the (default deterministic) Demo Strategy + Story phase. */
  strategize?: Strategize;
};

/** Paths to the renderer-agnostic pipeline artifacts written at the run root. */
export type RunAiUrlDemoPipeline = {
  runInputPath: string;
  productUnderstandingPath: string;
  demoStrategyPath: string;
  storyboardPath: string;
  runSummaryPath: string;
  finalVideoPath?: string;
  warnings: string[];
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
  pipeline: RunAiUrlDemoPipeline;
};

type InternalRendererResult = Omit<RunAiUrlDemoResult, "renderer" | "pipeline"> & {
  finalVideoProduced?: boolean;
  finalVideoPath?: string;
  finalVideoMode?: "rendered" | "transcoded" | "none";
  finalVideoSource?: "demo-project" | "raw-playwright-recording" | "none";
  editDecisionListApplied?: boolean;
  coverageActionTrace?: ActionTrace;
  coverageCaptureLineage?: CaptureLineage;
};

function toPrettyJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function toCaptureAssetPath(captureOutputDir: string, asset: CaptureAsset) {
  return join(captureOutputDir, asset.uri);
}

type FinalVideoMode = "rendered" | "transcoded" | "none";

/**
 * Produce generated/<run>/final.mp4 from the editable DemoProject.
 *
 * PRIMARY: render the project via `renderFinalToMp4`, which applies the project's editable
 * zoom keyframes (and any dead-time clip trims) as real camera moves — so the demo focuses
 * on what's happening instead of showing a bare browser recording. The synthetic cursor is
 * already baked into the webm and the project sets `cursor.hidden`, so the renderer does not
 * draw a second pointer.
 *
 * FALLBACK: if the project render fails (e.g. a mocked capture with no real webm on disk, or
 * ffprobe unavailable), fall back to a flat ffmpeg transcode of the raw recording so an mp4
 * still exists when possible. Returns "none" only when neither path can run, which never
 * fails demo generation.
 */
async function produceFinalVideo(
  project: DemoProject,
  playwrightOutputRoot: string,
  captureResult: CaptureResult,
  captureOutputDir: string,
  finalVideoPath: string,
  fps: number,
): Promise<FinalVideoMode> {
  const mainClip = captureResult.clips.find((clip) => clip.type === "video");
  if (mainClip === undefined) {
    return "none";
  }

  const rawVideoPath = toCaptureAssetPath(captureOutputDir, mainClip);
  try {
    await access(rawVideoPath);
  } catch {
    // No real recording on disk (e.g. a mocked capture in tests) — nothing to render.
    return "none";
  }

  try {
    await renderFinalToMp4(project, {
      outputPath: finalVideoPath,
      projectRoot: playwrightOutputRoot,
      allowedInputRoots: [playwrightOutputRoot],
      allowedOutputRoots: [playwrightOutputRoot],
    });
    return "rendered";
  } catch (renderError) {
    console.warn(
      `final.mp4 project render failed, falling back to flat transcode: ${
        renderError instanceof Error ? renderError.message : String(renderError)
      }`,
    );
    try {
      await transcodeToMp4(rawVideoPath, finalVideoPath, { fps });
      return "transcoded";
    } catch (transcodeError) {
      console.warn(
        `final.mp4 transcode skipped: ${transcodeError instanceof Error ? transcodeError.message : String(transcodeError)}`,
      );
      return "none";
    }
  }
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

function formatErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isNarrativeExplorationEnabled(value: boolean | undefined) {
  return value ?? process.env.TINKER_NARRATIVE_EXPLORATION === "1";
}

function classifyHyperframesRunFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.startsWith("Hyperframes lint failed")) {
    return { failureStage: "lint", message };
  }

  return { failureStage: "render", message };
}

async function readHyperframesFailureLog(hyperframesDir: string, failureStage: string, fallback: string) {
  if (failureStage !== "lint" && failureStage !== "render") {
    return fallback;
  }

  try {
    const file = await open(join(hyperframesDir, `${failureStage}.log`), "r");
    try {
      const buffer = Buffer.alloc(MAX_HYPERFRAMES_REPAIR_LOG_BYTES);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      return bytesRead > 0 ? buffer.toString("utf8", 0, bytesRead) : fallback;
    } finally {
      await file.close();
    }
  } catch {
    return fallback;
  }
}

function normalizeRepairAttempts(value: number | undefined) {
  if (value === undefined) {
    return 2;
  }

  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 2;
}

function mergeArtifactPaths(...artifactPathGroups: string[][]) {
  return [...new Set(artifactPathGroups.flat())];
}

/**
 * Returns true when TINKER_AGENT_BACKEND is set to "claude-code" or "claude", enabling
 * the real Claude-backed Understanding and Strategy agents instead of the deterministic
 * fallbacks.
 */
function agentBackendEnabled(): boolean {
  const b = (process.env.TINKER_AGENT_BACKEND ?? "").trim().toLowerCase();
  return b === "claude-code" || b === "claude";
}

/**
 * Choose the agent backend for the Playwright planner. opencode by default; the local
 * Claude Code CLI when TINKER_AGENT_BACKEND=claude-code (so the full pipeline can run
 * without opencode installed). The planner contract is identical for both backends.
 */
function selectDefaultAiUrlPlanner(): AiUrlPlanner {
  const backend = (process.env.TINKER_AGENT_BACKEND ?? "").trim().toLowerCase();
  if (backend === "claude-code" || backend === "claude") {
    return createClaudeCodeAiUrlPlanner();
  }
  return createOpencodeAiUrlPlanner();
}

function selectDefaultUnderstandProduct(): UnderstandProduct {
  if (agentBackendEnabled()) {
    return createClaudeUnderstandingAgent();
  }
  return async (a) => deriveProductUnderstanding(a);
}

function selectDefaultStrategize(): Strategize {
  if (agentBackendEnabled()) {
    return createClaudeStrategyAgent();
  }
  return async (a) => deriveDemoStrategy(a);
}

function dedupeStrings(values: string[]) {
  return [...new Set(values)];
}

/**
 * Best-effort storyboard lineage for the action trace: distribute the captured actions
 * across the storyboard beats in order and stamp each with the beat it contributes to.
 * First pass — proportional mapping, since the planner does not emit a per-step beat id.
 */
function annotateActionTraceWithBeats(actionTrace: ActionTrace, storyboard: Storyboard): ActionTrace {
  const beats = storyboard.beats;
  const total = actionTrace.actions.length;
  if (beats.length === 0 || total === 0) {
    return actionTrace;
  }

  const actions = actionTrace.actions.map((action, index) => {
    const beat = beats[beatIndexForPosition(index, total, beats.length)];
    return { ...action, beatId: beat.id, intent: beat.goal };
  });

  return { ...actionTrace, actions };
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

async function prepareHyperframesWebsiteAnalysis(analysis: ProductAnalysis, hyperframesDir: string) {
  if (analysis.screenshotPath === undefined) {
    return analysis;
  }

  await cp(analysis.screenshotPath, join(hyperframesDir, PRODUCT_ANALYSIS_SCREENSHOT_FILE_NAME));

  return { ...analysis, screenshotPath: PRODUCT_ANALYSIS_SCREENSHOT_FILE_NAME };
}

export async function runAiUrlDemo(input: RunAiUrlDemoInput): Promise<RunAiUrlDemoResult> {
  const renderer = input.renderer ?? "hyperframes";

  if (renderer !== "hyperframes" && renderer !== "playwright" && renderer !== "both") {
    throw new Error(`Unknown AI URL renderer: ${String(renderer)}`);
  }

  if (input.repoUrl === undefined) {
    throw new Error("repoUrl is required for AI URL demo generation");
  }

  const playwrightOutputRoot = join(input.outputRoot, "playwright");
  const captureOutputDir = join(playwrightOutputRoot, "capture");
  const analyzeWebsite = input.analyzeWebsite ?? defaultAnalyzeWebsite;
  const analyzeRepo = input.analyzeRepo ?? defaultAnalyzeRepo;
  const exploreNarrativeWebsite = input.exploreNarrativeWebsite ?? defaultExploreNarrativeWebsite;
  const prompt = input.prompt ?? "";
  // User-editable directive for the LLM agents; falls back to the shared default.
  const systemPrompt = input.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;
  const planner = input.planner ?? selectDefaultAiUrlPlanner();
  const runCapture = input.runCapture ?? runPlaywrightCapture;
  const generateHyperframes = input.generateHyperframes ?? createOpencodeHyperframesGenerator();
  const repairHyperframes = input.repairHyperframes ?? createOpencodeHyperframesRepairer();
  const runHyperframes = input.runHyperframes ?? runHyperframesRender;
  const maxHyperframesRepairAttempts = normalizeRepairAttempts(input.maxHyperframesRepairAttempts);
  const understandProduct: UnderstandProduct = input.understandProduct ?? selectDefaultUnderstandProduct();
  const strategize: Strategize = input.strategize ?? selectDefaultStrategize();

  await rm(input.outputRoot, { recursive: true, force: true });
  await mkdir(input.outputRoot, { recursive: true });

  // input.json: provenance for everything else in the run.
  const runInput = buildRunInput({
    projectId: input.projectId,
    createdAt: input.createdAt,
    productUrl: input.productUrl,
    ...(input.repoUrl === undefined ? {} : { repoUrl: input.repoUrl }),
    prompt: prompt,
    durationCapSeconds: input.durationCapSeconds,
    aspectRatio: input.aspectRatio,
    renderer,
  });
  const runInputPath = join(input.outputRoot, "input.json");
  await writeFile(runInputPath, toPrettyJson(runInput));

  input.onPhase?.("analysis");
  const analysis = await analyzeWebsite(input.productUrl, {
    outputDirectory: input.outputRoot,
    screenshotFileName: PRODUCT_ANALYSIS_SCREENSHOT_FILE_NAME,
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

  let narrativeExploration: NarrativeExploration | undefined;
  let narrativeExplorationPath: string | undefined;

  if (isNarrativeExplorationEnabled(input.enableNarrativeExploration)) {
    try {
      narrativeExploration = await exploreNarrativeWebsite(analysis.url, {
        enabled: true,
        prompt: input.prompt,
        productAnalysis: analysis,
        repoAnalysis,
      });

      if (narrativeExploration !== undefined) {
        narrativeExplorationPath = join(input.outputRoot, "narrative-exploration.json");
        await writeFile(narrativeExplorationPath, toPrettyJson(narrativeExploration));
      }
    } catch (error) {
      input.onWarning?.(`Narrative exploration failed: ${formatErrorMessage(error)}`);
    }
  }

  // ---- Product Understanding phase (renderer-agnostic; runs for every renderer) ----
  input.onPhase?.("understanding");
  const understanding = await understandProduct({
    productUrl: input.productUrl,
    ...(input.repoUrl === undefined ? {} : { repoUrl: input.repoUrl }),
    prompt,
    systemPrompt,
    websiteAnalysis: analysis,
    ...(repoAnalysis === undefined ? {} : { repoAnalysis }),
    ...(repoCheckoutDirectory === undefined ? {} : { repoCheckoutDirectory }),
  });
  const productUnderstandingPath = join(input.outputRoot, "product-understanding.json");
  await writeFile(productUnderstandingPath, toPrettyJson(understanding));

  // ---- Demo Strategy + Story phase (selects the single flow, writes the storyboard) ----
  input.onPhase?.("strategy");
  const { strategy, storyboard: strategyStoryboard } = await strategize({
    understanding,
    prompt: prompt,
    systemPrompt,
    durationCapSeconds: input.durationCapSeconds,
    aspectRatio: input.aspectRatio,
  });
  const demoStrategyPath = join(input.outputRoot, "demo-strategy.json");
  await writeFile(demoStrategyPath, toPrettyJson(strategy));
  const storyboardArtifactPath = join(input.outputRoot, "storyboard.json");
  await writeFile(storyboardArtifactPath, toPrettyJson(strategyStoryboard));

  const pipelineArtifactPaths = [runInputPath, productUnderstandingPath, demoStrategyPath, storyboardArtifactPath];
  const pipelineWarnings = dedupeStrings([...understanding.warnings, ...strategy.warnings]);

  async function runHyperframesRenderer(): Promise<InternalRendererResult> {
    if (input.repoUrl === undefined || repoAnalysis === undefined || repoCheckoutDirectory === undefined) {
      throw new Error("repoUrl is required for Hyperframes AI URL demos");
    }

    const hyperframesDir = join(input.outputRoot, "hyperframes");
    await mkdir(hyperframesDir, { recursive: true });
    const hyperframesWebsiteAnalysis = await prepareHyperframesWebsiteAnalysis(analysis, hyperframesDir);

    input.onPhase?.("planning");
    await generateHyperframes({
      productUrl: analysis.url,
      repoUrl: input.repoUrl,
      prompt: prompt,
      durationCapSeconds: input.durationCapSeconds,
      aspectRatio: input.aspectRatio,
      websiteAnalysis: hyperframesWebsiteAnalysis,
      repoAnalysis,
      repoCheckoutDirectory,
      hyperframesDir,
      hyperframesAgent: input.hyperframesAgent,
    });

    let validated: Awaited<ReturnType<typeof validateHyperframesArtifacts>> | undefined;
    let renderResult: RunHyperframesRenderResult | undefined;
    for (let attempt = 0; attempt <= maxHyperframesRepairAttempts; attempt += 1) {
      try {
        input.onPhase?.("validation");
        validated = await validateHyperframesArtifacts({ hyperframesDir, productUrl: analysis.url, repoUrl: input.repoUrl });
      } catch (error) {
        if (attempt >= maxHyperframesRepairAttempts) {
          throw error;
        }

        await repairHyperframes({
          repoCheckoutDirectory,
          hyperframesDir,
          hyperframesAgent: input.hyperframesAgent,
          failureStage: "validation",
          logText: formatErrorMessage(error),
        });
        continue;
      }

      try {
        input.onPhase?.("capture");
        renderResult = await runHyperframes({ hyperframesDir, outputVideoPath: validated.outputVideoPath });
        if (renderResult.outputVideoPath !== validated.outputVideoPath) {
          throw new Error("Hyperframes render output path must match generated outputVideoPath");
        }
        await access(renderResult.outputVideoPath);
        break;
      } catch (error) {
        if (attempt >= maxHyperframesRepairAttempts) {
          throw error;
        }

        const failure = classifyHyperframesRunFailure(error);
        await repairHyperframes({
          repoCheckoutDirectory,
          hyperframesDir,
          hyperframesAgent: input.hyperframesAgent,
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
      ...(narrativeExplorationPath ? [narrativeExplorationPath] : []),
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
      prompt: prompt,
      durationCapSeconds: input.durationCapSeconds,
      aspectRatio: input.aspectRatio,
      analysis,
      demoStrategy: strategy,
      storyboard: strategyStoryboard,
      ...(repoAnalysis === undefined ? {} : { repoAnalysis, repoCheckoutDirectory }),
      ...(narrativeExploration === undefined ? {} : { narrativeExploration }),
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
    // smooth: render a synthetic cursor, click ripples and eased scrolling into the
    // recording so the captured video already looks Screen Studio-like.
    const captureResult = await runCapture(capturePlan, { outputDir: captureOutputDir, headless: true, smooth: true });
    const captureResultPath = join(playwrightOutputRoot, "capture-result.json");
    await writeFile(captureResultPath, toPrettyJson(captureResult));

    // Cinematic metadata layer: persist the structured action trace and a derived
    // render plan (zoom/hold/click segments) next to the existing artifacts. Each action
    // is stamped with best-effort storyboard-beat lineage.
    const actionTrace = annotateActionTraceWithBeats(
      captureResult.actionTrace ?? deriveActionTraceFromCapture(capturePlan, captureResult),
      strategyStoryboard,
    );
    const actionTracePath = join(playwrightOutputRoot, "action-trace.json");
    await writeFile(actionTracePath, toPrettyJson(actionTrace));

    // First-class capture-step -> storyboard-beat lineage. Kept as a separate artifact
    // because the executed capture plan is strict-schema validated and must not be mutated.
    const captureLineage = buildCaptureLineage(capturePlan, strategyStoryboard);
    const captureLineagePath = join(playwrightOutputRoot, "capture-lineage.json");
    await writeFile(captureLineagePath, toPrettyJson(captureLineage));

    const renderPlan = buildRenderPlan(actionTrace);
    const renderPlanPath = join(playwrightOutputRoot, "render-plan.json");
    await writeFile(renderPlanPath, toPrettyJson(renderPlan));

    // Director Mode: timeline-compression decisions + a shot list that frames the demo.
    const editDecisionList = buildEditDecisionList(actionTrace);
    const editDecisionListPath = join(playwrightOutputRoot, "edit-decision-list.json");
    await writeFile(editDecisionListPath, toPrettyJson(editDecisionList));

    const finalScreenshot = captureResult.screenshots.find((asset) => asset.uri.endsWith("final.png"));
    const directorPlan = buildDirectorPlan({
      productUnderstanding: understanding,
      demoStrategy: strategy,
      storyboard: strategyStoryboard,
      capturePlan,
      actionTrace,
      renderPlan,
      editDecisionList,
      viewport: capturePlan.viewport,
      screenshots: {
        ...(finalScreenshot ? { fullPagePath: join("capture", finalScreenshot.uri) } : {}),
        actionShots: captureResult.screenshots
          .filter((asset) => asset.uri.includes("actions/"))
          .map((asset) => ({ label: asset.id, path: join("capture", asset.uri) })),
      },
    });
    const directorPlanPath = join(playwrightOutputRoot, "director-plan.json");
    await writeFile(directorPlanPath, toPrettyJson(directorPlan));

    input.onPhase?.("assembly");
    // Compile the editable DemoProject (zoom keyframes + cursor.hidden), then apply the
    // dead-time EDL as editable clip trims. This trimmed project is BOTH the saved
    // demo-project.json and the source the final.mp4 is rendered from.
    const compiledProject = compileProject({
      projectId: input.projectId,
      storyboard,
      capturePlan,
      captureResult,
      outputRoot: playwrightOutputRoot,
      createdAt: input.createdAt,
      productUrl: input.productUrl,
      ...(input.repoUrl === undefined ? {} : { sourceRepoUrl: input.repoUrl }),
      prompt: prompt,
    });
    const project = applyEditDecisionList(compiledProject, editDecisionList);
    const projectPath = join(playwrightOutputRoot, "demo-project.json");
    await writeFile(projectPath, toPrettyJson(project));

    // final.mp4 = a render OF the editable project (zoom + dead-time trims applied), with a
    // flat transcode fallback. Editable units stay in demo-project.json; the mp4 is a preview.
    const finalVideoPath = join(playwrightOutputRoot, "final.mp4");
    const finalVideoMode = await produceFinalVideo(
      project,
      playwrightOutputRoot,
      captureResult,
      captureOutputDir,
      finalVideoPath,
      renderPlan.fps,
    );
    const finalVideoProduced = finalVideoMode !== "none";
    const finalVideoSource =
      finalVideoMode === "rendered" ? "demo-project" : finalVideoMode === "transcoded" ? "raw-playwright-recording" : "none";
    const editDecisionListApplied = editDecisionList.cuts.length > 0;

    const artifactPaths = [
      productAnalysisPath,
      ...(repoAnalysisPath ? [repoAnalysisPath] : []),
      ...(narrativeExplorationPath ? [narrativeExplorationPath] : []),
      ...(analysis.screenshotPath ? [analysis.screenshotPath] : []),
      storyboardPath,
      capturePlanPath,
      captureResultPath,
      actionTracePath,
      captureLineagePath,
      renderPlanPath,
      editDecisionListPath,
      directorPlanPath,
      ...(finalVideoProduced ? [finalVideoPath] : []),
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
      finalVideoProduced,
      ...(finalVideoProduced ? { finalVideoPath } : {}),
      finalVideoMode,
      finalVideoSource,
      editDecisionListApplied,
      coverageActionTrace: actionTrace,
      coverageCaptureLineage: captureLineage,
    };
  }

  let renderError: unknown;
  try {
    let internal: InternalRendererResult;

    if (renderer === "hyperframes") {
      internal = await runHyperframesRenderer();
    } else if (renderer === "playwright") {
      internal = await runPlaywrightRenderer();
    } else {
      const playwrightResult = await runPlaywrightRenderer();
      const hyperframesResult = await runHyperframesRenderer();
      internal = {
        projectPath: hyperframesResult.projectPath,
        captureResultPath: hyperframesResult.captureResultPath,
        outputRoot: input.outputRoot,
        artifactPaths: mergeArtifactPaths(hyperframesResult.artifactPaths, playwrightResult.artifactPaths),
        captureCounts: combineCaptureCounts(hyperframesResult.captureCounts, playwrightResult.captureCounts),
        rendererResults: {
          ...hyperframesResult.rendererResults,
          ...playwrightResult.rendererResults,
        },
        finalVideoProduced: playwrightResult.finalVideoProduced ?? false,
        ...(playwrightResult.finalVideoPath ? { finalVideoPath: playwrightResult.finalVideoPath } : {}),
        finalVideoMode: playwrightResult.finalVideoMode,
        finalVideoSource: playwrightResult.finalVideoSource,
        editDecisionListApplied: playwrightResult.editDecisionListApplied,
        coverageActionTrace: playwrightResult.coverageActionTrace,
        coverageCaptureLineage: playwrightResult.coverageCaptureLineage,
      };
    }

    // run-summary.json: single top-level record of what the pipeline produced.
    const finalVideoProduced = internal.finalVideoProduced ?? false;
    const runSummaryPath = join(input.outputRoot, "run-summary.json");
    const artifactPaths = mergeArtifactPaths(pipelineArtifactPaths, internal.artifactPaths, [runSummaryPath]);

    const fellBack = (warnings: string[], markers: readonly string[]) => warnings.some((w) => markers.includes(w));
    const phaseMode = (warnings: string[], markers: readonly string[]) =>
      !agentBackendEnabled() ? "deterministic" : fellBack(warnings, markers) ? "deterministic-fallback" : "claude-code";

    const coverage = buildCoreCoverage({
      strategy,
      storyboard: strategyStoryboard,
      ...(internal.coverageActionTrace ? { actionTrace: internal.coverageActionTrace } : {}),
      ...(internal.coverageCaptureLineage ? { captureLineage: internal.coverageCaptureLineage } : {}),
      finalVideoProduced,
    });

    const execution: RunExecution = {
      understandingMode: phaseMode(understanding.warnings, UNDERSTANDING_FALLBACK_WARNINGS),
      strategyMode: phaseMode(strategy.warnings, [STRATEGY_FALLBACK_WARNING]),
      playwrightPlannerMode: agentBackendEnabled() ? "claude-code" : "opencode",
      finalVideoMode: internal.finalVideoMode ?? "none",
      finalVideoSource: internal.finalVideoSource ?? "none",
      directorPlanApplied: "none",
      renderPlanApplied: "none",
      editDecisionListApplied: internal.editDecisionListApplied ?? false,
      finalVideoReflectsEditDecisionList: (internal.editDecisionListApplied ?? false) && internal.finalVideoMode === "rendered",
      cameraSource: "demo-project.zooms (compileProject suggestInteractionZooms); render-plan.json is metadata only",
      notes: ["director-plan.json and render-plan.json are metadata only in this build; not applied to final.mp4."],
    };

    const runSummary = buildRunSummary({
      renderer,
      outputRoot: input.outputRoot,
      storyboard: strategyStoryboard,
      artifactPaths,
      captureSucceeded: true,
      finalVideoProduced,
      warnings: dedupeStrings([...pipelineWarnings, ...coverage.warnings]),
      execution,
      coreCoverage: coverage.items,
    });
    await writeFile(runSummaryPath, toPrettyJson(runSummary));

    const pipeline: RunAiUrlDemoPipeline = {
      runInputPath,
      productUnderstandingPath,
      demoStrategyPath,
      storyboardPath: storyboardArtifactPath,
      runSummaryPath,
      ...(internal.finalVideoPath ? { finalVideoPath: internal.finalVideoPath } : {}),
      warnings: pipelineWarnings,
    };

    return {
      renderer,
      projectPath: internal.projectPath,
      captureResultPath: internal.captureResultPath,
      outputRoot: input.outputRoot,
      artifactPaths,
      captureCounts: internal.captureCounts,
      rendererResults: internal.rendererResults,
      pipeline,
    };
  } catch (error) {
    renderError = error;
    throw error;
  } finally {
    await cleanupRepoScratch(repoScratchDir, renderError);
  }
}
