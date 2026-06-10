import type { DemoProject } from "@tinker/project-schema";
import {
  type CreateDemoRequest,
  type GenerationJob,
  type GenerationPhase,
  type GenerationProgressEvent,
} from "@tinker/generation-contract";
import sampleProject from "../../../../packages/project-schema/fixtures/demo-project.sample.json";
import type { GenerationClient } from "./generationClient.js";

type MockMode = "succeeded" | "failed" | "invalid-result";

type MockGenerationClientOptions = {
  mode?: MockMode;
};

const phases: GenerationPhase[] = [
  "queued",
  "analyzing_product",
  "creating_storyboard",
  "planning_capture",
  "capturing",
  "compiling_project",
  "validating_project",
  "complete",
];

function now() {
  return new Date().toISOString();
}

function buildProgressEvents(jobId: string): GenerationProgressEvent[] {
  return phases.map((phase, index) => ({
    id: `progress_${index + 1}`,
    jobId,
    phase,
    message: phase === "complete" ? "Demo project ready" : `Mock ${phase.replaceAll("_", " ")}`,
    progress: index / (phases.length - 1),
    createdAt: now(),
  }));
}

export function createMockGenerationClient(options: MockGenerationClientOptions = {}): GenerationClient {
  const mode = options.mode ?? "succeeded";
  const jobs = new Map<string, GenerationJob>();

  return {
    async createDemo(request: CreateDemoRequest) {
      const jobId = `job_${Date.now()}`;
      const progressEvents = buildProgressEvents(jobId);
      const base = {
        id: jobId,
        request,
        createdAt: now(),
        updatedAt: now(),
        progressEvents,
      };

      const job: GenerationJob =
        mode === "failed"
          ? {
              ...base,
              status: "failed",
              error: {
                code: "capture_failed",
                message: "Capture failed in mock generator",
                retryable: true,
              },
            }
          : {
              ...base,
              status: "succeeded",
              result: {
                project:
                  mode === "invalid-result"
                    ? ({ ...sampleProject, duration: -1 } as unknown as DemoProject)
                    : (sampleProject as DemoProject),
                warnings: mode === "succeeded" ? ["Mock generation used the sample project fixture."] : [],
              },
            };

      jobs.set(jobId, job);
      return job;
    },

    async getJob(jobId: string) {
      const job = jobs.get(jobId);
      if (!job) throw new Error(`Unknown mock generation job '${jobId}'`);
      return job;
    },

    subscribeToProgress(jobId: string, onProgress: (event: GenerationProgressEvent) => void) {
      const job = jobs.get(jobId);
      job?.progressEvents.forEach(onProgress);
      return () => undefined;
    },
  };
}
