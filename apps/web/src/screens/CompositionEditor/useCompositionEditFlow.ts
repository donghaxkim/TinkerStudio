import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatContextRef } from "../../lib/chatContext.js";
import type { CompositionEditClient, CompositionRevision } from "../../lib/compositionEditClient.js";

export type EditFlowStatus = "idle" | "drafting" | "preview" | "error";

/** Render-on-demand state for the current revision's MP4 export. */
export type ExportStatus = "idle" | "rendering" | "error";

export type CompositionEditFlow = {
  status: EditFlowStatus;
  currentCompositionUrl: string;
  currentVideoUrl?: string;
  isPreviewing: boolean;
  canUndo: boolean;
  error?: string;
  exportStatus: ExportStatus;
  exportError?: string;
  /**
   * Ensure the current revision has a rendered MP4 and resolve with its URL. Returns the
   * existing video URL immediately if already rendered (base or a previously-exported edit);
   * otherwise triggers a render-on-demand and patches the revision once it completes. Resolves
   * `undefined` on failure (see `exportError`).
   */
  requestExport: () => Promise<string | undefined>;
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
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [exportError, setExportError] = useState<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => { abortRef.current?.abort(); exportAbortRef.current?.abort(); }, []);

  const current = pending ?? stack[stack.length - 1]!;

  const submit = useCallback(
    async (instruction: string, context: ChatContextRef[]) => {
      if (instruction.trim() === "") return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus("drafting");
      setError(undefined);
      // A new edit invalidates any prior export state for the previous revision.
      exportAbortRef.current?.abort();
      setExportStatus("idle");
      setExportError(undefined);
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

  const requestExport = useCallback(async (): Promise<string | undefined> => {
    const target = pending ?? stack[stack.length - 1]!;
    // Already rendered (base composition or a previously-exported edit) — nothing to do.
    if (target.outputVideoUrl !== undefined) {
      setExportStatus("idle");
      setExportError(undefined);
      return target.outputVideoUrl;
    }
    // The base revision is the generation output and should always carry a video; if it somehow
    // doesn't, there is nothing to render on demand (only server-side edit revisions can render).
    if (target.id === baseRevision.id) {
      setExportStatus("error");
      setExportError("No rendered video to export.");
      return undefined;
    }
    exportAbortRef.current?.abort();
    const controller = new AbortController();
    exportAbortRef.current = controller;
    setExportStatus("rendering");
    setExportError(undefined);
    try {
      const videoUrl = await client.renderRevision({ jobId, revId: target.id }, { signal: controller.signal, onUpdate: () => undefined });
      if (controller.signal.aborted) return undefined;
      // Cache the rendered URL on the revision so a re-export is instant and the UI can offer a
      // direct download. `target` lives in exactly one of pending/stack; patch both safely.
      setPending((p) => (p !== undefined && p.id === target.id ? { ...p, outputVideoUrl: videoUrl } : p));
      setStack((s) => s.map((r) => (r.id === target.id ? { ...r, outputVideoUrl: videoUrl } : r)));
      setExportStatus("idle");
      return videoUrl;
    } catch (err) {
      if (controller.signal.aborted) return undefined;
      setExportStatus("error");
      setExportError(err instanceof Error ? err.message : String(err));
      return undefined;
    }
  }, [pending, stack, baseRevision.id, client, jobId]);

  return useMemo(
    () => ({
      status,
      currentCompositionUrl: current.compositionIndexUrl,
      ...(current.outputVideoUrl === undefined ? {} : { currentVideoUrl: current.outputVideoUrl }),
      isPreviewing: pending !== undefined,
      canUndo: stack.length > 1,
      ...(error === undefined ? {} : { error }),
      exportStatus,
      ...(exportError === undefined ? {} : { exportError }),
      requestExport,
      submit,
      accept,
      reject,
      undo,
      cancel,
    }),
    [status, current, pending, stack.length, error, exportStatus, exportError, requestExport, submit, accept, reject, undo, cancel],
  );
}
