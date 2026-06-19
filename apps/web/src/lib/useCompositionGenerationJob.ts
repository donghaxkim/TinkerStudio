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
  const activeJobIdRef = useRef<string | undefined>(undefined);
  const cancelRequestedRef = useRef(false);

  const start = useCallback(
    async (request: CreateCompositionJobRequest) => {
      const previousJobId = activeJobIdRef.current;
      activeJobIdRef.current = undefined;
      if (previousJobId !== undefined) {
        void client.cancelJob?.(previousJobId).catch(() => undefined);
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      cancelRequestedRef.current = false;
      setState({ phase: "running" });
      const isCurrentController = () => abortRef.current === controller;
      const clearActiveJobId = (jobId: string) => {
        if (activeJobIdRef.current === jobId) {
          activeJobIdRef.current = undefined;
        }
      };
      try {
        const created = await client.createJob(request);
        if (isCurrentController()) {
          activeJobIdRef.current = created.id;
        }
        if (controller.signal.aborted || cancelRequestedRef.current || !isCurrentController()) {
          clearActiveJobId(created.id);
          void client.cancelJob?.(created.id).catch(() => undefined);
          return;
        }
        const job = await client.waitForJob(created.id, {
          signal: controller.signal,
          onUpdate: (updated) => {
            if (!controller.signal.aborted && isCurrentController()) setState({ phase: "running", job: updated });
          },
        });
        if (controller.signal.aborted || !isCurrentController()) return;
        if (job.status === "completed") {
          clearActiveJobId(job.id);
          setState({ phase: "completed", job });
        } else {
          clearActiveJobId(job.id);
          setState({ phase: "failed", job, error: job.error?.message ?? "Generation failed." });
        }
      } catch (err) {
        if (controller.signal.aborted || !isCurrentController()) return;
        activeJobIdRef.current = undefined;
        setState({ phase: "failed", error: err instanceof Error ? err.message : String(err) });
      }
    },
    [client],
  );

  const cancel = useCallback(() => {
    cancelRequestedRef.current = true;
    const activeJobId = activeJobIdRef.current;
    activeJobIdRef.current = undefined;
    if (activeJobId !== undefined) {
      void client.cancelJob?.(activeJobId).catch(() => undefined);
    }
    abortRef.current?.abort();
    setState({ phase: "idle" });
  }, [client]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { ...state, start, cancel };
}
