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
  type GenerationResult,
  type GenerationStatus,
} from "@tinker/generation-contract";
import {
  runAiUrlDemo,
  type AiUrlDemoPhase,
  type RunAiUrlDemoInput,
  type RunAiUrlDemoResult,
} from "./runAiUrlDemo.js";
import { runManualDemo, type RunManualDemoInput, type RunManualDemoResult } from "./runManualDemo.js";

export type ManualDemoRunner = (input: RunManualDemoInput) => Promise<RunManualDemoResult>;
export type AiUrlDemoRunner = (input: RunAiUrlDemoInput) => Promise<RunAiUrlDemoResult>;
export type LocalDemoResult = RunManualDemoResult | RunAiUrlDemoResult;

export type RunLocalGenerationJobOptions = {
  now?: () => string;
  onProgress?: (event: GenerationProgressEvent) => void;
  runManualDemo?: ManualDemoRunner;
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

export async function runLocalGenerationJob(
  rawRequest: unknown,
  options: RunLocalGenerationJobOptions = {},
): Promise<GenerationResult> {
  const now = options.now ?? (() => new Date().toISOString());
  const manualRunner = options.runManualDemo ?? runManualDemo;
  const aiUrlRunner = options.runAiUrlDemo ?? runAiUrlDemo;
  const initialTime = now();
  const jobId = extractJobId(rawRequest, initialTime);

  let job: GenerationJob | undefined;

  function emit(status: GenerationStatus, message: string, artifactPath?: string) {
    const time = now();

    if (job) {
      job = GenerationJobSchema.parse({ ...job, status, updatedAt: time });
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
    emit("failed", failure.message);
    throw new LocalGenerationJobError(failure);
  }

  const request: CreateDemoRequest = parsedRequest.data;

  let outputDirectory: string;

  try {
    outputDirectory = resolveSafeOutputDirectory(request.outputDirectory, jobId);
  } catch (error) {
    const failure = createFailure(jobId, "validation", formatUnknownError(error));
    emit("failed", failure.message, request.outputDirectory);
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
    let demoResult: LocalDemoResult;

    if (request.mode === "manual-fixture") {
      demoResult = await manualRunner({
        outputRoot: outputDirectory,
        projectId: jobId,
        createdAt: initialTime,
        ...(request.repoUrl === undefined ? {} : { sourceRepoUrl: request.repoUrl }),
        ...(request.productUrl === undefined ? {} : { productUrl: request.productUrl }),
        ...(request.prompt === undefined ? {} : { prompt: request.prompt }),
        onPhase: (phase) => {
          activeStage = phase;
          emit(statusForPhase(phase), `Manual fixture ${phase} started`);
        },
      });
    } else {
      demoResult = await aiUrlRunner({
        outputRoot: outputDirectory,
        projectId: jobId,
        createdAt: initialTime,
        productUrl: request.productUrl,
        prompt: request.prompt ?? "Make a short demo of the main value prop.",
        durationCapSeconds: request.durationCapSeconds,
        aspectRatio: request.aspectRatio,
        onPhase: (phase: AiUrlDemoPhase) => {
          activeStage = phase;
          emit(statusForPhase(phase), `AI URL ${phase} started`);
        },
      });
    }

    const result = GenerationResultSchema.parse({
      jobId,
      status: "completed",
      projectPath: demoResult.projectPath,
      outputDirectory,
      artifactPaths: demoResult.artifactPaths,
    });

    emit("completed", "Generation job completed", result.projectPath);

    return result;
  } catch (error) {
    const failure = createFailure(jobId, activeStage, formatUnknownError(error));
    emit("failed", failure.message);
    throw new LocalGenerationJobError(failure, { cause: error });
  }
}
