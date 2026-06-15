import type { GenerationClient } from "./generationClient.js";
import { createApiGenerationClient } from "./apiGenerationClient.js";
import { createMockGenerationClient } from "./mockGenerationClient.js";

type GenerationClientEnv = {
  MODE?: string;
  VITE_TINKER_GENERATION_CLIENT?: string;
};

export function createGenerationClientForEnv(env: GenerationClientEnv = import.meta.env): GenerationClient {
  if (env.MODE === "test" || env.VITE_TINKER_GENERATION_CLIENT === "mock") {
    return createMockGenerationClient();
  }

  return createApiGenerationClient();
}
