import { describe, expect, it } from "vitest";
import { createApiGenerationClient } from "./apiGenerationClient.js";
import { createGenerationClientForEnv } from "./generationClientFactory.js";

describe("createGenerationClientForEnv", () => {
  it("uses the API client by default outside tests", () => {
    const client = createGenerationClientForEnv({ MODE: "development" });

    expect(client).toHaveProperty("kind", "api");
  });

  it("keeps the mock client available for tests and explicit local fixture mode", () => {
    expect(createGenerationClientForEnv({ MODE: "test" })).toHaveProperty("kind", "mock");
    expect(createGenerationClientForEnv({ MODE: "development", VITE_TINKER_GENERATION_CLIENT: "mock" })).toHaveProperty(
      "kind",
      "mock",
    );
  });

  it("matches the API client contract", () => {
    expect(createApiGenerationClient()).toHaveProperty("kind", "api");
  });
});
