import { startFixtureServer } from "@tinker/browser-capture";
import type { CreateDemoRequest } from "@tinker/generation-contract";
import type { RepoAnalysis } from "@tinker/product-analysis";
import { createFixtureAiUrlPlanner, runAiUrlDemo } from "../src/index.js";
import { LocalGenerationJobError, runLocalGenerationJob } from "../src/localGenerationJob.js";

const fixtureUrl = new URL("../../browser-capture/fixtures/manual-demo.html", import.meta.url);
const server = await startFixtureServer(fixtureUrl);

function createFixtureRepoAnalysis(repoUrl: string): RepoAnalysis {
  return {
    repoUrl,
    productName: "Tinker Fixture",
    summary: "Fixture repo analysis for deterministic local AI URL generation.",
    features: ["Local fixture page", "Deterministic capture plan"],
    likelyRoutes: ["/"],
    demoIdeas: ["Show the fixture landing page value prop"],
    importantTerms: ["fixture", "demo"],
    setupNotes: ["No external repository checkout required"],
    sourceHints: [],
  };
}

try {
  const request: CreateDemoRequest = {
    id: "ai-url-fixture-local-job",
    durationCapSeconds: 12,
    aspectRatio: "16:9",
    mode: "ai-url-planning",
    productUrl: server.url,
    repoUrl: "https://github.com/tinker/fixture",
    renderer: "playwright",
    outputDirectory: "generated/local-job/ai-url-fixture-local-job",
    prompt: "Make a short demo of the main value prop.",
  };

  const result = await runLocalGenerationJob(request, {
    onProgress: (event) => {
      console.log(JSON.stringify(event));
    },
    runAiUrlDemo: (input) =>
      runAiUrlDemo({
        ...input,
        analyzeRepo: async (repoUrl) => createFixtureRepoAnalysis(repoUrl),
        planner: createFixtureAiUrlPlanner(),
      }),
  });

  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (error instanceof LocalGenerationJobError) {
    console.error(JSON.stringify(error.generationError, null, 2));
  } else {
    console.error(error);
  }

  process.exitCode = 1;
} finally {
  await server.close();
}
