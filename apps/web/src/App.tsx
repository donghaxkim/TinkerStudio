import { useEffect, useState } from "react";
import type { ApiGenerationJob } from "@tinker/generation-contract";
import { createHttpCompositionGenerationClient } from "./lib/httpCompositionGenerationClient.js";
import { createHttpCompositionPlanningClient } from "./lib/httpCompositionPlanningClient.js";
import { CompositionDemoScreen } from "./screens/CompositionEditor/CompositionDemoScreen.js";

const compositionClient = createHttpCompositionGenerationClient();
const compositionPlanningClient = createHttpCompositionPlanningClient();

function failedJobMessage(job: ApiGenerationJob): string {
  return job.error?.message ?? "Generation failed.";
}

export function App() {
  const [initialCompletedJob, setInitialCompletedJob] = useState<ApiGenerationJob | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const jobId = new URLSearchParams(window.location.search).get("jobId")?.trim();

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;
    const controller = new AbortController();
    setLoadError(undefined);
    setInitialCompletedJob(undefined);

    void (async () => {
      try {
        const currentJob = await compositionClient.getJob(jobId);
        if (cancelled) return;

        if (currentJob.status === "completed") {
          setInitialCompletedJob(currentJob);
          return;
        }
        if (currentJob.status === "failed") {
          setLoadError(failedJobMessage(currentJob));
          return;
        }

        const terminalJob = await compositionClient.waitForJob(jobId, { signal: controller.signal });
        if (cancelled) return;
        if (terminalJob.status === "completed") {
          setInitialCompletedJob(terminalJob);
        } else {
          setLoadError(failedJobMessage(terminalJob));
        }
      } catch (error: unknown) {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        setLoadError(error instanceof Error ? error.message : String(error));
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [jobId]);

  if (loadError !== undefined) {
    return (
      <div className="tk-porcelain" role="alert" style={{ minHeight: "100vh", padding: 24 }}>
        Could not open job {jobId}: {loadError}
      </div>
    );
  }

  if (jobId && initialCompletedJob === undefined) {
    return (
      <div className="tk-porcelain" aria-live="polite" style={{ minHeight: "100vh", padding: 24 }}>
        Opening job {jobId}...
      </div>
    );
  }

  return (
    <CompositionDemoScreen
      client={compositionClient}
      planningClient={compositionPlanningClient}
      initialCompletedJob={initialCompletedJob}
    />
  );
}
