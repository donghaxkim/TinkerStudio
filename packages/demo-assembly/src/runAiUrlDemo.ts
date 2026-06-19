import { access, mkdir, rm, writeFile } from "node:fs/promises";
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
  type RenderPlan,
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
import { compileProject } from "./compileProject.js";
import {
  createClaudeCodeAiUrlPlanner,
  createOpencodeAiUrlPlanner,
  type AiUrlPlanner,
  type AiUrlPlannerResult,
} from "./aiPlanning.js";
import { deriveProductUnderstanding, type UnderstandProduct } from "./productUnderstanding.js";
import { deriveDemoStrategy, type Storyboard, type Strategize } from "./demoStrategy.js";
import { createClaudeUnderstandingAgent, createOpencodeUnderstandingAgent, UNDERSTANDING_FALLBACK_WARNINGS } from "./understandingAgent.js";
import { createClaudeStrategyAgent, createOpencodeStrategyAgent, STRATEGY_FALLBACK_WARNING } from "./demoStrategyAgent.js";
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
import type { DemoProject, ZoomKeyframe } from "@tinker/project-schema";
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

const PRODUCT_ANALYSIS_SCREENSHOT_FILE_NAME = "product-analysis.png";

type AnalyzeWebsiteDependency = (url: string, options: AnalyzeWebsiteOptions) => Promise<ProductAnalysis>;
type AnalyzeRepoDependency = (repoUrl: string, options: AnalyzeRepoOptions) => Promise<RepoAnalysis>;
type ExploreNarrativeWebsiteDependency = (
  productUrl: string,
  options: ExploreNarrativeWebsiteOptions,
) => Promise<NarrativeExploration | undefined>;
type RunCaptureDependency = (
  plan: CapturePlan,
  options: { outputDir: string; headless?: boolean; smooth?: boolean; signal?: AbortSignal },
) => Promise<CaptureResult>;
type PlaywrightRendererResult = {
  projectPath: string;
  captureResultPath: string;
};

type RendererResults = {
  playwright: PlaywrightRendererResult;
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
  signal?: AbortSignal;
  onPhase?: (phase: AiUrlDemoPhase) => void;
  analyzeWebsite?: AnalyzeWebsiteDependency;
  analyzeRepo?: AnalyzeRepoDependency;
  enableNarrativeExploration?: boolean;
  exploreNarrativeWebsite?: ExploreNarrativeWebsiteDependency;
  onWarning?: (message: string) => void;
  planner?: AiUrlPlanner;
  runCapture?: RunCaptureDependency;
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
  renderer: "playwright";
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
  renderPlanApplied?: boolean;
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
  signal: AbortSignal | undefined,
): Promise<FinalVideoMode> {
  function throwIfAborted() {
    if (signal?.aborted) {
      throw new DOMException("Generation cancelled.", "AbortError");
    }
  }

  throwIfAborted();
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
      signal,
    });
    return "rendered";
  } catch (renderError) {
    throwIfAborted();
    console.warn(
      `final.mp4 project render failed, falling back to flat transcode: ${
        renderError instanceof Error ? renderError.message : String(renderError)
      }`,
    );
    try {
      await transcodeToMp4(rawVideoPath, finalVideoPath, { fps, signal });
      return "transcoded";
    } catch (transcodeError) {
      throwIfAborted();
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

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function isNarrativeExplorationEnabled(value: boolean | undefined) {
  return value ?? process.env.TINKER_NARRATIVE_EXPLORATION === "1";
}

function mergeArtifactPaths(...artifactPathGroups: string[][]) {
  return [...new Set(artifactPathGroups.flat())];
}

type AgentBackend = "claude-code" | "opencode" | "deterministic";

function selectedAgentBackend(): AgentBackend {
  const b = (process.env.TINKER_AGENT_BACKEND ?? "").trim().toLowerCase();
  if (b === "claude-code" || b === "claude") {
    return "claude-code";
  }
  if (b === "opencode") {
    return "opencode";
  }
  return "deterministic";
}

/**
 * Choose the agent backend for the Playwright planner. opencode by default; the local
 * Claude Code CLI when TINKER_AGENT_BACKEND=claude-code (so the full pipeline can run
 * without opencode installed). The planner contract is identical for both backends.
 */
function selectDefaultAiUrlPlanner(): AiUrlPlanner {
  const backend = selectedAgentBackend();
  if (backend === "claude-code") {
    return createClaudeCodeAiUrlPlanner();
  }
  return createOpencodeAiUrlPlanner();
}

function selectDefaultUnderstandProduct(): UnderstandProduct {
  const backend = selectedAgentBackend();
  if (backend === "claude-code") {
    return createClaudeUnderstandingAgent();
  }
  if (backend === "opencode") {
    return createOpencodeUnderstandingAgent();
  }
  return async (a) => deriveProductUnderstanding(a);
}

function selectDefaultStrategize(): Strategize {
  const backend = selectedAgentBackend();
  if (backend === "claude-code") {
    return createClaudeStrategyAgent();
  }
  if (backend === "opencode") {
    return createOpencodeStrategyAgent();
  }
  return async (a) => deriveDemoStrategy(a);
}

function dedupeStrings(values: string[]) {
  return [...new Set(values)];
}

function cleanNumber(value: number) {
  return Number(value.toFixed(6));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function renderPlanZoomTarget(segment: RenderPlan["zoomSegments"][number], frame: { width: number; height: number }): ZoomKeyframe["target"] {
  const scale = Math.max(segment.scale, 1);
  const width = frame.width / scale;
  const height = frame.height / scale;
  return {
    x: cleanNumber(clamp(segment.focus.x * frame.width - width / 2, 0, frame.width - width)),
    y: cleanNumber(clamp(segment.focus.y * frame.height - height / 2, 0, frame.height - height)),
    width: cleanNumber(width),
    height: cleanNumber(height),
  };
}

function applyRenderPlanZooms(project: DemoProject, renderPlan: RenderPlan): { project: DemoProject; applied: boolean } {
  if (renderPlan.zoomSegments.length === 0) {
    return { project, applied: false };
  }

  const videoAsset = project.assets.find((asset) => asset.type === "video");
  const frame =
    videoAsset?.width !== undefined && videoAsset.height !== undefined
      ? { width: videoAsset.width, height: videoAsset.height }
      : renderPlan.resolution;
  const zooms = renderPlan.zoomSegments
    .map((segment, index): ZoomKeyframe | undefined => {
      const start = cleanNumber(clamp(segment.start, 0, project.duration));
      const end = cleanNumber(clamp(segment.end, start, project.duration));
      if (end <= start) {
        return undefined;
      }
      return {
        id: `render-plan-${segment.id || index + 1}`,
        start,
        end,
        target: renderPlanZoomTarget(segment, frame),
        scale: cleanNumber(Math.max(segment.scale, 1)),
        easing: "easeInOut",
        name: segment.reason,
      };
    })
    .filter((zoom): zoom is ZoomKeyframe => zoom !== undefined);

  if (zooms.length === 0) {
    return { project, applied: false };
  }

  return { project: { ...project, zooms: [...project.zooms, ...zooms] }, applied: true };
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

export async function runAiUrlDemo(input: RunAiUrlDemoInput): Promise<RunAiUrlDemoResult> {
  function throwIfAborted() {
    if (input.signal?.aborted) {
      throw new DOMException("Generation cancelled.", "AbortError");
    }
  }

  throwIfAborted();

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
  const understandProduct: UnderstandProduct = input.understandProduct ?? selectDefaultUnderstandProduct();
  const strategize: Strategize = input.strategize ?? selectDefaultStrategize();

  await rm(input.outputRoot, { recursive: true, force: true });
  await mkdir(input.outputRoot, { recursive: true });
  throwIfAborted();

  // input.json: provenance for everything else in the run.
  const runInput = buildRunInput({
    projectId: input.projectId,
    createdAt: input.createdAt,
    productUrl: input.productUrl,
    ...(input.repoUrl === undefined ? {} : { repoUrl: input.repoUrl }),
    prompt: prompt,
    durationCapSeconds: input.durationCapSeconds,
    aspectRatio: input.aspectRatio,
    renderer: "playwright",
  });
  const runInputPath = join(input.outputRoot, "input.json");
  await writeFile(runInputPath, toPrettyJson(runInput));
  throwIfAborted();

  input.onPhase?.("analysis");
  throwIfAborted();
  const analysis = await analyzeWebsite(input.productUrl, {
    outputDirectory: input.outputRoot,
    screenshotFileName: PRODUCT_ANALYSIS_SCREENSHOT_FILE_NAME,
    headless: true,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  const productAnalysisPath = join(input.outputRoot, "product-analysis.json");
  await writeFile(productAnalysisPath, toPrettyJson(analysis));
  throwIfAborted();

  let repoAnalysis: RepoAnalysis | undefined;
  let repoAnalysisPath: string | undefined;
  let repoScratchDir: string | undefined;
  let repoCheckoutDirectory: string | undefined;

  if (input.repoUrl !== undefined) {
    repoScratchDir = join(input.outputRoot, ".repo-scratch");
    repoCheckoutDirectory = join(repoScratchDir, "checkout");

    try {
      repoAnalysis = parseRepoAnalysis(
        await analyzeRepo(input.repoUrl, {
          checkoutDirectory: repoCheckoutDirectory,
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        }),
        input.repoUrl,
      );
      repoAnalysisPath = join(input.outputRoot, "repo-analysis.json");
      await writeFile(repoAnalysisPath, toPrettyJson(repoAnalysis));
      throwIfAborted();
    } catch (error) {
      await cleanupRepoScratch(repoScratchDir, error);
      throw error;
    }
  }

  let narrativeExploration: NarrativeExploration | undefined;
  let narrativeExplorationPath: string | undefined;

  if (isNarrativeExplorationEnabled(input.enableNarrativeExploration)) {
    throwIfAborted();
    try {
      narrativeExploration = await exploreNarrativeWebsite(analysis.url, {
        enabled: true,
        prompt: input.prompt,
        productAnalysis: analysis,
        repoAnalysis,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });

      if (narrativeExploration !== undefined) {
        narrativeExplorationPath = join(input.outputRoot, "narrative-exploration.json");
        await writeFile(narrativeExplorationPath, toPrettyJson(narrativeExploration));
        throwIfAborted();
      }
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      input.onWarning?.(`Narrative exploration failed: ${formatErrorMessage(error)}`);
    }
  }

  // ---- Product Understanding phase (renderer-agnostic; runs for every renderer) ----
  input.onPhase?.("understanding");
  throwIfAborted();
  const understanding = await understandProduct({
    productUrl: input.productUrl,
    ...(input.repoUrl === undefined ? {} : { repoUrl: input.repoUrl }),
    prompt,
    systemPrompt,
    websiteAnalysis: analysis,
    ...(repoAnalysis === undefined ? {} : { repoAnalysis }),
    ...(repoCheckoutDirectory === undefined ? {} : { repoCheckoutDirectory }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  const productUnderstandingPath = join(input.outputRoot, "product-understanding.json");
  await writeFile(productUnderstandingPath, toPrettyJson(understanding));
  throwIfAborted();

  // ---- Demo Strategy + Story phase (selects the single flow, writes the storyboard) ----
  input.onPhase?.("strategy");
  throwIfAborted();
  const { strategy, storyboard: strategyStoryboard } = await strategize({
    understanding,
    prompt: prompt,
    systemPrompt,
    durationCapSeconds: input.durationCapSeconds,
    aspectRatio: input.aspectRatio,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  const demoStrategyPath = join(input.outputRoot, "demo-strategy.json");
  await writeFile(demoStrategyPath, toPrettyJson(strategy));
  const storyboardArtifactPath = join(input.outputRoot, "storyboard.json");
  await writeFile(storyboardArtifactPath, toPrettyJson(strategyStoryboard));
  throwIfAborted();

  const pipelineArtifactPaths = [runInputPath, productUnderstandingPath, demoStrategyPath, storyboardArtifactPath];
  const pipelineWarnings = dedupeStrings([...understanding.warnings, ...strategy.warnings]);

  async function runPlaywrightRenderer(): Promise<InternalRendererResult> {
    await mkdir(captureOutputDir, { recursive: true });
    throwIfAborted();

    input.onPhase?.("planning");
    throwIfAborted();
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
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });

    const { storyboard, capturePlan } = plannerResult!;
    const storyboardPath = join(playwrightOutputRoot, "storyboard.json");
    await writeFile(storyboardPath, toPrettyJson(storyboard));
    throwIfAborted();

    input.onPhase?.("verification");
    throwIfAborted();
    const verification = verifyCapturePlan(capturePlan);
    if (!verification.valid) {
      throw new Error(`Generated capture plan failed verification: ${formatCapturePlanIssues(verification)}`);
    }
    const capturePlanPath = join(playwrightOutputRoot, "capture-plan.json");
    await writeFile(capturePlanPath, toPrettyJson(capturePlan));
    throwIfAborted();

    input.onPhase?.("capture");
    // smooth: render a synthetic cursor, click ripples and eased scrolling into the
    // recording so the captured video already looks Screen Studio-like.
    const captureResult = await runCapture(capturePlan, {
      outputDir: captureOutputDir,
      headless: true,
      smooth: true,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
    throwIfAborted();
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
    const editDecisionList = buildEditDecisionList(actionTrace, { targetDurationSeconds: input.durationCapSeconds });
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
    throwIfAborted();

    input.onPhase?.("assembly");
    throwIfAborted();
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
    const renderPlanAppliedToProject = applyRenderPlanZooms(compiledProject, renderPlan);
    const project = applyEditDecisionList(renderPlanAppliedToProject.project, editDecisionList);
    const projectPath = join(playwrightOutputRoot, "demo-project.json");
    await writeFile(projectPath, toPrettyJson(project));

    // final.mp4 = a render OF the editable project (zoom + dead-time trims applied), with a
    // flat transcode fallback. Editable units stay in demo-project.json; the mp4 is a preview.
    const finalVideoPath = join(playwrightOutputRoot, "final.mp4");
    throwIfAborted();
    const finalVideoMode = await produceFinalVideo(
      project,
      playwrightOutputRoot,
      captureResult,
      captureOutputDir,
      finalVideoPath,
      renderPlan.fps,
      input.signal,
    );
    const finalVideoProduced = finalVideoMode !== "none";
    const finalVideoSource =
      finalVideoMode === "rendered" ? "demo-project" : finalVideoMode === "transcoded" ? "raw-playwright-recording" : "none";
    const editDecisionListApplied = editDecisionList.removedSeconds > 0;

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
      renderPlanApplied: renderPlanAppliedToProject.applied,
      coverageActionTrace: actionTrace,
      coverageCaptureLineage: captureLineage,
    };
  }

  let renderError: unknown;
  try {
    const internal = await runPlaywrightRenderer();

    // run-summary.json: single top-level record of what the pipeline produced.
    const finalVideoProduced = internal.finalVideoProduced ?? false;
    const runSummaryPath = join(input.outputRoot, "run-summary.json");
    const artifactPaths = mergeArtifactPaths(pipelineArtifactPaths, internal.artifactPaths, [runSummaryPath]);

    const fellBack = (warnings: string[], markers: readonly string[]) => warnings.some((w) => markers.includes(w));
    const backend = selectedAgentBackend();
    const phaseMode = (warnings: string[], markers: readonly string[]) =>
      backend === "deterministic" ? "deterministic" : fellBack(warnings, markers) ? "deterministic-fallback" : backend;

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
      playwrightPlannerMode: backend === "claude-code" ? "claude-code" : "opencode",
      finalVideoMode: internal.finalVideoMode ?? "none",
      finalVideoSource: internal.finalVideoSource ?? "none",
      directorPlanApplied: "none",
      renderPlanApplied: internal.renderPlanApplied ? "full" : "none",
      editDecisionListApplied: internal.editDecisionListApplied ?? false,
      finalVideoReflectsEditDecisionList: (internal.editDecisionListApplied ?? false) && internal.finalVideoMode === "rendered",
      cameraSource: internal.renderPlanApplied
        ? "demo-project.zooms from compileProject plus render-plan.json zoom segments"
        : "demo-project.zooms from compileProject suggestInteractionZooms",
      notes: internal.renderPlanApplied
        ? ["render-plan.json zoom segments were materialized into demo-project.json before EDL trimming; director-plan.json remains metadata only."]
        : ["No render-plan zoom segments were available to apply; director-plan.json remains metadata only."],
    };

    const runSummary = buildRunSummary({
      renderer: "playwright",
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
      renderer: "playwright",
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
