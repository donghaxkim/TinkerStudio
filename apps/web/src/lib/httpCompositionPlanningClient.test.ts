import { describe, expect, it, vi } from "vitest";
import { createHttpCompositionPlanningClient } from "./httpCompositionPlanningClient.js";

const responseBody = {
  id: "plan-test",
  productUrl: "https://product.example.com",
  repoUrl: "https://github.com/example/product",
  agent: "claude",
  status: "ready",
  messages: [{ role: "assistant", content: "Drafted." }],
  progress: [],
  outline: {
    title: "Fixture demo",
    durationCapSeconds: 60,
    aspectRatio: "16:9",
    summary: "Summary.",
    scenes: [{ id: "scene-1", goal: "Goal", visual: "Visual", evidence: ["website"] }],
    generationNotes: [],
  },
  outlineValid: true,
} as const;

const requestBody = {
  productUrl: "https://product.example.com",
  repoUrl: "https://github.com/example/product",
  agent: "claude",
} as const;

describe("createHttpCompositionPlanningClient", () => {
  it("creates planning sessions", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(responseBody), { status: 201, headers: { "content-type": "application/json" } }));
    const client = createHttpCompositionPlanningClient({ baseUrl: "http://api.test", fetchFn });

    await expect(client.createSession(requestBody)).resolves.toEqual(responseBody);
    expect(fetchFn).toHaveBeenCalledWith("http://api.test/api/planning-sessions", expect.objectContaining({ method: "POST" }));
  });

  it("continues planning sessions", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(responseBody), { status: 200, headers: { "content-type": "application/json" } }));
    const client = createHttpCompositionPlanningClient({ fetchFn });

    await expect(client.sendMessage("plan-test", "Make it faster.")).resolves.toEqual(responseBody);
    expect(fetchFn).toHaveBeenCalledWith("/api/planning-sessions/plan-test/messages", expect.objectContaining({ method: "POST" }));
  });

  it("rejects malformed successful JSON responses", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ status: "ready" }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = createHttpCompositionPlanningClient({ fetchFn });

    await expect(client.createSession(requestBody)).rejects.toThrow("Malformed planning session response");
  });

  it("rejects non-JSON successful responses", async () => {
    const fetchFn = vi.fn(async () => new Response("not json", { status: 200, headers: { "content-type": "text/plain" } }));
    const client = createHttpCompositionPlanningClient({ fetchFn });

    await expect(client.createSession(requestBody)).rejects.toThrow("Server returned a non-JSON response");
  });

  it("prefers non-OK JSON message over lastError", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ message: "Use this", lastError: "Not this" }), { status: 400, headers: { "content-type": "application/json" } }));
    const client = createHttpCompositionPlanningClient({ fetchFn });

    await expect(client.createSession(requestBody)).rejects.toThrow("Use this");
  });

  it("uses non-OK JSON lastError when message is absent", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ lastError: "Planning failed" }), { status: 500, headers: { "content-type": "application/json" } }));
    const client = createHttpCompositionPlanningClient({ fetchFn });

    await expect(client.createSession(requestBody)).rejects.toThrow("Planning failed");
  });

  it("falls back to status for non-OK non-JSON responses", async () => {
    const fetchFn = vi.fn(async () => new Response("gateway", { status: 502, headers: { "content-type": "text/plain" } }));
    const client = createHttpCompositionPlanningClient({ fetchFn });

    await expect(client.createSession(requestBody)).rejects.toThrow("Request failed with status 502");
  });

  it("reads a planning session snapshot for progress polling", async () => {
    const runningSnapshot = {
      ...responseBody,
      status: "running",
      messages: [],
      progress: [
        { stage: "preparing", status: "done" },
        { stage: "analyzing-repo", status: "active" },
      ],
      outlineValid: false,
    };
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(runningSnapshot), { status: 200, headers: { "content-type": "application/json" } }));
    const client = createHttpCompositionPlanningClient({ baseUrl: "http://api.test", fetchFn });

    const session = await client.getSession("plan-test");
    expect(session.progress).toHaveLength(2);
    expect(fetchFn).toHaveBeenCalledWith("http://api.test/api/planning-sessions/plan-test");
  });

  it("URL-encodes session IDs when continuing planning sessions", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(responseBody), { status: 200, headers: { "content-type": "application/json" } }));
    const client = createHttpCompositionPlanningClient({ fetchFn });

    await client.sendMessage("plan/a b", "Make it faster.");

    expect(fetchFn).toHaveBeenCalledWith("/api/planning-sessions/plan%2Fa%20b/messages", expect.objectContaining({ method: "POST" }));
  });
});
