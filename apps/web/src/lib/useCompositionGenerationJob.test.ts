import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { selectArtifactUrl, type CompositionGenerationClient } from "./compositionGenerationClient.js";
import { useCompositionGenerationJob } from "./useCompositionGenerationJob.js";

const REQUEST = {
  mode: "ai-url-planning" as const,
  repoUrl: "https://github.com/acme/driftboard",
  productUrl: "https://driftboard.example.com",
  durationCapSeconds: 60,
  aspectRatio: "16:9" as const,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

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
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        progressEvents: [],
        result: {
          method: "playwright",
          project: {
            schemaVersion: "0.1.0",
            id: "j",
            title: "Driftboard demo",
            duration: 10,
            fps: 60,
            aspectRatio: "16:9",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            assets: [],
            tracks: [],
            zooms: [],
            cursorEvents: [],
            aiEditHistory: [],
            metadata: { notes: [] },
          },
          artifacts: [
            {
              kind: "playwright-video",
              relativePath: "playwright/final.mp4",
              url: "/api/jobs/j/artifacts/playwright/final.mp4",
              mediaType: "video/mp4",
            },
          ],
          warnings: [],
        },
      }),
    } as unknown as CompositionGenerationClient;
    const { result } = renderHook(() => useCompositionGenerationJob(client));
    expect(result.current.phase).toBe("idle");

    await act(async () => {
      await result.current.start(REQUEST);
    });

    expect(result.current.phase).toBe("completed");
    expect(selectArtifactUrl(result.current.job!, "playwright-video")).toContain("final.mp4");
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
    const cancelJob = vi.fn(async () => undefined);
    const client = {
      createJob: async () => ({ id: "j" }),
      getJob: async () => ({ id: "j" }),
      cancelJob,
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
    expect(cancelJob).toHaveBeenCalledWith("j");
  });

  it("cancels the backend job if cancel is clicked before create resolves", async () => {
    const created = Promise.resolve({ id: "j" });
    const cancelJob = vi.fn(async () => undefined);
    const client = {
      createJob: async () => created,
      getJob: async () => ({ id: "j" }),
      cancelJob,
      waitForJob: async () => {
        throw new Error("waitForJob should not run after pre-create cancellation");
      },
    } as unknown as CompositionGenerationClient;

    const { result } = renderHook(() => useCompositionGenerationJob(client));
    let started!: Promise<void>;
    act(() => {
      started = result.current.start(REQUEST);
      result.current.cancel();
    });
    await act(async () => {
      await started;
    });

    expect(result.current.phase).toBe("idle");
    expect(cancelJob).toHaveBeenCalledWith("j");
  });

  it("cancels the current backend job when overlapping starts resolve out of order", async () => {
    const createA = deferred<{ id: string }>();
    const createB = deferred<{ id: string }>();
    const cancelJob = vi.fn(async () => undefined);
    const createJob = vi.fn(async () => (createJob.mock.calls.length === 1 ? createA.promise : createB.promise));
    const client = {
      createJob,
      getJob: async () => ({ id: "unused" }),
      cancelJob,
      waitForJob: (_id: string, opts?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    } as unknown as CompositionGenerationClient;

    const { result } = renderHook(() => useCompositionGenerationJob(client));
    let startA!: Promise<void>;
    let startB!: Promise<void>;
    act(() => {
      startA = result.current.start(REQUEST);
    });
    act(() => {
      startB = result.current.start({ ...REQUEST, productUrl: "https://new.example.com" });
    });

    await act(async () => {
      createB.resolve({ id: "b" });
      await Promise.resolve();
    });
    await waitFor(() => expect(createJob).toHaveBeenCalledTimes(2));
    await act(async () => {
      createA.resolve({ id: "a" });
      await startA;
    });
    act(() => {
      result.current.cancel();
    });
    await act(async () => {
      await startB;
    });

    expect(cancelJob).toHaveBeenCalledWith("b");
  });

  it("cancels the active backend job before replacing it with a new start", async () => {
    const waitA = deferred<never>();
    const cancelJob = vi.fn(async () => undefined);
    const createJob = vi.fn(async () => ({ id: createJob.mock.calls.length === 1 ? "a" : "b" }));
    const client = {
      createJob,
      getJob: async () => ({ id: "unused" }),
      cancelJob,
      waitForJob: (id: string, opts?: { signal?: AbortSignal }) => {
        if (id === "a") return waitA.promise;
        opts?.signal?.addEventListener("abort", () => undefined);
        return Promise.resolve({ id: "b", status: "completed" });
      },
    } as unknown as CompositionGenerationClient;

    const { result } = renderHook(() => useCompositionGenerationJob(client));
    let startA!: Promise<void>;
    act(() => {
      startA = result.current.start(REQUEST);
    });
    await waitFor(() => expect(createJob).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.phase).toBe("running"));

    await act(async () => {
      await result.current.start({ ...REQUEST, productUrl: "https://new.example.com" });
    });

    expect(cancelJob).toHaveBeenCalledWith("a");
    waitA.reject(new DOMException("aborted", "AbortError"));
    await act(async () => {
      await startA;
    });
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
