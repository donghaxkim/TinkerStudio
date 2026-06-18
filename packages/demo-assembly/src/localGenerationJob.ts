import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CreateDemoRequestSchema,
  GenerationErrorSchema,
  GenerationJobSchema,
  GenerationProgressEventSchema,
  GenerationResultSchema,
  type CreateDemoRequest,
  type GenerationError,
  type GenerationFailureStage,
  type GenerationJob,
  type GenerationProgressEvent,
  type GenerationStatus,
  type ManualFixtureGenerationResult,
} from "@tinker/generation-contract";
import {
  runAiUrlDemo,
  type AiUrlDemoPhase,
  type RunAiUrlDemoInput,
  type RunAiUrlDemoResult,
} from "./runAiUrlDemo.js";

export type AiUrlDemoRunner = (input: RunAiUrlDemoInput) => Promise<RunAiUrlDemoResult>;
export type LocalDemoResult = RunAiUrlDemoResult;

export type RunLocalGenerationJobOptions = {
  now?: () => string;
  onProgress?: (event: GenerationProgressEvent) => void;
  runAiUrlDemo?: AiUrlDemoRunner;
};

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const generatedRoot = resolve(repoRoot, "generated");

export class LocalGenerationJobError extends Error {
  readonly generationError: GenerationError;

  constructor(generationError: GenerationError, options?: ErrorOptions) {
    super(generationError.message, options);
    this.name = "LocalGenerationJobError";
    this.generationError = generationError;
  }
}

function formatUnknownError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function formatValidationError(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  return error.issues
    .map((issue) => `${issue.path.map(String).join(".") || "request"}: ${issue.message}`)
    .join("; ");
}

function extractJobId(request: unknown, fallbackTime: string) {
  if (request && typeof request === "object" && "id" in request) {
    const value = (request as { id?: unknown }).id;

    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  const parsedTime = Date.parse(fallbackTime);
  return Number.isFinite(parsedTime) ? `local-${parsedTime.toString(36)}` : "local-generation-job";
}

function resolveSafeOutputDirectory(outputDirectory: string | undefined, jobId: string) {
  const resolved = outputDirectory ? resolve(repoRoot, outputDirectory) : join(generatedRoot, "local-job", jobId);
  const relativeToGenerated = relative(generatedRoot, resolved);

  if (relativeToGenerated === "" || relativeToGenerated.startsWith("..") || isAbsolute(relativeToGenerated)) {
    throw new Error("outputDirectory must resolve inside the generated directory");
  }

  return resolved;
}

function createFailure(jobId: string | undefined, stage: GenerationFailureStage, message: string) {
  return GenerationErrorSchema.parse({
    ...(jobId ? { jobId } : {}),
    status: "failed",
    stage,
    message,
  });
}

function statusForPhase(phase: GenerationFailureStage): GenerationStatus {
  if (phase === "capture") {
    return "capturing";
  }

  if (phase === "assembly") {
    return "assembling";
  }

  return "running";
}

// The pipeline now reports two extra phases ("understanding", "strategy") that are not
// part of the shared GenerationFailureStage contract. Map them onto "planning" so failure
// reporting stays contract-valid while progress messages keep the real phase name.
function toFailureStage(phase: AiUrlDemoPhase): GenerationFailureStage {
  switch (phase) {
    case "analysis":
      return "analysis";
    case "understanding":
    case "strategy":
    case "planning":
      return "planning";
    case "validation":
      return "validation";
    case "verification":
      return "verification";
    case "capture":
      return "capture";
    case "assembly":
      return "assembly";
  }
}

export async function runLocalGenerationJob(
  rawRequest: unknown,
  options: RunLocalGenerationJobOptions = {},
): Promise<ManualFixtureGenerationResult> {
  const now = options.now ?? (() => new Date().toISOString());
  const aiUrlRunner = options.runAiUrlDemo ?? runAiUrlDemo;
  const initialTime = now();
  const jobId = extractJobId(rawRequest, initialTime);

  let job: GenerationJob | undefined;

  function emit(status: GenerationStatus, message: string, artifactPath?: string, error?: GenerationError) {
    const time = now();

    if (job) {
      job = GenerationJobSchema.parse({ ...job, status, updatedAt: time, ...(error ? { error } : {}) });
    }

    const event = GenerationProgressEventSchema.parse({
      jobId,
      status,
      message,
      time,
      ...(artifactPath ? { artifactPath } : {}),
    });

    options.onProgress?.(event);
  }

  const parsedRequest = CreateDemoRequestSchema.safeParse(rawRequest);

  if (!parsedRequest.success) {
    const failure = createFailure(jobId, "validation", formatValidationError(parsedRequest.error));
    emit("failed", failure.message, undefined, failure);
    throw new LocalGenerationJobError(failure);
  }

  const request: CreateDemoRequest = parsedRequest.data;

  if (!("mode" in request) || request.mode !== "ai-url-planning") {
    const failure = createFailure(jobId, "validation", "Local generation jobs require mode: ai-url-planning");
    emit("failed", failure.message, undefined, failure);
    throw new LocalGenerationJobError(failure);
  }

  let outputDirectory: string;

  try {
    outputDirectory = resolveSafeOutputDirectory(request.outputDirectory, jobId);
  } catch (error) {
    const failure = createFailure(jobId, "validation", formatUnknownError(error));
    emit("failed", failure.message, request.outputDirectory, failure);
    throw new LocalGenerationJobError(failure, { cause: error });
  }

  job = GenerationJobSchema.parse({
    id: jobId,
    request,
    status: "queued",
    createdAt: initialTime,
    updatedAt: initialTime,
  });

  emit("queued", "Generation job queued");
  emit("running", "Generation job running");

  let activeStage: GenerationFailureStage = "unknown";

  try {
    const demoResult: LocalDemoResult = await aiUrlRunner({
      outputRoot: outputDirectory,
      projectId: jobId,
      createdAt: initialTime,
      productUrl: request.productUrl,
      repoUrl: request.repoUrl,
      renderer: request.renderer,
      hyperframesAgent: request.hyperframesAgent,
      prompt: request.prompt ?? "Make a short demo of the main value prop.",
      durationCapSeconds: request.durationCapSeconds,
      aspectRatio: request.aspectRatio,
      onPhase: (phase: AiUrlDemoPhase) => {
        activeStage = toFailureStage(phase);
        emit(statusForPhase(activeStage), `AI URL ${phase} started`);
      },
    });

    const result = GenerationResultSchema.parse({
      jobId,
      status: "completed",
      projectPath: demoResult.projectPath,
      captureResultPath: demoResult.captureResultPath,
      outputDirectory,
      artifactPaths: demoResult.artifactPaths,
      ...("renderer" in demoResult ? { renderer: demoResult.renderer, rendererResults: demoResult.rendererResults } : {}),
    });

    if (!("projectPath" in result)) {
      throw new Error("Local generation job result is missing projectPath");
    }

    emit("completed", "Generation job completed", result.projectPath);

    return result;
  } catch (error) {
    const failure = createFailure(jobId, activeStage, formatUnknownError(error));
    emit("failed", failure.message, undefined, failure);
    throw new LocalGenerationJobError(failure, { cause: error });
  }
}
