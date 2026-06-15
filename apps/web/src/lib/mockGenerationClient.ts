import type { DemoProject } from "@tinker/project-schema";
import { DemoProjectSchema } from "@tinker/project-schema";
import {
  type CreateDemoRequest,
  type GenerationJob,
  type GenerationPhase,
  type GenerationProgressEvent,
} from "@tinker/generation-contract";
// Golden generated-project fixture (PB-010): the canonical example of Person A's
// expected generation output (driftboard demo). A successful mock job returns THIS as
// `result.project`, so Create Demo success opens the driftboard timeline (4 scenes).
// Parse once at load so the mock always emits a genuine, schema-valid DemoProject.
import goldenProjectInput from "../../../../packages/project-schema/fixtures/person-a-generated-project.sample.json";
import type { GenerationClient } from "./generationClient.js";

const goldenProject: DemoProject = DemoProjectSchema.parse(goldenProjectInput);

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
    kind: "mock",

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
                    ? ({ ...goldenProject, duration: -1 } as unknown as DemoProject)
                    : goldenProject,
                warnings: mode === "succeeded" ? ["Mock generation used the golden driftboard fixture."] : [],
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
