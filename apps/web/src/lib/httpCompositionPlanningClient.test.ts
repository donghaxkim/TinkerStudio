import { describe, expect, it, vi } from "vitest";
import { createHttpCompositionPlanningClient } from "./httpCompositionPlanningClient.js";

const responseBody = {
  id: "plan-test",
  productUrl: "https://product.example.com",
  repoUrl: "https://github.com/example/product",
  agent: "claude",
  status: "ready",
  messages: [{ role: "assistant", content: "Drafted." }],
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

describe("createHttpCompositionPlanningClient", () => {
  it("creates planning sessions", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(responseBody), { status: 201, headers: { "content-type": "application/json" } }));
    const client = createHttpCompositionPlanningClient({ baseUrl: "http://api.test", fetchFn });

    await expect(client.createSession({ productUrl: "https://product.example.com", repoUrl: "https://github.com/example/product", agent: "claude" })).resolves.toEqual(responseBody);
    expect(fetchFn).toHaveBeenCalledWith("http://api.test/api/planning-sessions", expect.objectContaining({ method: "POST" }));
  });

  it("continues planning sessions", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(responseBody), { status: 200, headers: { "content-type": "application/json" } }));
    const client = createHttpCompositionPlanningClient({ fetchFn });

    await expect(client.sendMessage("plan-test", "Make it faster.")).resolves.toEqual(responseBody);
    expect(fetchFn).toHaveBeenCalledWith("/api/planning-sessions/plan-test/messages", expect.objectContaining({ method: "POST" }));
  });
});
