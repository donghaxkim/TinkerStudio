import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockCompositionPlanningClient } from "./mockCompositionPlanningClient.js";

describe("createMockCompositionPlanningClient", () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => vi.useRealTimers());

  it("returns the active request while a mock session is still thinking", async () => {
    const client = createMockCompositionPlanningClient();
    const creating = client.createSession({
      id: "custom-session",
      repoUrl: "https://github.com/custom/product",
      productUrl: "https://custom.example.com",
      agent: "claude",
    });

    await vi.advanceTimersByTimeAsync(900);

    await expect(client.getSession("custom-session")).resolves.toMatchObject({
      id: "custom-session",
      repoUrl: "https://github.com/custom/product",
      productUrl: "https://custom.example.com",
      agent: "claude",
      status: "running",
    });

    await vi.advanceTimersByTimeAsync(6500);
    await creating;
  });
});
