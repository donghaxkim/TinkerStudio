import { render, screen, waitFor } from "@testing-library/react";
import type { ApiGenerationJob } from "@tinker/generation-contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

const { generationClient } = vi.hoisted(() => ({
  generationClient: {
    createJob: vi.fn(),
    getJob: vi.fn(),
    waitForJob: vi.fn(),
  },
}));

vi.mock("./lib/httpCompositionGenerationClient.js", () => ({
  createHttpCompositionGenerationClient: () => generationClient,
}));

vi.mock("./lib/httpCompositionEditClient.js", () => ({
  createHttpCompositionEditClient: () => ({}),
}));

vi.mock("./lib/httpCompositionPlanningClient.js", () => ({
  createHttpCompositionPlanningClient: () => ({
    createSession: vi.fn(),
    sendMessage: vi.fn(),
  }),
}));

function completedHyperframesJob(): ApiGenerationJob {
  const indexArtifact = {
    kind: "composition-index" as const,
    relativePath: "hyperframes/index.html",
    url: "/api/jobs/job-mqhatqcm-352035ac/artifacts/hyperframes/index.html",
    mediaType: "text/html",
  };
  const outputVideoArtifact = {
    kind: "output-video" as const,
    relativePath: "hyperframes/output.mp4",
    url: "/api/jobs/job-mqhatqcm-352035ac/artifacts/hyperframes/output.mp4",
    mediaType: "video/mp4",
  };

  return {
    id: "job-mqhatqcm-352035ac",
    status: "completed",
    request: {
      id: "job-mqhatqcm-352035ac",
      mode: "ai-url-planning",
      repoUrl: "https://github.com/getpaykit/paykit",
      productUrl: "https://paykit.sh/",
      durationCapSeconds: 60,
      aspectRatio: "16:9",
      renderer: "hyperframes",
      hyperframesAgent: "opencode",
    },
    createdAt: "2026-06-17T00:00:00.000Z",
    updatedAt: "2026-06-17T00:00:00.000Z",
    progressEvents: [],
    result: {
      method: "hyperframes",
      composition: { indexArtifact, outputVideoArtifact },
      artifacts: [indexArtifact, outputVideoArtifact],
      warnings: [],
    },
  };
}

function queuedJob(): ApiGenerationJob {
  const job = completedHyperframesJob();
  return {
    ...job,
    status: "queued",
    result: undefined,
  };
}

function failedJob(message = "Renderer crashed"): ApiGenerationJob {
  const job = completedHyperframesJob();
  return {
    ...job,
    status: "failed",
    result: undefined,
    error: { code: "internal_error", message, retryable: false },
  };
}

beforeEach(() => {
  generationClient.createJob.mockReset();
  generationClient.getJob.mockReset();
  generationClient.waitForJob.mockReset();
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("App composition product flow", () => {
  it("opens directly into the planning-first Create Demo workspace", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /Tinker Studio/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("product.example.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("github.com/owner/repo")).toBeInTheDocument();
    expect(screen.getByLabelText("Product URL")).toBeInTheDocument();
    expect(screen.getByLabelText("GitHub repo URL")).toBeInTheDocument();
    expect(screen.queryByLabelText("Demo description")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open empty editor shell" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Composition demo (beta)" })).not.toBeInTheDocument();
  });

  it("does not expose the legacy sample-project entry", () => {
    render(<App />);

    expect(screen.queryByText("or start from a sample project")).not.toBeInTheDocument();
  });

  it("opens a completed job from the jobId query parameter", async () => {
    const job = completedHyperframesJob();
    generationClient.getJob.mockResolvedValue(job);
    window.history.replaceState(null, "", "/?jobId=job-mqhatqcm-352035ac");

    render(<App />);

    await waitFor(() => expect(generationClient.getJob).toHaveBeenCalledWith("job-mqhatqcm-352035ac"));
    await waitFor(() => expect(screen.getByTestId("composition-frame")).toBeInTheDocument());
    expect(screen.getByTestId("composition-frame")).toHaveAttribute("src", "/api/jobs/job-mqhatqcm-352035ac/artifacts/hyperframes/index.html");
  });

  it("waits for a non-terminal jobId query parameter before opening it", async () => {
    const completed = completedHyperframesJob();
    generationClient.getJob.mockResolvedValue(queuedJob());
    generationClient.waitForJob.mockResolvedValue(completed);
    window.history.replaceState(null, "", "/?jobId=job-mqhatqcm-352035ac");

    render(<App />);

    await waitFor(() => expect(generationClient.getJob).toHaveBeenCalledWith("job-mqhatqcm-352035ac"));
    await waitFor(() =>
      expect(generationClient.waitForJob).toHaveBeenCalledWith(
        "job-mqhatqcm-352035ac",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
    await waitFor(() => expect(screen.getByTestId("composition-frame")).toBeInTheDocument());
    expect(screen.queryByText("Generation completed but produced no supported result to open.")).not.toBeInTheDocument();
  });

  it("shows a direct error for a failed jobId query parameter", async () => {
    generationClient.getJob.mockResolvedValue(failedJob("Capture timed out"));
    window.history.replaceState(null, "", "/?jobId=job-mqhatqcm-352035ac");

    render(<App />);

    await waitFor(() => expect(generationClient.getJob).toHaveBeenCalledWith("job-mqhatqcm-352035ac"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not open job job-mqhatqcm-352035ac: Capture timed out"));
    expect(generationClient.waitForJob).not.toHaveBeenCalled();
  });
});
