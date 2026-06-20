import { createServer } from "node:http";
import type { CreateDemoRequest } from "@tinker/generation-contract";
import type { RepoAnalysis } from "@tinker/product-analysis";
import { createFixtureAiUrlPlanner, runAiUrlDemo } from "../src/index.js";
import { LocalGenerationJobError, runLocalGenerationJob } from "../src/localGenerationJob.js";

const fixtureHtml = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Tinker Fixture</title></head>
  <body>
    <main>
      <h1>Tinker Fixture</h1>
      <p>Local fixture page for deterministic AI URL generation.</p>
      <input aria-label="URL" data-testid="url" value="https://example.com" />
      <button>Start</button>
    </main>
  </body>
</html>`;

async function startFixtureServer() {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(fixtureHtml);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Fixture server did not bind to a TCP port");
  }

  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

const server = await startFixtureServer();

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
