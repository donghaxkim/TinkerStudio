import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatContextRef } from "../../lib/chatContext.js";
import type { CompositionEditClient, CompositionRevision } from "../../lib/compositionEditClient.js";

export type EditFlowStatus = "idle" | "drafting" | "preview" | "error";

export type CompositionEditFlow = {
  status: EditFlowStatus;
  currentCompositionUrl: string;
  currentVideoUrl?: string;
  isPreviewing: boolean;
  canUndo: boolean;
  error?: string;
  submit: (instruction: string, context: ChatContextRef[]) => Promise<void>;
  accept: () => void;
  reject: () => void;
  undo: () => void;
  cancel: () => void;
};

export function useCompositionEditFlow(opts: {
  jobId: string;
  client: CompositionEditClient;
  baseRevision: CompositionRevision;
}): CompositionEditFlow {
  const { jobId, client, baseRevision } = opts;
  const [stack, setStack] = useState<CompositionRevision[]>([baseRevision]);
  const [pending, setPending] = useState<CompositionRevision | undefined>(undefined);
  const [status, setStatus] = useState<EditFlowStatus>("idle");
  const [error, setError] = useState<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const current = pending ?? stack[stack.length - 1]!;

  const submit = useCallback(
    async (instruction: string, context: ChatContextRef[]) => {
      if (instruction.trim() === "") return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus("drafting");
      setError(undefined);
      try {
        const revision = await client.editComposition(
          { jobId, instruction, context },
          { signal: controller.signal, onUpdate: () => undefined },
        );
        if (controller.signal.aborted) return;
        setPending(revision);
        setStatus("preview");
      } catch (err) {
        if (controller.signal.aborted) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [client, jobId],
  );

  const accept = useCallback(() => {
    setPending((p) => {
      if (p) setStack((s) => [...s, p]);
      return undefined;
    });
    setStatus("idle");
  }, []);

  const reject = useCallback(() => {
    setPending(undefined);
    setStatus("idle");
  }, []);

  const undo = useCallback(() => {
    setPending(undefined);
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    setStatus("idle");
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setPending(undefined);
    setStatus("idle");
  }, []);

  return useMemo(
    () => ({
      status,
      currentCompositionUrl: current.compositionIndexUrl,
      ...(current.outputVideoUrl === undefined ? {} : { currentVideoUrl: current.outputVideoUrl }),
      isPreviewing: pending !== undefined,
      canUndo: stack.length > 1,
      ...(error === undefined ? {} : { error }),
      submit,
      accept,
      reject,
      undo,
      cancel,
    }),
    [status, current, pending, stack.length, error, submit, accept, reject, undo, cancel],
  );
}
