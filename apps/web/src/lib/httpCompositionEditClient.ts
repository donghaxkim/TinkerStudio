import { safeParseApiGenerationJob, type ApiGenerationJob } from "@tinker/generation-contract";
import type { CompositionEditClient, CompositionEditRequest, CompositionRevision, EditComposeOptions, RenderRevisionRequest } from "./compositionEditClient.js";

export type HttpCompositionEditClientOptions = { baseUrl?: string; fetchFn?: typeof fetch; intervalMs?: number };

const DEFAULT_POLL_INTERVAL_MS = 1500;

export function createHttpCompositionEditClient(options: HttpCompositionEditClientOptions = {}): CompositionEditClient {
  const baseUrl = options.baseUrl ?? "";
  const fetchFn = options.fetchFn ?? fetch;
  const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  async function readJob(response: Response): Promise<ApiGenerationJob> {
    if (!response.ok) throw new Error(await readErrorMessage(response));
    let raw: unknown;
    try { raw = await response.json(); } catch { throw new Error(`Server returned a non-JSON response (status ${response.status})`); }
    const parsed = safeParseApiGenerationJob(raw);
    if (!parsed.success) throw new Error(`Malformed job response: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
    return parsed.data;
  }

  return {
    async editComposition(request: CompositionEditRequest, opts?: EditComposeOptions): Promise<CompositionRevision> {
      opts?.signal?.throwIfAborted();
      const posted = await readJob(await fetchFn(`${baseUrl}/api/jobs/${request.jobId}/edits`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: request.instruction, context: request.context }),
        signal: opts?.signal,
      }));
      opts?.onUpdate?.("running");
      const prevCount = posted.revisions?.length ?? 0;

      for (;;) {
        opts?.signal?.throwIfAborted();
        const job = await readJob(await fetchFn(`${baseUrl}/api/jobs/${request.jobId}`, { signal: opts?.signal }));
        const revisions = job.revisions ?? [];
        if (revisions.length > prevCount) {
          const rev = revisions[revisions.length - 1]!;
          if (rev.status === "failed") throw new Error(rev.error?.message ?? "Edit failed");
          const arts = rev.result?.artifacts ?? [];
          const compositionIndexUrl = arts.find((a) => a.kind === "composition-index")?.url;
          if (compositionIndexUrl === undefined) throw new Error("Edit completed but produced no composition");
          const outputVideoUrl = arts.find((a) => a.kind === "output-video")?.url;
          return { id: rev.id, compositionIndexUrl, ...(outputVideoUrl === undefined ? {} : { outputVideoUrl }) };
        }
        await delay(intervalMs, opts?.signal);
      }
    },

    async renderRevision(request: RenderRevisionRequest, opts?: EditComposeOptions): Promise<string> {
      opts?.signal?.throwIfAborted();
      await readJob(await fetchFn(`${baseUrl}/api/jobs/${request.jobId}/revisions/${request.revId}/render`, {
        method: "POST", signal: opts?.signal,
      }));
      opts?.onUpdate?.("running");

      for (;;) {
        opts?.signal?.throwIfAborted();
        const job = await readJob(await fetchFn(`${baseUrl}/api/jobs/${request.jobId}`, { signal: opts?.signal }));
        const rev = (job.revisions ?? []).find((r) => r.id === request.revId);
        if (rev !== undefined) {
          if (rev.renderError !== undefined) throw new Error(rev.renderError.message ?? "Render failed");
          const videoUrl = rev.result?.artifacts.find((a) => a.kind === "output-video")?.url;
          if (videoUrl !== undefined) return videoUrl;
        }
        await delay(intervalMs, opts?.signal);
      }
    },
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  try { const j = (await response.json()) as { message?: unknown }; if (typeof j?.message === "string" && j.message.length > 0) return j.message; } catch { /* not json */ }
  return `Request failed with status ${response.status}`;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason ?? new DOMException("The operation was aborted", "AbortError")); return; }
    const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
    function onAbort() { clearTimeout(timer); reject(signal?.reason ?? new DOMException("The operation was aborted", "AbortError")); }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
