import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompositionPlanningClient, CompositionPlanningSession } from "./compositionPlanningClient.js";
import { useCompositionPlanningSession } from "./useCompositionPlanningSession.js";

const POLL_MS = 700;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function readySession(): CompositionPlanningSession {
  return {
    id: "plan-1",
    repoUrl: "https://github.com/acme/driftboard",
    agent: "claude",
    status: "ready",
    messages: [{ role: "assistant", content: "Outline ready." }],
    progress: [],
    outline: {
      title: "Driftboard launch demo",
      durationCapSeconds: 60,
      aspectRatio: "16:9",
      summary: "A grounded launch demo.",
      scenes: [{ id: "scene-1", goal: "Open on the problem", visual: "Homepage hero.", evidence: ["website"] }],
      generationNotes: [],
    },
    outlineValid: true,
  };
}

describe("useCompositionPlanningSession", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("streams polled progress while the create request is in flight, then settles with the result", async () => {
    const create = deferred<CompositionPlanningSession>();
    const running: CompositionPlanningSession = {
      id: "plan-1",
      repoUrl: "https://github.com/acme/driftboard",
      agent: "claude",
      status: "running",
      messages: [],
      progress: [
        { stage: "preparing", status: "done" },
        { stage: "analyzing-repo", status: "active" },
      ],
      outlineValid: false,
    };
    const client: CompositionPlanningClient = {
      createSession: vi.fn(() => create.promise),
      sendMessage: vi.fn(),
      getSession: vi.fn(async () => running),
    };

    const { result } = renderHook(() => useCompositionPlanningSession(client));
    act(() => result.current.start({ repoUrl: "https://github.com/acme/driftboard", agent: "claude" }));

    expect(result.current.busy).toBe(true);
    const sentRequest = (client.createSession as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sentRequest.id).toMatch(/^[0-9a-f-]{36}$/i);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(result.current.session?.status).toBe("running");
    expect(result.current.session?.progress).toHaveLength(2);
    expect(result.current.busy).toBe(true);

    await act(async () => {
      create.resolve(readySession());
      await Promise.resolve();
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.session?.status).toBe("ready");
    expect(result.current.session?.outlineValid).toBe(true);
  });

  it("optimistically shows the user message on follow-up, then applies the response", async () => {
    const send = deferred<CompositionPlanningSession>();
    const client: CompositionPlanningClient = {
      createSession: vi.fn(async () => readySession()),
      sendMessage: vi.fn(() => send.promise),
      getSession: vi.fn(async () => readySession()),
    };

    const { result } = renderHook(() => useCompositionPlanningSession(client));
    await act(async () => {
      result.current.start({ repoUrl: "https://github.com/acme/driftboard", agent: "claude" });
      await Promise.resolve();
    });
    expect(result.current.session?.status).toBe("ready");

    act(() => result.current.sendMessage("Make the hook punchier."));
    expect(result.current.busy).toBe(true);
    expect(result.current.session?.messages.at(-1)).toEqual({ role: "user", content: "Make the hook punchier." });
    expect(client.sendMessage).toHaveBeenCalledWith("plan-1", "Make the hook punchier.");

    const updated: CompositionPlanningSession = {
      ...readySession(),
      messages: [
        { role: "assistant", content: "Outline ready." },
        { role: "user", content: "Make the hook punchier." },
        { role: "assistant", content: "Tightened the hook." },
      ],
    };
    await act(async () => {
      send.resolve(updated);
      await Promise.resolve();
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.session?.messages.at(-1)).toEqual({ role: "assistant", content: "Tightened the hook." });
  });
});
