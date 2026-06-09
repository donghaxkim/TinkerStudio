import { useState } from "react";
import type { DemoProject } from "@tinker/project-schema";
import { DemoProjectSchema } from "@tinker/project-schema";
import {
  CreateDemoRequestSchema,
  type CreateDemoRequest,
  type GenerationJob,
  type GenerationProgressEvent,
} from "@tinker/generation-contract";
import type { GenerationClient } from "../../lib/generationClient.js";
import { formatValidationIssues } from "../../fixtures/loadSampleProject.js";

export type CreateDemoJobState = {
  status: "idle" | "submitting" | "succeeded" | "failed";
  job?: GenerationJob;
  progressEvents: GenerationProgressEvent[];
  error?: string;
};

type UseCreateDemoJobOptions = {
  generationClient: GenerationClient;
  onProjectGenerated: (project: DemoProject) => void;
};

export function useCreateDemoJob({ generationClient, onProjectGenerated }: UseCreateDemoJobOptions) {
  const [state, setState] = useState<CreateDemoJobState>({ status: "idle", progressEvents: [] });

  async function submit(input: unknown) {
    const request = CreateDemoRequestSchema.safeParse(input);
    if (!request.success) {
      const issues = formatValidationIssues(request.error);
      setState({
        status: "failed",
        progressEvents: [],
        error: `Fix the highlighted fields: ${issues.join("; ")}`,
      });
      return;
    }

    setState({ status: "submitting", progressEvents: [] });

    try {
      const job = await generationClient.createDemo(request.data satisfies CreateDemoRequest);
      setState({ status: job.status === "succeeded" ? "succeeded" : "failed", job, progressEvents: job.progressEvents, error: job.error?.message });

      if (job.status !== "succeeded" || !job.result) {
        return;
      }

      const project = DemoProjectSchema.safeParse(job.result.project);
      if (!project.success) {
        const issues = formatValidationIssues(project.error);
        setState({
          status: "failed",
          job,
          progressEvents: job.progressEvents,
          error: `Generated project failed validation: ${issues.join("; ")}`,
        });
        return;
      }

      onProjectGenerated(project.data);
    } catch (error) {
      setState({
        status: "failed",
        progressEvents: [],
        error: error instanceof Error ? error.message : "Generation request failed",
      });
    }
  }

  return { state, submit };
}
