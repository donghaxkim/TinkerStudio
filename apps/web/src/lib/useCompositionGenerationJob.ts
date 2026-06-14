import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiGenerationJob } from "@tinker/generation-contract";
import type { CompositionGenerationClient, CreateCompositionJobRequest } from "./compositionGenerationClient.js";

export type CompositionJobPhase = "idle" | "running" | "completed" | "failed";

export type CompositionJobState = {
  phase: CompositionJobPhase;
  job?: ApiGenerationJob;
  error?: string;
};

export type UseCompositionGenerationJob = CompositionJobState & {
  start: (request: CreateCompositionJobRequest) => Promise<void>;
  cancel: () => void;
};

export function useCompositionGenerationJob(client: CompositionGenerationClient): UseCompositionGenerationJob {
  const [state, setState] = useState<CompositionJobState>({ phase: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(
    async (request: CreateCompositionJobRequest) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ phase: "running" });
      try {
        const created = await client.createJob(request);
        if (controller.signal.aborted) return;
        const job = await client.waitForJob(created.id, {
          signal: controller.signal,
          onUpdate: (updated) => {
            if (!controller.signal.aborted) setState({ phase: "running", job: updated });
          },
        });
        if (controller.signal.aborted) return;
        if (job.status === "completed") {
          setState({ phase: "completed", job });
        } else {
          setState({ phase: "failed", job, error: job.error?.message ?? "Generation failed." });
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setState({ phase: "failed", error: err instanceof Error ? err.message : String(err) });
      }
    },
    [client],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState({ phase: "idle" });
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { ...state, start, cancel };
}
