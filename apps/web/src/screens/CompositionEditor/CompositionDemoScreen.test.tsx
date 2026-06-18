import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TimelineRegistryWindow, CompositionTimelineHandle } from "@tinker/editor";
import type { ApiGenerationJob } from "@tinker/generation-contract";
import type { CompositionGenerationClient, CreateCompositionJobRequest } from "../../lib/compositionGenerationClient.js";
import type { CompositionPlanningClient, CompositionPlanningSession } from "../../lib/compositionPlanningClient.js";
import type { CompositionImportClient } from "../../lib/compositionImportClient.js";
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
      hyperframesAgent: "claude",
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
      renderer: "playwright",
      hyperframesAgent: "claude",
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
        assets: [
          {
            id: "capture-001",
            type: "video",
            uri: "assets/capture-001.mp4",
            source: "captured",
            duration: 10,
            width: 1920,
            height: 1080,
            metadata: {},
          },
        ],
        tracks: [
          {
            id: "track-video-main",
            type: "video",
            name: "Main capture",
            locked: false,
            hidden: false,
            clips: [
              {
                id: "clip-capture-001",
                assetId: "capture-001",
                start: 0,
                end: 10,
                sourceStart: 0,
                muted: false,
                opacity: 1,
                transform: { x: 0, y: 0, scale: 1, rotation: 0 },
              },
            ],
          },
        ],
        zooms: [],
        cursorEvents: [],
        aiEditHistory: [],
        metadata: { notes: [] },
      },
      artifacts: [
        {
          kind: "playwright-demo-project",
          relativePath: "playwright/demo-project.json",
          url: "/api/jobs/playwright-job-1/artifacts/playwright/demo-project.json",
          mediaType: "application/json; charset=utf-8",
        },
        {
          kind: "playwright-video",
          relativePath: "playwright/capture/videos/capture-001.mp4",
          url: "/api/jobs/playwright-job-1/artifacts/playwright/capture/videos/capture-001.mp4",
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

function emptyHandle(): CompositionTimelineHandle {
  return {
    totalDuration: () => 12,
    labels: [] as unknown as Record<string, number>,
    getChildren: () => [],
    seek: () => undefined,
    play: () => undefined,
    pause: () => undefined,
  } as unknown as CompositionTimelineHandle;
}

function createLocalCompositionGenerationClient(): CompositionGenerationClient {
  return {
    createJob: async () => completedCompositionJob(),
    getJob: async () => completedCompositionJob(),
    waitForJob: async () => completedCompositionJob(),
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
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function fileWithPath(name: string, relativePath: string): File {
  const file = new File(["x"], name, { type: "application/octet-stream" });
  Object.defineProperty(file, "webkitRelativePath", { value: relativePath });
  return file;
}

describe("CompositionDemoScreen", () => {
  it("opens a preloaded completed HyperFrames job in the editor", async () => {
    const client = createLocalCompositionGenerationClient();
    render(
      <CompositionDemoScreen
        client={client}
        planningClient={createPlanningClient()}
        initialCompletedJob={completedCompositionJob()}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: fakeHandle() } })}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("composition-frame")).toBeInTheDocument());
  });

  it("opens HyperFrames jobs with the canonical composition result URL", () => {
    const client = createLocalCompositionGenerationClient();
    const completedJob = completedCompositionJob();
    if (completedJob.result?.method !== "hyperframes") throw new Error("Expected HyperFrames result");
    completedJob.result.artifacts = [
      {
        kind: "composition-index",
        relativePath: "decoy/index.html",
        url: "/api/jobs/mock-job-1/artifacts/decoy/index.html",
        mediaType: "text/html",
      },
      ...completedJob.result.artifacts,
    ];

    render(
      <CompositionDemoScreen
        client={client}
        planningClient={createPlanningClient()}
        initialCompletedJob={completedJob}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: fakeHandle() } })}
      />,
    );

    expect(screen.getByTestId("composition-frame")).toHaveAttribute(
      "src",
      completedJob.result.composition.indexArtifact.url,
    );
  });

  it("renders completed Playwright jobs as an artifact result view", () => {
    render(
      <CompositionDemoScreen
        client={createLocalCompositionGenerationClient()}
        planningClient={createPlanningClient()}
        initialCompletedJob={completedPlaywrightJob()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Playwright demo ready" })).toBeInTheDocument();
    expect(screen.getByText("Generated DemoProject and capture artifacts from the Playwright pipeline.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open DemoProject JSON" })).toHaveAttribute(
      "href",
      "/api/jobs/playwright-job-1/artifacts/playwright/demo-project.json",
    );
    expect(screen.getByTestId("playwright-result-video")).toHaveAttribute(
      "src",
      "/api/jobs/playwright-job-1/artifacts/playwright/capture/videos/capture-001.mp4",
    );
  });

  it("opens the empty editor shell shortcut without starting generation, then returns to the form", async () => {
    const client = createLocalCompositionGenerationClient();
    const createJob = vi.spyOn(client, "createJob");
    render(
      <CompositionDemoScreen
        client={client}
        planningClient={createPlanningClient()}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: emptyHandle() } })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open empty editor shell" }));

    expect(createJob).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId("composition-frame")).toBeInTheDocument());
    expect(screen.getByTestId("composition-frame")).toHaveAttribute("src", "/demo-composition/index.html");
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByLabelText("Editor status")).toHaveTextContent("Empty editor shell"));
    expect(screen.getByTestId("composition-timeline")).toBeInTheDocument();
    expect(screen.getByLabelText("Playback controls")).toBeInTheDocument();
    // The empty shell carries the same edit toolbar as the real editor (split/trim work on
    // the local model without a server edit session); Export stays disabled until a real render exists.
    expect(screen.getByRole("button", { name: "Split clip" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
    expect(screen.queryByText(/generate a demo to enable ai edits/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Edit instruction")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Back to create" }));
    expect(screen.getByRole("heading", { name: /Tinker Studio/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open empty editor shell" })).toBeInTheDocument();
  });

  it("hides the start shortcuts once the box morphs into the planning chat", async () => {
    const client = createLocalCompositionGenerationClient();
    const createSession = deferred<CompositionPlanningSession>();
    const planningClient: CompositionPlanningClient = {
      createSession: vi.fn(async () => createSession.promise),
      sendMessage: vi.fn(async () => planningSession()),
      getSession: vi.fn(async () => planningSession({ status: "running", messages: [], outline: undefined, outlineValid: false })),
    };
    render(<CompositionDemoScreen client={client} planningClient={planningClient} />);

    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "https://driftboard.example.com" } });
    fireEvent.change(screen.getByLabelText("GitHub repo URL"), { target: { value: "https://github.com/acme/driftboard" } });
    fireEvent.click(screen.getByRole("button", { name: "Plan" }));

    await waitFor(() => expect(planningClient.createSession).toHaveBeenCalled());
    // The paste box has become the chat: the start-only escape hatch is gone, and the
    // planning transcript is now present.
    expect(screen.queryByRole("button", { name: "Open empty editor shell" })).not.toBeInTheDocument();
    expect(screen.getByRole("log", { name: "Planning transcript" })).toBeInTheDocument();

    createSession.resolve(planningSession());
    expect(await screen.findByText("I drafted a grounded outline.")).toBeInTheDocument();
  });

  it("disables the top-level Back button while initial planning is in flight", async () => {
    const client = createLocalCompositionGenerationClient();
    const createSession = deferred<CompositionPlanningSession>();
    const planningClient: CompositionPlanningClient = {
      createSession: vi.fn(async () => createSession.promise),
      sendMessage: vi.fn(async () => planningSession()),
      getSession: vi.fn(async () => planningSession({ status: "running", messages: [], outline: undefined, outlineValid: false })),
    };
    const onBack = vi.fn();
    render(<CompositionDemoScreen client={client} planningClient={planningClient} onBack={onBack} />);

    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "https://driftboard.example.com" } });
    fireEvent.change(screen.getByLabelText("GitHub repo URL"), { target: { value: "https://github.com/acme/driftboard" } });
    fireEvent.click(screen.getByRole("button", { name: "Plan" }));

    await waitFor(() => expect(planningClient.createSession).toHaveBeenCalled());
    const topLevelBack = screen.getByRole("button", { name: "Back" });
    expect(topLevelBack).toBeDisabled();
    fireEvent.click(topLevelBack);
    expect(onBack).not.toHaveBeenCalled();

    createSession.resolve(planningSession());
    expect(await screen.findByText("I drafted a grounded outline.")).toBeInTheDocument();
  });

  it("trims a clip in the empty editor shell (same manual repair tools as the real editor)", async () => {
    const client = createLocalCompositionGenerationClient();
    render(
      <CompositionDemoScreen
        client={client}
        planningClient={createPlanningClient()}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: fakeHandle() } })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open empty editor shell" }));
    await waitFor(() => expect(screen.getByTestId("composition-frame")).toBeInTheDocument());
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByLabelText("Editor status")).toHaveTextContent("Empty editor shell"));
    await waitFor(() => expect(screen.getByTestId("composition-clip-scene")).toBeInTheDocument());

    const track = screen.getByTestId("composition-timeline");
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
      left: 0, width: 1000, top: 0, right: 1000, bottom: 56, height: 56, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);

    // Select the lone scene clip (0–10s), then drag its end handle from 10s to 8s.
    fireEvent.click(screen.getByTestId("composition-clip-scene"));
    fireEvent.mouseDown(screen.getByTestId("composition-trim-scene-end"), { clientX: 1000 });
    fireEvent.mouseMove(track, { clientX: 800 });
    fireEvent.mouseUp(track, { clientX: 800 });

    const clip = screen.getByTestId("composition-clip-scene");
    expect(clip).toHaveTextContent("8.0s");
    expect(clip).toHaveAttribute("data-selected", "true");

    // Undo works on the local model in the empty shell, just like split/delete/marker.
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByTestId("composition-clip-scene")).toHaveTextContent("10.0s");
  });

  it("starts planning from Product URL and GitHub repo URL", async () => {
    const client = createLocalCompositionGenerationClient();
    const planningClient = createPlanningClient();
    render(<CompositionDemoScreen client={client} planningClient={planningClient} />);

    expect(screen.getByRole("heading", { name: /Tinker Studio/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Product URL")).toBeInTheDocument();
    expect(screen.getByLabelText("GitHub repo URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Planning agent")).toHaveValue("opencode");
    expect(screen.queryByLabelText("Demo description")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Demo prompt")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Playwright/i })).not.toBeInTheDocument();

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
    expect(screen.getByText("Open on the launch problem")).toBeInTheDocument();
    expect(screen.getByText("Show repo-backed details")).toBeInTheDocument();
  });

  it("keeps planning disabled until both Product URL and GitHub repo URL are valid", () => {
    const client = createLocalCompositionGenerationClient();
    const planningClient = createPlanningClient();
    render(<CompositionDemoScreen client={client} planningClient={planningClient} />);

    const planButton = screen.getByRole("button", { name: "Plan" });
    expect(planButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("GitHub repo URL"), { target: { value: "https://github.com/acme/driftboard" } });
    expect(planButton).toBeDisabled();
    fireEvent.click(planButton);

    expect(planningClient.createSession).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "https://driftboard.example.com" } });
    expect(planButton).not.toBeDisabled();
  });

  it("Generate now sends repo + URL only — no prompt key", async () => {
    let capturedRequest: CreateCompositionJobRequest | undefined;
    const client: CompositionGenerationClient = {
      createJob: vi.fn(async (request: CreateCompositionJobRequest): Promise<ApiGenerationJob> => {
        capturedRequest = request;
        return {
          id: "direct-job-1",
          status: "queued",
          request: {
            id: "direct-job-1",
            mode: "ai-url-planning",
            repoUrl: "https://github.com/acme/driftboard",
            productUrl: "https://driftboard.example.com",
            durationCapSeconds: 45,
            aspectRatio: "16:9",
            renderer: "playwright",
            hyperframesAgent: "opencode",
          },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          progressEvents: [],
        };
      }),
      getJob: async () => { throw new Error("not used"); },
      waitForJob: (_id: string, opts?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    };
    render(<CompositionDemoScreen client={client} planningClient={createPlanningClient()} />);

    // The "Demo prompt" textarea must not exist at all.
    expect(screen.queryByLabelText("Demo prompt")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("GitHub repo URL"), { target: { value: "https://github.com/acme/driftboard" } });
    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "https://driftboard.example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate now" }));

    await waitFor(() => expect(client.createJob).toHaveBeenCalled());
    expect(capturedRequest).toBeDefined();
    expect("prompt" in (capturedRequest as CreateCompositionJobRequest)).toBe(false);
  });

  it("system prompt is hidden by default; when edited it is sent with Generate now", async () => {
    let capturedRequest: CreateCompositionJobRequest | undefined;
    const client: CompositionGenerationClient = {
      createJob: vi.fn(async (request: CreateCompositionJobRequest): Promise<ApiGenerationJob> => {
        capturedRequest = request;
        return {
          id: "direct-job-2",
          status: "queued",
          request: {
            id: "direct-job-2",
            mode: "ai-url-planning",
            repoUrl: "https://github.com/acme/driftboard",
            productUrl: "https://driftboard.example.com",
            durationCapSeconds: 45,
            aspectRatio: "16:9",
            renderer: "playwright",
            hyperframesAgent: "opencode",
          },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          progressEvents: [],
        };
      }),
      getJob: async () => { throw new Error("not used"); },
      waitForJob: (_id: string, opts?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    };
    render(<CompositionDemoScreen client={client} planningClient={createPlanningClient()} />);

    // Hidden by default — no system-prompt textarea until revealed.
    expect(screen.queryByLabelText("System prompt")).not.toBeInTheDocument();

    // Click reveals it, prefilled with the default directive.
    fireEvent.click(screen.getByRole("button", { name: "Edit system prompt" }));
    const textarea = screen.getByLabelText("System prompt") as HTMLTextAreaElement;
    expect(textarea.value).toContain("evidence-grounded product demo");

    // Edit it, then generate → the request carries the edited systemPrompt.
    fireEvent.change(screen.getByLabelText("GitHub repo URL"), { target: { value: "https://github.com/acme/driftboard" } });
    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "https://driftboard.example.com" } });
    fireEvent.change(textarea, { target: { value: "Focus on the onboarding flow only." } });
    fireEvent.click(screen.getByRole("button", { name: "Generate now" }));

    await waitFor(() => expect(client.createJob).toHaveBeenCalled());
    expect((capturedRequest as CreateCompositionJobRequest).systemPrompt).toBe("Focus on the onboarding flow only.");
  });

  it("can start planning with Claude Code when selected", async () => {
    const client = createLocalCompositionGenerationClient();
    const planningClient = createPlanningClient();
    render(<CompositionDemoScreen client={client} planningClient={planningClient} />);

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
    const client = createLocalCompositionGenerationClient();
    const planningClient = createPlanningClient();
    render(<CompositionDemoScreen client={client} planningClient={planningClient} />);

    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "https://driftboard.example.com" } });
    fireEvent.change(screen.getByLabelText("GitHub repo URL"), { target: { value: "https://github.com/acme/driftboard" } });
    fireEvent.click(screen.getByRole("button", { name: "Plan" }));
    await screen.findByText("I drafted a grounded outline.");

    fireEvent.change(screen.getByLabelText("Planning message"), { target: { value: "Make it more technical." } });
    fireEvent.click(screen.getByRole("button", { name: "Send planning message" }));

    await waitFor(() => expect(planningClient.sendMessage).toHaveBeenCalledWith("plan-test", "Make it more technical."));
    expect(await screen.findByText("Updated the outline.")).toBeInTheDocument();
  });

  it("exposes the planning transcript as an accessible log", async () => {
    const client = createLocalCompositionGenerationClient();
    render(<CompositionDemoScreen client={client} planningClient={createPlanningClient()} />);

    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "https://driftboard.example.com" } });
    fireEvent.change(screen.getByLabelText("GitHub repo URL"), { target: { value: "https://github.com/acme/driftboard" } });
    fireEvent.click(screen.getByRole("button", { name: "Plan" }));

    const transcript = await screen.findByRole("log", { name: "Planning transcript" });
    expect(transcript).toHaveTextContent("I drafted a grounded outline.");
  });

  it("disables generation and back navigation while a planning follow-up is in flight", async () => {
    const client = createLocalCompositionGenerationClient();
    const send = deferred<CompositionPlanningSession>();
    const planningClient: CompositionPlanningClient = {
      createSession: vi.fn(async () => planningSession()),
      sendMessage: vi.fn(async () => send.promise),
      getSession: vi.fn(async () => planningSession()),
    };
    render(<CompositionDemoScreen client={client} planningClient={planningClient} />);

    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "https://driftboard.example.com" } });
    fireEvent.change(screen.getByLabelText("GitHub repo URL"), { target: { value: "https://github.com/acme/driftboard" } });
    fireEvent.click(screen.getByRole("button", { name: "Plan" }));
    await screen.findByRole("heading", { name: "Driftboard launch demo" });

    fireEvent.change(screen.getByLabelText("Planning message"), { target: { value: "Make it more technical." } });
    fireEvent.click(screen.getByRole("button", { name: "Send planning message" }));

    await waitFor(() => expect(planningClient.sendMessage).toHaveBeenCalledWith("plan-test", "Make it more technical."));
    expect(screen.getByRole("button", { name: "Generate video" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Back to URLs" })).toBeDisabled();

    send.resolve(planningSession({ messages: [...planningSession().messages, { role: "assistant", content: "Updated the outline." }] }));
    expect(await screen.findByText("Updated the outline.")).toBeInTheDocument();
  });

  it("generates Hyperframes with OpenCode by default from the approved outline", async () => {
    const client = {
      createJob: vi.fn(async (_request: CreateCompositionJobRequest): Promise<ApiGenerationJob> => ({
        id: "job-1",
        status: "queued",
        request: {
          id: "job-1",
          mode: "ai-url-planning",
          repoUrl: "https://github.com/acme/driftboard",
          productUrl: "https://driftboard.example.com",
          durationCapSeconds: 60,
          aspectRatio: "16:9",
          renderer: "hyperframes",
          hyperframesAgent: "opencode",
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        progressEvents: [],
      })),
      getJob: async () => {
        throw new Error("not used");
      },
      waitForJob: async (): Promise<ApiGenerationJob> => ({
        id: "job-1",
        status: "completed",
        request: {
          id: "job-1",
          mode: "ai-url-planning",
          repoUrl: "https://github.com/acme/driftboard",
          productUrl: "https://driftboard.example.com",
          durationCapSeconds: 60,
          aspectRatio: "16:9",
          renderer: "hyperframes",
          hyperframesAgent: "opencode",
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
              url: "/api/jobs/job-1/artifacts/hyperframes/index.html",
              mediaType: "text/html",
            },
            outputVideoArtifact: {
              kind: "output-video",
              relativePath: "hyperframes/output.mp4",
              url: "/api/jobs/job-1/artifacts/hyperframes/output.mp4",
              mediaType: "video/mp4",
            },
          },
          artifacts: [
            {
              kind: "composition-index",
              relativePath: "hyperframes/index.html",
              url: "/api/jobs/job-1/artifacts/hyperframes/index.html",
              mediaType: "text/html",
            },
            {
              kind: "output-video",
              relativePath: "hyperframes/output.mp4",
              url: "/api/jobs/job-1/artifacts/hyperframes/output.mp4",
              mediaType: "video/mp4",
            },
          ],
          warnings: [],
        },
      }),
    } satisfies CompositionGenerationClient;
    render(
      <CompositionDemoScreen
        client={client}
        planningClient={createPlanningClient()}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: fakeHandle() } })}
      />,
    );

    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "https://driftboard.example.com" } });
    fireEvent.change(screen.getByLabelText("GitHub repo URL"), { target: { value: "https://github.com/acme/driftboard" } });
    fireEvent.click(screen.getByRole("button", { name: "Plan" }));
    await screen.findByRole("heading", { name: "Driftboard launch demo" });
    expect(screen.getByLabelText("Renderer")).toHaveValue("hyperframes");
    expect(screen.getByLabelText("Hyperframes agent")).toHaveValue("opencode");
    fireEvent.click(screen.getByRole("button", { name: "Generate video" }));

    await waitFor(() =>
      expect(client.createJob).toHaveBeenCalledWith(expect.objectContaining({
        mode: "ai-url-planning",
        repoUrl: "https://github.com/acme/driftboard",
        productUrl: "https://driftboard.example.com",
        durationCapSeconds: 60,
        aspectRatio: "16:9",
        prompt: expect.stringContaining("Use this approved video outline as the product demo brief:"),
        renderer: "hyperframes",
        hyperframesAgent: "opencode",
      })),
    );
    expect(client.createJob).toHaveBeenCalledWith(expect.objectContaining({ prompt: expect.stringContaining("Driftboard launch demo") }));
    await waitFor(() => expect(screen.getByTestId("composition-frame")).toBeInTheDocument());
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("composition-timeline")).toBeInTheDocument());
    // The editor app bar shows the pasted repo as a link to the GitHub repository.
    const repoLink = screen.getByRole("link", { name: "GitHub repository acme/driftboard" });
    expect(repoLink).toHaveTextContent("github.com/acme/driftboard");
    expect(repoLink).toHaveAttribute("href", "https://github.com/acme/driftboard");
  });

  it("can generate a Playwright demo from the approved outline", async () => {
    const client = {
      createJob: vi.fn(async (_request: CreateCompositionJobRequest): Promise<ApiGenerationJob> => ({
        id: "job-1",
        status: "queued",
        request: {
          id: "job-1",
          mode: "ai-url-planning",
          repoUrl: "https://github.com/acme/driftboard",
          productUrl: "https://driftboard.example.com",
          durationCapSeconds: 60,
          aspectRatio: "16:9",
          renderer: "playwright",
          hyperframesAgent: "opencode",
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        progressEvents: [],
      })),
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
    fireEvent.change(screen.getByLabelText("Renderer"), { target: { value: "playwright" } });
    expect(screen.queryByLabelText("Hyperframes agent")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate video" }));

    await waitFor(() =>
      expect(client.createJob).toHaveBeenCalledWith(expect.objectContaining({
        renderer: "playwright",
      })),
    );
    expect(client.createJob).toHaveBeenCalledWith(expect.not.objectContaining({ hyperframesAgent: expect.any(String) }));
    expect(await screen.findByRole("heading", { name: "Playwright demo ready" })).toBeInTheDocument();
  });

  it("disables generation until the planning agent produces a valid outline", async () => {
    const client = createLocalCompositionGenerationClient();
    const planningClient = createPlanningClient(planningSession({ outlineValid: false }));
    render(<CompositionDemoScreen client={client} planningClient={planningClient} />);

    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "https://driftboard.example.com" } });
    fireEvent.change(screen.getByLabelText("GitHub repo URL"), { target: { value: "https://github.com/acme/driftboard" } });
    fireEvent.click(screen.getByRole("button", { name: "Plan" }));

    expect(await screen.findByText("The agent has not produced a valid outline yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate video" })).toBeDisabled();
  });

  it("keeps the post-plan generation action outside the scrollable planning transcript", async () => {
    const client = createLocalCompositionGenerationClient();
    render(<CompositionDemoScreen client={client} planningClient={createPlanningClient()} />);

    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "https://driftboard.example.com" } });
    fireEvent.change(screen.getByLabelText("GitHub repo URL"), { target: { value: "https://github.com/acme/driftboard" } });
    fireEvent.click(screen.getByRole("button", { name: "Plan" }));

    const transcript = await screen.findByRole("log", { name: "Planning transcript" });
    const generateButton = await screen.findByRole("button", { name: "Generate video" });

    expect(transcript).not.toContainElement(generateButton);
  });

  it("shows an error when generation fails", async () => {
    const client = {
      createJob: async () => ({ id: "j" }),
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
      createJob: async () => ({ id: "j" }),
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

  it("keeps the cancel affordance visible and disables back navigation while generation is running", async () => {
    const client = {
      createJob: vi.fn(async () => ({ id: "j" })),
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
    expect(screen.getByRole("button", { name: "Generating..." })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Back to URLs" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Back to URLs" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("disables the top-level Back button while generation is running", async () => {
    const client = {
      createJob: vi.fn(async () => ({ id: "j" })),
      getJob: async () => ({ id: "j" }),
      waitForJob: (_id: string, opts?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    } as unknown as CompositionGenerationClient;
    const onBack = vi.fn();
    render(<CompositionDemoScreen client={client} planningClient={createPlanningClient()} onBack={onBack} />);
    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "https://driftboard.example.com" } });
    fireEvent.change(screen.getByLabelText("GitHub repo URL"), { target: { value: "https://github.com/x/y" } });
    fireEvent.click(screen.getByRole("button", { name: "Plan" }));
    await screen.findByText("I drafted a grounded outline.");
    fireEvent.click(screen.getByRole("button", { name: "Generate video" }));

    await screen.findByTestId("composition-generating");
    const topLevelBack = screen.getByRole("button", { name: "Back" });
    expect(topLevelBack).toBeDisabled();
    fireEvent.click(topLevelBack);
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("imports an existing demo folder and opens the editor", async () => {
    const importClient: CompositionImportClient = { importComposition: vi.fn(async () => completedCompositionJob()) };
    render(
      <CompositionDemoScreen
        client={createLocalCompositionGenerationClient()}
        planningClient={createPlanningClient()}
        importClient={importClient}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: fakeHandle() } })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit an existing demo" }));
    const input = screen.getByLabelText("Choose demo folder");
    fireEvent.change(input, {
      target: {
        files: [
          fileWithPath("index.html", "demo/hyperframes/index.html"),
          fileWithPath("output.mp4", "demo/hyperframes/output.mp4"),
        ],
      },
    });

    // The dropzone (in the preview/video stage) is replaced by the loaded editor once the import
    // resolves: the folder picker is gone and Export is now enabled against the imported video.
    await waitFor(() => expect(screen.queryByLabelText("Choose demo folder")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Export" })).toBeEnabled();
    expect(importClient.importComposition).toHaveBeenCalledTimes(1);
  });

  it("shows an error when the dropped folder has no index.html", async () => {
    const importClient: CompositionImportClient = { importComposition: vi.fn(async () => completedCompositionJob()) };
    render(
      <CompositionDemoScreen
        client={createLocalCompositionGenerationClient()}
        planningClient={createPlanningClient()}
        importClient={importClient}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit an existing demo" }));
    const input = screen.getByLabelText("Choose demo folder");
    fireEvent.change(input, { target: { files: [fileWithPath("output.mp4", "demo/output.mp4")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/index\.html/);
    expect(importClient.importComposition).not.toHaveBeenCalled();
  });
});
