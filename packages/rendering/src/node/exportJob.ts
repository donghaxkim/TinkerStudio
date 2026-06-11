import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { DemoProject } from "@tinker/project-schema";
import { freezeExportProjectSnapshot } from "./exportSnapshot.js";
import {
  renderFinalToMp4,
  runSpawnedFfmpegCommand,
  type CommandRunner,
  type RenderFinalToMp4Options,
  type RenderFinalToMp4Result,
} from "./renderFinalToMp4.js";
import { runSpawnedFfprobeCommand, type ProbeCommandRunner } from "./probeMp4Artifact.js";

export type ExportJobPhase = "idle" | "validating" | "rendering" | "probing" | "succeeded" | "failed";
export type ExportJobFailurePhase = "validating" | "rendering" | "probing";

export type ExportJobCommandContext = {
  command: string;
  args: string[];
};

export type ExportJobFailure = {
  phase: ExportJobFailurePhase;
  message: string;
  command?: ExportJobCommandContext;
  causeName?: string;
};

export type ExportJobState = {
  id: string;
  phase: ExportJobPhase;
  progress: number;
  outputPath?: string;
  startedAt?: string;
  endedAt?: string;
  result?: RenderFinalToMp4Result;
  error?: ExportJobFailure;
};

export type ExportJobOptions = RenderFinalToMp4Options & {
  id?: string;
  onStateChange?: (state: ExportJobState) => void;
};

export type ExportJobCoordinatorOptions = {
  now?: () => string;
};

export class ExportJobCoordinator {
  private readonly activeOutputPaths = new Set<string>();
  private readonly now: () => string;
  private readonly states = new Map<string, ExportJobState>();

  constructor(options: ExportJobCoordinatorOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  getState(jobId: string): ExportJobState | undefined {
    const state = this.states.get(jobId);
    return state ? cloneState(state) : undefined;
  }

  async start(project: DemoProject, options: ExportJobOptions): Promise<ExportJobState> {
    const id = options.id ?? `export_${randomUUID()}`;
    const outputPath = resolve(options.outputPath);
    const startedAt = this.now();
    const snapshot = freezeExportProjectSnapshot(project);
    let currentPhase: ExportJobFailurePhase = "validating";
    let currentCommand: ExportJobCommandContext | undefined;

    const emit = (state: ExportJobState) => {
      const cloned = cloneState(state);
      this.states.set(id, cloned);
      options.onStateChange?.(cloneState(cloned));
      return cloneState(cloned);
    };

    emit({ id, phase: "validating", progress: 0.1, outputPath, startedAt });

    if (this.activeOutputPaths.has(outputPath)) {
      return emit({
        id,
        phase: "failed",
        progress: 0.1,
        outputPath,
        startedAt,
        endedAt: this.now(),
        error: {
          phase: "validating",
          message: `Another export job is already writing '${outputPath}'`,
        },
      });
    }

    this.activeOutputPaths.add(outputPath);

    const runCommand: CommandRunner = async (command, args) => {
      currentPhase = "rendering";
      currentCommand = { command, args: [...args] };
      emit({ id, phase: "rendering", progress: 0.55, outputPath, startedAt });
      await (options.runCommand ?? runSpawnedFfmpegCommand)(command, args);
    };

    const runProbe: ProbeCommandRunner = async (command, args) => {
      currentPhase = "probing";
      currentCommand = { command, args: [...args] };
      emit({ id, phase: "probing", progress: 0.85, outputPath, startedAt });
      return (options.runProbe ?? runSpawnedFfprobeCommand)(command, args);
    };

    try {
      const result = await renderFinalToMp4(snapshot, {
        ...options,
        outputPath,
        runCommand,
        runProbe,
      });

      return emit({
        id,
        phase: "succeeded",
        progress: 1,
        outputPath,
        startedAt,
        endedAt: this.now(),
        result,
      });
    } catch (error) {
      return emit({
        id,
        phase: "failed",
        progress: failureProgress(currentPhase),
        outputPath,
        startedAt,
        endedAt: this.now(),
        error: normalizeFailure(error, currentPhase, currentCommand),
      });
    } finally {
      this.activeOutputPaths.delete(outputPath);
    }
  }
}

const defaultCoordinator = new ExportJobCoordinator();

export function runExportJob(project: DemoProject, options: ExportJobOptions): Promise<ExportJobState> {
  return defaultCoordinator.start(project, options);
}

function failureProgress(phase: ExportJobFailurePhase) {
  if (phase === "rendering") return 0.55;
  if (phase === "probing") return 0.85;
  return 0.1;
}

function normalizeFailure(error: unknown, phase: ExportJobFailurePhase, command?: ExportJobCommandContext): ExportJobFailure {
  return {
    phase,
    message: normalizeFailureMessage(error),
    command,
    causeName: error instanceof Error ? error.name : undefined,
  };
}

function normalizeFailureMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  try {
    return `Export failed: ${JSON.stringify(error)}`;
  } catch {
    return `Export failed: ${String(error)}`;
  }
}

function cloneState(state: ExportJobState): ExportJobState {
  return structuredClone(state);
}
