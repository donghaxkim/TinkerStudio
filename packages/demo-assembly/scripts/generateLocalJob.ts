import type { CreateDemoRequest } from "@tinker/generation-contract";
import { LocalGenerationJobError, runLocalGenerationJob } from "../src/localGenerationJob.js";

const request: CreateDemoRequest = {
  id: "manual-fixture-local-job",
  durationCapSeconds: 12,
  aspectRatio: "16:9",
  mode: "manual-fixture",
  outputDirectory: "generated/local-job/manual-fixture-local-job",
  prompt: "Show why Tinker can generate editable product demo videos.",
};

try {
  const result = await runLocalGenerationJob(request, {
    onProgress: (event) => {
      console.log(JSON.stringify(event));
    },
  });

  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (error instanceof LocalGenerationJobError) {
    console.error(JSON.stringify(error.generationError, null, 2));
  } else {
    console.error(error);
  }

  process.exitCode = 1;
}
