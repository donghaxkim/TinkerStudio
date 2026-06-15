import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { selectArtifactUrl, type CompositionGenerationClient } from "./compositionGenerationClient.js";
import { useCompositionGenerationJob } from "./useCompositionGenerationJob.js";

const REQUEST = {
  mode: "ai-url-planning" as const,
  repoUrl: "https://github.com/acme/driftboard",
  productUrl: "https://driftboard.example.com",
  durationCapSeconds: 60,
  aspectRatio: "16:9" as const,
};

describe("useCompositionGenerationJob", () => {
  it("starts idle, runs, then completes with the job artifacts", async () => {
    const client = {
      createJob: async () => ({ id: "j" }),
      getJob: async () => ({ id: "j" }),
      waitForJob: async () => ({
        id: "j",
        status: "completed",
        request: {
          id: "j",
          mode: "ai-url-planning",
          repoUrl: REQUEST.repoUrl,
          productUrl: "https://driftboard.example.com",
          durationCapSeconds: REQUEST.durationCapSeconds,
          aspectRatio: REQUEST.aspectRatio,
          renderer: "hyperframes",
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        progressEvents: [],
        result: {
          artifacts: [
            {
              kind: "composition-index",
              relativePath: "hyperframes/index.html",
              url: "/api/jobs/j/artifacts/hyperframes/index.html",
              mediaType: "text/html",
            },
          ],
        },
      }),
    } as unknown as CompositionGenerationClient;
    const { result } = renderHook(() => useCompositionGenerationJob(client));
    expect(result.current.phase).toBe("idle");

    await act(async () => {
      await result.current.start(REQUEST);
    });

    expect(result.current.phase).toBe("completed");
    expect(selectArtifactUrl(result.current.job!, "composition-index")).toContain("index.html");
  });

  it("reports a failure phase + message when the client rejects", async () => {
    const failing = {
      createJob: async () => {
        throw new Error("queue full");
      },
      getJob: async () => {
        throw new Error("unused");
      },
      waitForJob: async () => {
        throw new Error("unused");
      },
    };
    const { result } = renderHook(() => useCompositionGenerationJob(failing));
    await act(async () => {
      await result.current.start(REQUEST);
    });
    expect(result.current.phase).toBe("failed");
    expect(result.current.error).toBe("queue full");
  });

  it("returns to idle and does not complete when cancelled mid-flight", async () => {
    const client = {
      createJob: async () => ({ id: "j" }),
      getJob: async () => ({ id: "j" }),
      waitForJob: (_id: string, opts?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    } as unknown as CompositionGenerationClient;

    const { result } = renderHook(() => useCompositionGenerationJob(client));
    let started!: Promise<void>;
    act(() => {
      started = result.current.start(REQUEST);
    });
    await waitFor(() => expect(result.current.phase).toBe("running"));
    act(() => {
      result.current.cancel();
    });
    await act(async () => {
      await started;
    });
    expect(result.current.phase).toBe("idle");
  });

  it("reports failed when the job resolves to a failed terminal status", async () => {
    const client = {
      createJob: async () => ({ id: "j" }),
      getJob: async () => ({ id: "j" }),
      waitForJob: async () => ({ id: "j", status: "failed", error: { message: "render failed" } }),
    } as unknown as CompositionGenerationClient;

    const { result } = renderHook(() => useCompositionGenerationJob(client));
    await act(async () => {
      await result.current.start(REQUEST);
    });
    expect(result.current.phase).toBe("failed");
    expect(result.current.error).toBe("render failed");
  });
});
