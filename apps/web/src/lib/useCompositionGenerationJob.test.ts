import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { selectArtifactUrl } from "./compositionGenerationClient.js";
import { createMockCompositionGenerationClient } from "./mockCompositionGenerationClient.js";
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
    const client = createMockCompositionGenerationClient();
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
});
