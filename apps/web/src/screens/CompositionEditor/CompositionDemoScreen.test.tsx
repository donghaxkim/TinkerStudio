import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ApiGenerationJob } from "@tinker/generation-contract";
import type { TimelineRegistryWindow, CompositionTimelineHandle } from "@tinker/editor";
import type { CompositionGenerationClient } from "../../lib/compositionGenerationClient.js";
import { createMockCompositionGenerationClient } from "../../lib/mockCompositionGenerationClient.js";
import { CompositionDemoScreen } from "./CompositionDemoScreen.js";

function completedCompositionJob(): ApiGenerationJob {
  return {
    id: "mock-job-1",
    status: "completed",
    request: {
      id: "mock-job-1",
      mode: "ai-url-planning",
      repoUrl: "https://github.com/acme/driftboard",
      productUrl: "https://driftboard.example.com",
      durationCapSeconds: 60,
      aspectRatio: "16:9",
      renderer: "hyperframes",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    progressEvents: [],
    result: {
      method: "hyperframes",
      composition: {
        indexArtifact: {
          kind: "composition-index",
          relativePath: "hyperframes/index.html",
          url: "/api/jobs/mock-job-1/artifacts/hyperframes/index.html",
          mediaType: "text/html",
        },
        outputVideoArtifact: {
          kind: "output-video",
          relativePath: "hyperframes/output.mp4",
          url: "/api/jobs/mock-job-1/artifacts/hyperframes/output.mp4",
          mediaType: "video/mp4",
        },
      },
      artifacts: [
        {
          kind: "composition-index",
          relativePath: "hyperframes/index.html",
          url: "/api/jobs/mock-job-1/artifacts/hyperframes/index.html",
          mediaType: "text/html",
        },
        {
          kind: "output-video",
          relativePath: "hyperframes/output.mp4",
          url: "/api/jobs/mock-job-1/artifacts/hyperframes/output.mp4",
          mediaType: "video/mp4",
        },
      ],
      warnings: [],
    },
  };
}

function fakeHandle(): CompositionTimelineHandle {
  return {
    totalDuration: () => 10,
    labels: [] as unknown as Record<string, number>,
    getChildren: () => [{ startTime: () => 0, totalDuration: () => 10, vars: { id: "scene" } }],
    seek: () => undefined,
    play: () => undefined,
    pause: () => undefined,
  } as unknown as CompositionTimelineHandle;
}

describe("CompositionDemoScreen", () => {
  it("opens a preloaded completed HyperFrames job in the editor", async () => {
    const client = createMockCompositionGenerationClient();
    render(
      <CompositionDemoScreen
        client={client}
        initialCompletedJob={completedCompositionJob()}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: fakeHandle() } })}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("composition-frame")).toBeInTheDocument());
  });

  it("generates a composition and opens it in the editor", async () => {
    const client = createMockCompositionGenerationClient();
    render(
      <CompositionDemoScreen
        client={client}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: fakeHandle() } })}
      />,
    );

    fireEvent.change(screen.getByLabelText("Repo URL"), { target: { value: "https://github.com/acme/driftboard" } });
    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "https://driftboard.example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() => expect(screen.getByTestId("composition-frame")).toBeInTheDocument());
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("composition-timeline")).toBeInTheDocument());
  });

  it("shows an error when generation fails", async () => {
    const client = {
      createJob: async () => ({ id: "j" }),
      getJob: async () => ({ id: "j" }),
      waitForJob: async () => ({ id: "j", status: "failed", error: { message: "Server error" } }),
    } as unknown as CompositionGenerationClient;
    render(<CompositionDemoScreen client={client} />);
    fireEvent.change(screen.getByLabelText("Repo URL"), { target: { value: "https://github.com/x/y" } });
    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "https://x.example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Server error"));
  });

  it("returns to the form when generation is cancelled", async () => {
    const client = {
      createJob: async () => ({ id: "j" }),
      getJob: async () => ({ id: "j" }),
      waitForJob: (_id: string, opts?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    } as unknown as CompositionGenerationClient;
    render(<CompositionDemoScreen client={client} />);
    fireEvent.change(screen.getByLabelText("Repo URL"), { target: { value: "https://github.com/x/y" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await screen.findByTestId("composition-generating");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate" })).toBeInTheDocument());
  });
});
