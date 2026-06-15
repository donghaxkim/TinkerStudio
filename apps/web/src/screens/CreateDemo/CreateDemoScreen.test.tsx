import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiGenerationJob } from "@tinker/generation-contract";
import { DemoProjectSchema } from "@tinker/project-schema";
import type { GenerationClient } from "../../lib/generationClient.js";
import { createMockGenerationClient } from "../../lib/mockGenerationClient.js";
import { CreateDemoScreen } from "./CreateDemoScreen.js";
import goldenProjectInput from "../../../../../packages/project-schema/fixtures/person-a-generated-project.sample.json" with { type: "json" };

const goldenProject = DemoProjectSchema.parse(goldenProjectInput);
const noopCompositionGenerated = () => undefined;

// Helper: enter a repo URL and advance timers past the 1100ms verification delay
async function enterAndVerifyRepo(repoValue = "github.com/example/product") {
  const input = screen.getByLabelText("GitHub repo URL");
  fireEvent.change(input, { target: { value: repoValue } });
  await act(async () => {
    vi.advanceTimersByTime(1200);
  });
}

// Helper: flush all pending microtasks/promises so async mock client resolves
async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function completedApiJob(): ApiGenerationJob {
  return {
    id: "job-test",
    status: "completed",
    request: {
      id: "job-test",
      mode: "ai-url-planning",
      repoUrl: "https://github.com/example/product",
      productUrl: "https://github.com/example/product",
      prompt: "Show the analytics workflow",
      durationCapSeconds: 60,
      aspectRatio: "16:9",
      renderer: "playwright",
    },
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:02.000Z",
    progressEvents: [
      {
        jobId: "job-test",
        status: "running",
        message: "AI URL analysis started",
        time: "2026-06-14T00:00:01.000Z",
      },
    ],
    result: {
      method: "playwright",
      project: goldenProject,
      artifacts: [
        {
          kind: "playwright-demo-project",
          relativePath: "playwright/demo-project.json",
          url: "/api/jobs/job-test/artifacts/playwright/demo-project.json",
          mediaType: "application/json; charset=utf-8",
        },
      ],
      warnings: [],
    },
  };
}

describe("CreateDemoScreen — Porcelain chat composer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── empty state ──────────────────────────────────────────────────────────

  it("renders the hero heading and subtitle when no messages", () => {
    render(
      <CreateDemoScreen
        generationClient={createMockGenerationClient()}
        onProjectGenerated={() => undefined}
        onCompositionGenerated={noopCompositionGenerated}
      />,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Tinker Studio");
    expect(screen.getByText("Paste your repo, get the demo video.")).toBeInTheDocument();
  });

  it("renders the repo input and prompt textarea", () => {
    render(
      <CreateDemoScreen
        generationClient={createMockGenerationClient()}
        onProjectGenerated={() => undefined}
        onCompositionGenerated={noopCompositionGenerated}
      />,
    );

    expect(screen.getByLabelText("GitHub repo URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Demo prompt")).toBeInTheDocument();
  });

  it("send button is initially disabled (no repo, no prompt)", () => {
    render(
      <CreateDemoScreen
        generationClient={createMockGenerationClient()}
        onProjectGenerated={() => undefined}
        onCompositionGenerated={noopCompositionGenerated}
      />,
    );

    const sendBtn = screen.getByTitle("Enter your repo first");
    expect(sendBtn).toBeDisabled();
  });

  it("send button stays disabled when prompt is filled but repo not verified", () => {
    render(
      <CreateDemoScreen
        generationClient={createMockGenerationClient()}
        onProjectGenerated={() => undefined}
        onCompositionGenerated={noopCompositionGenerated}
      />,
    );

    // Enter prompt but no repo
    fireEvent.change(screen.getByLabelText("Demo prompt"), {
      target: { value: "Show the analytics workflow" },
    });
    expect(screen.getByTitle("Enter your repo first")).toBeDisabled();
  });

  // ─── repo verification ────────────────────────────────────────────────────

  it("shows spinner while verifying and check mark after", async () => {
    render(
      <CreateDemoScreen
        generationClient={createMockGenerationClient()}
        onProjectGenerated={() => undefined}
        onCompositionGenerated={noopCompositionGenerated}
      />,
    );

    fireEvent.change(screen.getByLabelText("GitHub repo URL"), {
      target: { value: "github.com/example/product" },
    });

    // Spinner should appear immediately (verifying starts synchronously)
    expect(screen.getByTitle("Verifying repository")).toBeInTheDocument();

    // Advance past 1100ms to complete verification
    await act(async () => {
      vi.advanceTimersByTime(1200);
    });

    expect(screen.queryByTitle("Verifying repository")).not.toBeInTheDocument();
    expect(screen.getByTitle("Repository verified")).toBeInTheDocument();
  });

  it("verifies a pasted GitHub URL even when it includes a branch path", async () => {
    render(
      <CreateDemoScreen
        generationClient={createMockGenerationClient()}
        onProjectGenerated={() => undefined}
        onCompositionGenerated={noopCompositionGenerated}
      />,
    );

    await enterAndVerifyRepo("https://github.com/example/product/tree/main");
    fireEvent.change(screen.getByLabelText("Demo prompt"), {
      target: { value: "Show the analytics workflow" },
    });

    expect(screen.getByTitle("Repository verified")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).not.toBeDisabled();
  });

  it("clearing the repo input removes verification", async () => {
    render(
      <CreateDemoScreen
        generationClient={createMockGenerationClient()}
        onProjectGenerated={() => undefined}
        onCompositionGenerated={noopCompositionGenerated}
      />,
    );

    await enterAndVerifyRepo();
    expect(screen.getByTitle("Repository verified")).toBeInTheDocument();

    // Clear input
    fireEvent.change(screen.getByLabelText("GitHub repo URL"), {
      target: { value: "" },
    });
    expect(screen.queryByTitle("Repository verified")).not.toBeInTheDocument();
  });

  // ─── send gating ─────────────────────────────────────────────────────────

  it("pressing Enter without a verified repo does not add any message", async () => {
    render(
      <CreateDemoScreen
        generationClient={createMockGenerationClient()}
        onProjectGenerated={() => undefined}
        onCompositionGenerated={noopCompositionGenerated}
      />,
    );

    fireEvent.change(screen.getByLabelText("Demo prompt"), {
      target: { value: "Show the analytics workflow" },
    });

    fireEvent.keyDown(screen.getByLabelText("Demo prompt"), {
      key: "Enter",
      shiftKey: false,
    });

    // Hero heading still visible — no message was sent
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("send button is disabled when prompt is empty even after repo verification", async () => {
    render(
      <CreateDemoScreen
        generationClient={createMockGenerationClient()}
        onProjectGenerated={() => undefined}
        onCompositionGenerated={noopCompositionGenerated}
      />,
    );

    await enterAndVerifyRepo();

    // Prompt is still empty — button should be disabled
    const btn = screen.getByRole("button", { name: "Send" });
    expect(btn).toBeDisabled();
  });

  // ─── successful generation ────────────────────────────────────────────────

  it("valid submit runs generation and shows storyboard card", async () => {
    render(
      <CreateDemoScreen
        generationClient={createMockGenerationClient()}
        onProjectGenerated={() => undefined}
        onCompositionGenerated={noopCompositionGenerated}
      />,
    );

    await enterAndVerifyRepo();

    fireEvent.change(screen.getByLabelText("Demo prompt"), {
      target: { value: "Show the analytics workflow" },
    });

    const sendBtn = screen.getByRole("button", { name: "Send" });
    expect(sendBtn).not.toBeDisabled();
    fireEvent.click(sendBtn);

    // Flush async (mock client resolves immediately)
    await flushAsync();

    // Storyboard card and user message should be in thread
    expect(screen.getByText("Show the analytics workflow")).toBeInTheDocument();
    expect(screen.getByText(/here's the cut I'd make/i)).toBeInTheDocument();
    expect(screen.getByText("Record & open in editor")).toBeInTheDocument();
  });

  it("submits Playwright requests and renders the DemoProject storyboard", async () => {
    const createDemo = vi.fn(async () => completedApiJob());
    const client: GenerationClient = {
      createDemo,
      getJob: vi.fn(async () => completedApiJob()),
      subscribeToProgress: vi.fn(() => () => undefined),
    };

    render(
      <CreateDemoScreen
        generationClient={client}
        onProjectGenerated={() => undefined}
        onCompositionGenerated={noopCompositionGenerated}
      />,
    );

    await enterAndVerifyRepo();
    fireEvent.change(screen.getByLabelText("Demo prompt"), {
      target: { value: "Show the analytics workflow" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await flushAsync();

    expect(createDemo).toHaveBeenCalledWith({
      mode: "ai-url-planning",
      repoUrl: "https://github.com/example/product",
      productUrl: "https://github.com/example/product",
      prompt: "Show the analytics workflow",
      durationCapSeconds: 60,
      aspectRatio: "16:9",
      renderer: "playwright",
    });
    expect(screen.getByText(/here's the cut I'd make/i)).toBeInTheDocument();
    expect(screen.getByText("Record & open in editor")).toBeInTheDocument();
  });

  it("submits HyperFrames requests and routes the completed job to composition", async () => {
    const compositionJobs: string[] = [];
    const createDemo = vi.fn(async () => ({
      ...completedApiJob(),
      request: { ...completedApiJob().request, renderer: "hyperframes" as const },
      result: {
        method: "hyperframes" as const,
        composition: {
          indexArtifact: {
            kind: "composition-index" as const,
            relativePath: "hyperframes/index.html",
            url: "/api/jobs/job-test/artifacts/hyperframes/index.html",
            mediaType: "text/html; charset=utf-8",
          },
          outputVideoArtifact: {
            kind: "output-video" as const,
            relativePath: "hyperframes/output.mp4",
            url: "/api/jobs/job-test/artifacts/hyperframes/output.mp4",
            mediaType: "video/mp4",
          },
        },
        artifacts: [
          {
            kind: "composition-index" as const,
            relativePath: "hyperframes/index.html",
            url: "/api/jobs/job-test/artifacts/hyperframes/index.html",
            mediaType: "text/html; charset=utf-8",
          },
          {
            kind: "output-video" as const,
            relativePath: "hyperframes/output.mp4",
            url: "/api/jobs/job-test/artifacts/hyperframes/output.mp4",
            mediaType: "video/mp4",
          },
        ],
        warnings: [],
      },
    }));
    const client: GenerationClient = {
      createDemo,
      getJob: vi.fn(async () => completedApiJob()),
      subscribeToProgress: vi.fn(() => () => undefined),
    };

    render(
      <CreateDemoScreen
        generationClient={client}
        onProjectGenerated={() => undefined}
        onCompositionGenerated={(job) => compositionJobs.push(job.id)}
      />,
    );

    await enterAndVerifyRepo();
    fireEvent.click(screen.getByRole("radio", { name: /HyperFrames composition/i }));
    fireEvent.change(screen.getByLabelText("Demo prompt"), {
      target: { value: "Show the analytics workflow" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await flushAsync();

    expect(createDemo).toHaveBeenCalledWith(expect.objectContaining({ renderer: "hyperframes" }));
    expect(compositionJobs).toEqual(["job-test"]);
  });

  it("clicking 'Record & open in editor' calls onProjectGenerated", async () => {
    const generated: string[] = [];
    render(
      <CreateDemoScreen
        generationClient={createMockGenerationClient()}
        onProjectGenerated={(project) => generated.push(project.id)}
        onCompositionGenerated={noopCompositionGenerated}
      />,
    );

    await enterAndVerifyRepo();
    fireEvent.change(screen.getByLabelText("Demo prompt"), {
      target: { value: "Show the analytics workflow" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await flushAsync();

    expect(screen.getByText("Record & open in editor")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Record & open in editor"));
    // Mock generation returns the golden driftboard fixture.
    expect(generated).toEqual(["driftboard_demo"]);
  });

  // ─── failure state ────────────────────────────────────────────────────────

  it("failed generation shows graceful error in thread and does not open editor", async () => {
    const generated: string[] = [];
    render(
      <CreateDemoScreen
        generationClient={createMockGenerationClient({ mode: "failed" })}
        onProjectGenerated={(project) => generated.push(project.id)}
        onCompositionGenerated={noopCompositionGenerated}
      />,
    );

    await enterAndVerifyRepo();
    fireEvent.change(screen.getByLabelText("Demo prompt"), {
      target: { value: "Show the analytics workflow" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await flushAsync();

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Capture failed in mock generator");
    expect(generated).toEqual([]);

    // Repo input is still populated
    expect(screen.getByLabelText("GitHub repo URL")).toHaveValue("github.com/example/product");

    // Prompt is restored in the composer so the user can edit and retry
    expect(screen.getByLabelText("Demo prompt")).toHaveValue("Show the analytics workflow");
  });

  // ─── retry after failure ──────────────────────────────────────────────────

  it("after failure, composer is still active and send button re-enables", async () => {
    render(
      <CreateDemoScreen
        generationClient={createMockGenerationClient({ mode: "failed" })}
        onProjectGenerated={() => undefined}
        onCompositionGenerated={noopCompositionGenerated}
      />,
    );

    await enterAndVerifyRepo();
    fireEvent.change(screen.getByLabelText("Demo prompt"), {
      target: { value: "First attempt" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await flushAsync();

    expect(screen.getByRole("alert")).toBeInTheDocument();

    // After failure: type a new prompt and the send button re-enables
    fireEvent.change(screen.getByLabelText("Demo prompt"), {
      target: { value: "Retry attempt" },
    });

    const sendBtn = screen.getByRole("button", { name: "Send" });
    expect(sendBtn).not.toBeDisabled();
  });

  // ─── progress / typing state ──────────────────────────────────────────────

  it("shows 3 typing dots while generation is in progress", async () => {
    // Use a never-resolving promise to keep busy=true permanently for the assertion
    const slowClient = {
      ...createMockGenerationClient(),
      createDemo: (_req: Parameters<ReturnType<typeof createMockGenerationClient>["createDemo"]>[0]) =>
        new Promise<Awaited<ReturnType<ReturnType<typeof createMockGenerationClient>["createDemo"]>>>(
          () => undefined, // never resolves
        ),
    };

    render(
      <CreateDemoScreen
        generationClient={slowClient as ReturnType<typeof createMockGenerationClient>}
        onProjectGenerated={() => undefined}
        onCompositionGenerated={noopCompositionGenerated}
      />,
    );

    await enterAndVerifyRepo();
    fireEvent.change(screen.getByLabelText("Demo prompt"), {
      target: { value: "Show the analytics workflow" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
    });

    // While pending, 3 typing dots should be visible
    const dots = screen.getAllByTestId("typing-dot");
    expect(dots.length).toBe(3);
  });

  // ─── optional affordances ─────────────────────────────────────────────────

  it("renders 'or start from a sample project' link when onUseSampleProject is provided", () => {
    const handler = vi.fn();
    render(
      <CreateDemoScreen
        generationClient={createMockGenerationClient()}
        onProjectGenerated={() => undefined}
        onCompositionGenerated={noopCompositionGenerated}
        onUseSampleProject={handler}
      />,
    );

    const link = screen.getByText("or start from a sample project");
    expect(link).toBeInTheDocument();
    fireEvent.click(link);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does NOT render sample-project link when onUseSampleProject is omitted", () => {
    render(
      <CreateDemoScreen
        generationClient={createMockGenerationClient()}
        onProjectGenerated={() => undefined}
        onCompositionGenerated={noopCompositionGenerated}
      />,
    );

    expect(screen.queryByText("or start from a sample project")).not.toBeInTheDocument();
  });

  it("renders 'Return to editor' link when hasInProgressProject=true and onReturnToEditor is provided", () => {
    const handler = vi.fn();
    render(
      <CreateDemoScreen
        generationClient={createMockGenerationClient()}
        onProjectGenerated={() => undefined}
        onCompositionGenerated={noopCompositionGenerated}
        onReturnToEditor={handler}
        hasInProgressProject={true}
        onUseSampleProject={() => undefined}
      />,
    );

    const link = screen.getByText("Return to editor");
    expect(link).toBeInTheDocument();
    fireEvent.click(link);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does NOT render 'Return to editor' link when hasInProgressProject=false", () => {
    render(
      <CreateDemoScreen
        generationClient={createMockGenerationClient()}
        onProjectGenerated={() => undefined}
        onCompositionGenerated={noopCompositionGenerated}
        onReturnToEditor={() => undefined}
        hasInProgressProject={false}
        onUseSampleProject={() => undefined}
      />,
    );

    expect(screen.queryByText("Return to editor")).not.toBeInTheDocument();
  });
});
