import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
import {
  createClaudeCodeAiUrlPlanner,
  createOpencodeAiUrlPlanner,
  type AiUrlPlanner,
  type AiUrlPlannerResult,
} from "./aiPlanning.js";
import { deriveProductUnderstanding, type UnderstandProduct } from "./productUnderstanding.js";
import { deriveDemoStrategy, type Strategize } from "./demoStrategy.js";
import { createClaudeUnderstandingAgent, createOpencodeUnderstandingAgent, UNDERSTANDING_FALLBACK_WARNINGS } from "./understandingAgent.js";
import { createClaudeStrategyAgent, createOpencodeStrategyAgent, STRATEGY_FALLBACK_WARNING } from "./demoStrategyAgent.js";
import { buildCoreCoverage } from "./coreCoverage.js";
import type { RunExecution } from "./runSummary.js";
import { buildRunInput, buildRunSummary } from "./runSummary.js";
import { DEFAULT_SYSTEM_PROMPT, type DemoOutline } from "@tinker/generation-contract";
import { runTestreelRecording, type RunTestreelRecordingResult } from "./testreelRunner.js";
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
type RunTestreelDependency = (options: {
  testreelRoot: string;
  plan: AiUrlPlannerResult["recordingPlan"];
  signal?: AbortSignal;
  onPhase?: (phase: "verification" | "capture" | "assembly") => void;
}) => Promise<RunTestreelRecordingResult>;

type RendererResults = {
  testreel: {
    recordingPlanPath: string;
    recordingPath: string;
    outputDirectory: string;
    finalVideoPath: string;
    manifestPath?: string;
    screenshotPaths: string[];
  };
};

export type RunAiUrlDemoInput = {
  outputRoot: string;
  projectId: string;
  createdAt: string;
  productUrl: string;
  prompt?: string;
  /** Optional approved planning outline used as strong structured guidance. */
  approvedOutline?: DemoOutline;
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
  runTestreel?: RunTestreelDependency;
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
  renderer: "testreel";
  rendererResults: RendererResults;
  publishedVideoPath: string;
  outputRoot: string;
  artifactPaths: string[];
  pipeline: RunAiUrlDemoPipeline;
};

function toPrettyJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
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
 * Choose the agent backend for the Testreel recording planner. opencode by default; the local
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

  const testreelRoot = join(input.outputRoot, "testreel");
  const analyzeWebsite = input.analyzeWebsite ?? defaultAnalyzeWebsite;
  const analyzeRepo = input.analyzeRepo ?? defaultAnalyzeRepo;
  const exploreNarrativeWebsite = input.exploreNarrativeWebsite ?? defaultExploreNarrativeWebsite;
  const prompt = input.prompt ?? "";
  // User-editable directive for the LLM agents; falls back to the shared default.
  const systemPrompt = input.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;
  const planner = input.planner ?? selectDefaultAiUrlPlanner();
  const runTestreel = input.runTestreel ?? ((options) => runTestreelRecording(options));
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
    ...(input.approvedOutline === undefined ? {} : { approvedOutline: input.approvedOutline }),
    durationCapSeconds: input.durationCapSeconds,
    aspectRatio: input.aspectRatio,
    renderer: "testreel",
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
    ...(input.approvedOutline === undefined ? {} : { approvedOutline: input.approvedOutline }),
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

  let renderError: unknown;
  try {
    input.onPhase?.("planning");
    throwIfAborted();
    const plannerResult: AiUrlPlannerResult = await planner({
      productUrl: analysis.url,
      prompt,
      ...(input.approvedOutline === undefined ? {} : { approvedOutline: input.approvedOutline }),
      durationCapSeconds: input.durationCapSeconds,
      aspectRatio: input.aspectRatio,
      analysis,
      demoStrategy: strategy,
      storyboard: strategyStoryboard,
      ...(repoAnalysis === undefined ? {} : { repoAnalysis, repoCheckoutDirectory }),
      ...(narrativeExploration === undefined ? {} : { narrativeExploration }),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });

    const recordingResult = await runTestreel({
      testreelRoot,
      plan: plannerResult.recordingPlan,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      onPhase: (phase) => input.onPhase?.(phase),
    });
    throwIfAborted();

    // run-summary.json: single top-level record of what the pipeline produced.
    const finalVideoProduced = true;
    const runSummaryPath = join(input.outputRoot, "run-summary.json");
    const artifactPaths = mergeArtifactPaths(
      pipelineArtifactPaths,
      [
        productAnalysisPath,
        ...(repoAnalysisPath ? [repoAnalysisPath] : []),
        ...(narrativeExplorationPath ? [narrativeExplorationPath] : []),
        ...(analysis.screenshotPath ? [analysis.screenshotPath] : []),
      ],
      recordingResult.artifactPaths,
      [runSummaryPath],
    );

    const fellBack = (warnings: string[], markers: readonly string[]) => warnings.some((w) => markers.includes(w));
    const backend = selectedAgentBackend();
    const phaseMode = (warnings: string[], markers: readonly string[]) =>
      backend === "deterministic" ? "deterministic" : fellBack(warnings, markers) ? "deterministic-fallback" : backend;

    const coverage = buildCoreCoverage({
      strategy,
      storyboard: strategyStoryboard,
      finalVideoProduced,
      finalVideoRef: "testreel/final.mp4",
    });

    const execution: RunExecution = {
      understandingMode: phaseMode(understanding.warnings, UNDERSTANDING_FALLBACK_WARNINGS),
      strategyMode: phaseMode(strategy.warnings, [STRATEGY_FALLBACK_WARNING]),
      plannerMode: backend === "claude-code" ? "claude-code" : "opencode",
      finalVideoMode: "testreel",
      finalVideoSource: "testreel-cli",
      checkpointMode: "planner-declared",
      notes: ["Testreel produced the published MP4; checkpoints are planner-declared unless enforced by Testreel wait steps."],
    };

    const runSummary = buildRunSummary({
      renderer: "testreel",
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
      finalVideoPath: recordingResult.finalVideoPath,
      warnings: pipelineWarnings,
    };

    return {
      renderer: "testreel",
      publishedVideoPath: recordingResult.finalVideoPath,
      outputRoot: input.outputRoot,
      artifactPaths,
      rendererResults: {
        testreel: {
          recordingPlanPath: recordingResult.recordingPlanPath,
          recordingPath: recordingResult.recordingPath,
          outputDirectory: recordingResult.outputDirectory,
          finalVideoPath: recordingResult.finalVideoPath,
          ...(recordingResult.manifestPath ? { manifestPath: recordingResult.manifestPath } : {}),
          screenshotPaths: recordingResult.screenshotPaths,
        },
      },
      pipeline,
    };
  } catch (error) {
    renderError = error;
    throw error;
  } finally {
    await cleanupRepoScratch(repoScratchDir, renderError);
  }
}
