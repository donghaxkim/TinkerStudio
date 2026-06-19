import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ApiGenerationJob } from "@tinker/generation-contract";
import type { CompositionGenerationClient, CreateCompositionJobRequest } from "../../lib/compositionGenerationClient.js";
import type { CompositionPlanningClient, CompositionPlanningSession } from "../../lib/compositionPlanningClient.js";
import { CompositionDemoScreen } from "./CompositionDemoScreen.js";

const removedAgentLabel = "Hyper" + "frames agent";
const removedAgentField = "hyper" + "framesAgent";

function completedPlaywrightJob(): ApiGenerationJob {
  return {
    id: "playwright-job-1",
    status: "completed",
    request: {
      id: "playwright-job-1",
      mode: "ai-url-planning",
      repoUrl: "https://github.com/acme/driftboard",
      productUrl: "https://driftboard.example.com",
      durationCapSeconds: 60,
      aspectRatio: "16:9",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    progressEvents: [],
    result: {
      method: "playwright",
      project: {
        schemaVersion: "0.1.0",
        id: "playwright-job-1",
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
          url: "/api/jobs/playwright-job-1/artifacts/playwright/final.mp4",
          mediaType: "video/mp4",
        },
      ],
      warnings: [],
    },
  };
}

function queuedJob(request: CreateCompositionJobRequest): ApiGenerationJob {
  return {
    id: "job-1",
    status: "queued",
    request: { id: "job-1", ...request, productUrl: request.productUrl ?? "https://driftboard.example.com" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    progressEvents: [],
  };
}

function planningSession(overrides: Partial<CompositionPlanningSession> = {}): CompositionPlanningSession {
  return {
    id: "plan-test",
    productUrl: "https://driftboard.example.com",
    repoUrl: "https://github.com/acme/driftboard",
    agent: "claude",
    status: "ready",
    messages: [{ role: "assistant", content: "I drafted a grounded outline." }],
    progress: [],
    outline: {
      title: "Driftboard launch demo",
      durationCapSeconds: 60,
      aspectRatio: "16:9",
      summary: "Show the launch workflow from product evidence.",
      scenes: [
        { id: "scene-1", goal: "Open on the launch problem", visual: "Show the homepage hero.", evidence: ["website"] },
        { id: "scene-2", goal: "Show repo-backed details", visual: "Use real component names from the repo.", evidence: ["repo", "website"] },
      ],
      generationNotes: ["Keep pacing concise."],
    },
    outlineValid: true,
    ...overrides,
  };
}

function createPlanningClient(session = planningSession()): CompositionPlanningClient {
  return {
    createSession: vi.fn(async () => session),
    sendMessage: vi.fn(async (_sessionId: string, message: string) => ({
      ...session,
      messages: [...session.messages, { role: "user" as const, content: message }, { role: "assistant" as const, content: "Updated the outline." }],
    })),
    getSession: vi.fn(async () => session),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function createLocalCompositionGenerationClient(): CompositionGenerationClient {
  return {
    createJob: async (request) => queuedJob(request),
    getJob: async () => queuedJob({ mode: "ai-url-planning", repoUrl: "https://github.com/acme/driftboard", durationCapSeconds: 60, aspectRatio: "16:9" }),
    waitForJob: async () => completedPlaywrightJob(),
  };
}

describe("CompositionDemoScreen", () => {
  it("opens completed Playwright jobs in the editor shell as a video-only preview", () => {
    render(
      <CompositionDemoScreen
        client={createLocalCompositionGenerationClient()}
        planningClient={createPlanningClient()}
        initialCompletedJob={completedPlaywrightJob()}
      />,
    );

    expect(screen.getByLabelText("Editor status")).toHaveTextContent("Saved");
    expect(screen.getByRole("button", { name: "Export" })).not.toBeDisabled();
    expect(screen.getByTestId("composition-standalone-video")).toHaveAttribute("src", "/api/jobs/playwright-job-1/artifacts/playwright/final.mp4");
  });

  it("starts planning from Product URL and GitHub repo URL without renderer/import controls", async () => {
    const planningClient = createPlanningClient();
    render(<CompositionDemoScreen client={createLocalCompositionGenerationClient()} planningClient={planningClient} />);

    expect(screen.getByRole("heading", { name: /Tinker Studio/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Product URL")).toBeInTheDocument();
    expect(screen.getByLabelText("GitHub repo URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Planning agent")).toHaveValue("opencode");
    expect(screen.queryByLabelText("Renderer")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(removedAgentLabel)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit an existing demo" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "https://driftboard.example.com" } });
    fireEvent.change(screen.getByLabelText("GitHub repo URL"), { target: { value: "https://github.com/acme/driftboard" } });
    fireEvent.click(screen.getByRole("button", { name: "Plan" }));

    await waitFor(() =>
      expect(planningClient.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          productUrl: "https://driftboard.example.com",
          repoUrl: "https://github.com/acme/driftboard",
          agent: "opencode",
        }),
      ),
    );
    expect(await screen.findByText("I drafted a grounded outline.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Driftboard launch demo" })).toBeInTheDocument();
  });

  it("keeps planning disabled until both Product URL and GitHub repo URL are valid", () => {
    const planningClient = createPlanningClient();
    render(<CompositionDemoScreen client={createLocalCompositionGenerationClient()} planningClient={planningClient} />);

    const planButton = screen.getByRole("button", { name: "Plan" });
    expect(planButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("GitHub repo URL"), { target: { value: "https://github.com/acme/driftboard" } });
    expect(planButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "https://driftboard.example.com" } });
    expect(planButton).not.toBeDisabled();
  });

  it("Generate now sends repo + URL only, with no prompt or renderer fields", async () => {
    let capturedRequest: CreateCompositionJobRequest | undefined;
    const wait = deferred<ApiGenerationJob>();
    const client: CompositionGenerationClient = {
      createJob: vi.fn(async (request: CreateCompositionJobRequest): Promise<ApiGenerationJob> => {
        capturedRequest = request;
        return queuedJob(request);
      }),
      getJob: async () => { throw new Error("not used"); },
      waitForJob: async () => wait.promise,
    };
    render(<CompositionDemoScreen client={client} planningClient={createPlanningClient()} />);

    expect(screen.queryByLabelText("Demo prompt")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("GitHub repo URL"), { target: { value: "https://github.com/acme/driftboard" } });
    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "https://driftboard.example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate now" }));

    await waitFor(() => expect(client.createJob).toHaveBeenCalled());
    expect(capturedRequest).toMatchObject({
      mode: "ai-url-planning",
      repoUrl: "https://github.com/acme/driftboard",
      productUrl: "https://driftboard.example.com",
      durationCapSeconds: 45,
      aspectRatio: "16:9",
    });
    expect("prompt" in (capturedRequest as object)).toBe(false);
    expect("renderer" in (capturedRequest as object)).toBe(false);
    expect(removedAgentField in (capturedRequest as object)).toBe(false);
  });

  it("system prompt is hidden by default; when edited it is sent with Generate now", async () => {
    let capturedRequest: CreateCompositionJobRequest | undefined;
    const wait = deferred<ApiGenerationJob>();
    const client: CompositionGenerationClient = {
      createJob: vi.fn(async (request: CreateCompositionJobRequest): Promise<ApiGenerationJob> => {
        capturedRequest = request;
        return queuedJob(request);
      }),
      getJob: async () => { throw new Error("not used"); },
      waitForJob: async () => wait.promise,
    };
    render(<CompositionDemoScreen client={client} planningClient={createPlanningClient()} />);

    expect(screen.queryByLabelText("System prompt")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit system prompt" }));
    const textarea = screen.getByLabelText("System prompt") as HTMLTextAreaElement;
    expect(textarea.value).toContain("evidence-grounded product demo");

    fireEvent.change(screen.getByLabelText("GitHub repo URL"), { target: { value: "https://github.com/acme/driftboard" } });
    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "https://driftboard.example.com" } });
    fireEvent.change(textarea, { target: { value: "Focus on the onboarding flow only." } });
    fireEvent.click(screen.getByRole("button", { name: "Generate now" }));

    await waitFor(() => expect(client.createJob).toHaveBeenCalled());
    expect((capturedRequest as CreateCompositionJobRequest).systemPrompt).toBe("Focus on the onboarding flow only.");
  });

  it("can start planning with Claude Code when selected", async () => {
    const planningClient = createPlanningClient();
    render(<CompositionDemoScreen client={createLocalCompositionGenerationClient()} planningClient={planningClient} />);

    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "https://driftboard.example.com" } });
    fireEvent.change(screen.getByLabelText("GitHub repo URL"), { target: { value: "https://github.com/acme/driftboard" } });
    fireEvent.change(screen.getByLabelText("Planning agent"), { target: { value: "claude" } });
    fireEvent.click(screen.getByRole("button", { name: "Plan" }));

    await waitFor(() =>
      expect(planningClient.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          productUrl: "https://driftboard.example.com",
          repoUrl: "https://github.com/acme/driftboard",
          agent: "claude",
        }),
      ),
    );
  });

  it("continues planning with the backend session id", async () => {
    const planningClient = createPlanningClient();
    render(<CompositionDemoScreen client={createLocalCompositionGenerationClient()} planningClient={planningClient} />);

    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "https://driftboard.example.com" } });
    fireEvent.change(screen.getByLabelText("GitHub repo URL"), { target: { value: "https://github.com/acme/driftboard" } });
    fireEvent.click(screen.getByRole("button", { name: "Plan" }));
    await screen.findByText("I drafted a grounded outline.");

    fireEvent.change(screen.getByLabelText("Planning message"), { target: { value: "Make it more technical." } });
    fireEvent.click(screen.getByRole("button", { name: "Send planning message" }));

    await waitFor(() => expect(planningClient.sendMessage).toHaveBeenCalledWith("plan-test", "Make it more technical."));
    expect(await screen.findByText("Updated the outline.")).toBeInTheDocument();
  });

  it("generates a Playwright video from the approved outline without renderer fields", async () => {
    let capturedRequest: CreateCompositionJobRequest | undefined;
    const client = {
      createJob: vi.fn(async (request: CreateCompositionJobRequest): Promise<ApiGenerationJob> => {
        capturedRequest = request;
        return queuedJob(request);
      }),
      getJob: async () => {
        throw new Error("not used");
      },
      waitForJob: async (): Promise<ApiGenerationJob> => completedPlaywrightJob(),
    } satisfies CompositionGenerationClient;
    render(<CompositionDemoScreen client={client} planningClient={createPlanningClient()} />);

    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "https://driftboard.example.com" } });
    fireEvent.change(screen.getByLabelText("GitHub repo URL"), { target: { value: "https://github.com/acme/driftboard" } });
    fireEvent.click(screen.getByRole("button", { name: "Plan" }));
    await screen.findByRole("heading", { name: "Driftboard launch demo" });
    expect(screen.queryByLabelText("Renderer")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(removedAgentLabel)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit an existing demo" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate video" }));

    await waitFor(() => expect(client.createJob).toHaveBeenCalled());
    expect(capturedRequest).toMatchObject({
      mode: "ai-url-planning",
      repoUrl: "https://github.com/acme/driftboard",
      durationCapSeconds: 60,
      aspectRatio: "16:9",
    });
    expect("renderer" in (capturedRequest as object)).toBe(false);
    expect(removedAgentField in (capturedRequest as object)).toBe(false);
    expect(client.createJob).toHaveBeenCalledWith(expect.objectContaining({ prompt: expect.stringContaining("Driftboard launch demo") }));
    expect(await screen.findByTestId("composition-standalone-video")).toHaveAttribute("src", "/api/jobs/playwright-job-1/artifacts/playwright/final.mp4");
    const repoLink = screen.getByRole("link", { name: "GitHub repository acme/driftboard" });
    expect(repoLink).toHaveTextContent("github.com/acme/driftboard");
    expect(repoLink).toHaveAttribute("href", "https://github.com/acme/driftboard");
  });

  it("disables generation until the planning agent produces a valid outline", async () => {
    render(<CompositionDemoScreen client={createLocalCompositionGenerationClient()} planningClient={createPlanningClient(planningSession({ outlineValid: false }))} />);

    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "https://driftboard.example.com" } });
    fireEvent.change(screen.getByLabelText("GitHub repo URL"), { target: { value: "https://github.com/acme/driftboard" } });
    fireEvent.click(screen.getByRole("button", { name: "Plan" }));

    expect(await screen.findByText("The agent has not produced a valid outline yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate video" })).toBeDisabled();
  });

  it("shows an error when generation fails", async () => {
    const client = {
      createJob: async (request: CreateCompositionJobRequest) => queuedJob(request),
      getJob: async () => ({ id: "j" }),
      waitForJob: async () => ({ id: "j", status: "failed", error: { message: "Server error" } }),
    } as unknown as CompositionGenerationClient;
    render(<CompositionDemoScreen client={client} planningClient={createPlanningClient()} />);
    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "https://driftboard.example.com" } });
    fireEvent.change(screen.getByLabelText("GitHub repo URL"), { target: { value: "https://github.com/x/y" } });
    fireEvent.click(screen.getByRole("button", { name: "Plan" }));
    await screen.findByText("I drafted a grounded outline.");
    fireEvent.click(screen.getByRole("button", { name: "Generate video" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Server error"));
  });

  it("returns to the form when generation is cancelled", async () => {
    const client = {
      createJob: async (request: CreateCompositionJobRequest) => queuedJob(request),
      getJob: async () => ({ id: "j" }),
      waitForJob: (_id: string, opts?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    } as unknown as CompositionGenerationClient;
    render(<CompositionDemoScreen client={client} planningClient={createPlanningClient()} />);
    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "https://driftboard.example.com" } });
    fireEvent.change(screen.getByLabelText("GitHub repo URL"), { target: { value: "https://github.com/x/y" } });
    fireEvent.click(screen.getByRole("button", { name: "Plan" }));
    await screen.findByText("I drafted a grounded outline.");
    fireEvent.click(screen.getByRole("button", { name: "Generate video" }));
    await screen.findByTestId("composition-generating");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate video" })).toBeInTheDocument());
  });
});
