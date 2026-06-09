import type { CreateDemoRequest } from "@tinker/generation-contract";
import { LocalGenerationJobError, runLocalGenerationJob } from "../src/localGenerationJob.js";

function readArg(name: string) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

const productUrl = readArg("--url");

if (!productUrl) {
  console.error("--url is required");
  process.exitCode = 1;
} else {
  const id = readArg("--id") ?? "ai-url-local-job";
  const prompt = readArg("--prompt") ?? "Make a short demo of the main value prop.";
  const durationCapSeconds = Number(readArg("--duration") ?? "12");
  const aspectRatio = (readArg("--aspect-ratio") ?? "16:9") as CreateDemoRequest["aspectRatio"];

  const request: CreateDemoRequest = {
    id,
    durationCapSeconds,
    aspectRatio,
    mode: "ai-url-planning",
    productUrl,
    outputDirectory: `generated/local-job/${id}`,
    prompt,
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
}
