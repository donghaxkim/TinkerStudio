import assert from "node:assert/strict";
import {
  CreateDemoRequestSchema,
  GenerationErrorSchema,
  GenerationJobSchema,
  GenerationProgressEventSchema,
  GenerationResultSchema,
} from "./index.js";
import { parseCreateDemoRequest, safeParseCreateDemoRequest } from "./createDemoRequest.js";

const validManualRequest = CreateDemoRequestSchema.parse({
  id: "manual-fixture-job",
  durationCapSeconds: 12,
  aspectRatio: "16:9",
  mode: "manual-fixture",
  productUrl: "https://example.com/product",
  repoUrl: "https://github.com/example/product",
  prompt: "Show the export flow.",
  outputDirectory: "generated/local-job/manual-fixture-job",
});

assert.equal("id" in validManualRequest ? validManualRequest.id : undefined, "manual-fixture-job");
assert.equal(validManualRequest.durationCapSeconds, 12);
assert.equal(validManualRequest.aspectRatio, "16:9");
assert.equal("mode" in validManualRequest ? validManualRequest.mode : undefined, "manual-fixture");

const manualRequestWithNonGithubRepo = CreateDemoRequestSchema.parse({
  id: "manual-fixture-job-with-non-github-repo",
  durationCapSeconds: 12,
  aspectRatio: "16:9",
  mode: "manual-fixture",
  repoUrl: "https://gitlab.com/example/product",
});

assert.equal(
  "repoUrl" in manualRequestWithNonGithubRepo ? manualRequestWithNonGithubRepo.repoUrl : undefined,
  "https://gitlab.com/example/product",
);

const validAiUrlRequest = CreateDemoRequestSchema.parse({
  id: "ai-url-job",
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  mode: "ai-url-planning",
  productUrl: "http://127.0.0.1:3000/",
  repoUrl: "https://github.com/example/product",
  prompt: "Make a short demo of the main value prop.",
  outputDirectory: "generated/local-job/ai-url-job",
});

assert.equal("mode" in validAiUrlRequest ? validAiUrlRequest.mode : undefined, "ai-url-planning");
assert.equal(validAiUrlRequest.productUrl, "http://127.0.0.1:3000/");

const aiUrlBaseRequest = {
  mode: "ai-url-planning",
  productUrl: "https://example.com",
  repoUrl: "https://github.com/example/product",
  durationCapSeconds: 12,
  aspectRatio: "16:9",
} as const;

const parsedDefaultRendererRequest = parseCreateDemoRequest(aiUrlBaseRequest);
assert.equal("mode" in parsedDefaultRendererRequest ? parsedDefaultRendererRequest.mode : undefined, "ai-url-planning");
assert.equal("renderer" in parsedDefaultRendererRequest ? parsedDefaultRendererRequest.renderer : undefined, "hyperframes");

for (const renderer of ["hyperframes", "playwright", "both"] as const) {
  const parsed = parseCreateDemoRequest({ ...aiUrlBaseRequest, renderer });
  assert.equal("mode" in parsed ? parsed.mode : undefined, "ai-url-planning");
  assert.equal("renderer" in parsed ? parsed.renderer : undefined, renderer);
}

assert.equal(
  safeParseCreateDemoRequest({
    mode: "ai-url-planning",
    productUrl: "https://example.com",
    durationCapSeconds: 12,
    aspectRatio: "16:9",
  }).success,
  false,
);

assert.equal(safeParseCreateDemoRequest({ ...aiUrlBaseRequest, renderer: "remotion" }).success, false);

for (const repoUrl of ["https://github.com/example/product", "https://github.com/example/product.git"]) {
  const request = CreateDemoRequestSchema.parse({
    id: "ai-url-job-with-repo",
    durationCapSeconds: 10,
    aspectRatio: "16:9",
    mode: "ai-url-planning",
    productUrl: "http://127.0.0.1:3000/",
    repoUrl,
    prompt: "Make a repo-aware demo.",
  });

  assert.equal("mode" in request ? request.mode : undefined, "ai-url-planning");
  assert.equal("repoUrl" in request ? request.repoUrl : undefined, repoUrl);
}

for (const repoUrl of [
  "http://github.com/example/product",
  "https://github.example.com/example/product",
  "https://gitlab.com/example/product",
  "https://github.com/example/product/tree/main",
  "https://github.com/example/product/blob/main/README.md",
  "https://github.com/example/product/commit/abcdef123456",
  "https://github.com/example/product?tab=readme-ov-file",
  "https://github.com/example/product#readme",
  "https://github.com:444/example/product",
  "https://github.com//example/product",
  "https://github.com/example//product",
  "https://github.com/example/product//",
  "https://github.com/%20/product",
  "https://github.com/example/%20",
  "https://user:token@github.com/example/product",
  "file:///tmp/product",
  "../product",
]) {
  assert.equal(
    CreateDemoRequestSchema.safeParse({
      durationCapSeconds: 12,
      aspectRatio: "16:9",
      mode: "ai-url-planning",
      productUrl: "http://127.0.0.1:3000/",
      repoUrl,
      prompt: "Invalid repo URL should fail.",
    }).success,
    false,
    `Expected AI URL repoUrl to reject ${repoUrl}`,
  );
}

const validAssistedRequest = CreateDemoRequestSchema.parse({
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  productUrl: "https://example.com/product",
  repoUrl: "https://github.com/example/product",
  prompt: "Show the assisted flow.",
});

assert.equal("mode" in validAssistedRequest, false);
assert.equal(validAssistedRequest.prompt, "Show the assisted flow.");

assert.equal(
  CreateDemoRequestSchema.safeParse({
    durationCapSeconds: 0,
    aspectRatio: "16:9",
    mode: "manual-fixture",
  }).success,
  false,
);

assert.equal(
  CreateDemoRequestSchema.safeParse({
    durationCapSeconds: 12,
    aspectRatio: "4:3",
    mode: "manual-fixture",
  }).success,
  false,
);

assert.equal(
  CreateDemoRequestSchema.safeParse({
    durationCapSeconds: 12,
    aspectRatio: "16:9",
    mode: "ai-generated",
  }).success,
  false,
);

assert.equal(
  CreateDemoRequestSchema.safeParse({
    durationCapSeconds: 12,
    aspectRatio: "16:9",
    mode: "manual-fixture",
    productUrl: "not a url",
  }).success,
  false,
);

assert.equal(
  CreateDemoRequestSchema.safeParse({
    durationCapSeconds: 12,
    aspectRatio: "16:9",
    mode: "ai-url-planning",
    repoUrl: "https://github.com/example/product",
    prompt: "Missing URL should fail.",
  }).success,
  false,
);

assert.equal(
  CreateDemoRequestSchema.safeParse({
    durationCapSeconds: 12,
    aspectRatio: "16:9",
    mode: "ai-url-planning",
    productUrl: "not a url",
    repoUrl: "https://github.com/example/product",
    prompt: "Malformed URL should fail.",
  }).success,
  false,
);

for (const productUrl of ["file:///tmp/product.html", "data:text/html,<h1>Product</h1>"]) {
  assert.equal(
    CreateDemoRequestSchema.safeParse({
      durationCapSeconds: 12,
      aspectRatio: "16:9",
      mode: "ai-url-planning",
      productUrl,
      repoUrl: "https://github.com/example/product",
      prompt: "Non-public URL schemes should fail.",
    }).success,
    false,
  );
}

assert.equal(
  CreateDemoRequestSchema.safeParse({
    durationCapSeconds: 12,
    aspectRatio: "16:9",
    mode: "manual-fixture",
    repoUrl: "file:///tmp/repo",
  }).success,
  false,
);

assert.equal(
  CreateDemoRequestSchema.safeParse({
    durationCapSeconds: 12,
    aspectRatio: "16:9",
    mode: "manual-fixture",
    outputDirectory: "bad\0path",
  }).success,
  false,
);

const job = GenerationJobSchema.parse({
  id: "manual-fixture-job",
  request: validManualRequest,
  status: "queued",
  createdAt: "2026-06-09T00:00:00.000Z",
  updatedAt: "2026-06-09T00:00:00.000Z",
});

assert.equal(job.status, "queued");

const progress = GenerationProgressEventSchema.parse({
  jobId: "manual-fixture-job",
  status: "capturing",
  message: "Capturing manual fixture",
  time: "2026-06-09T00:00:01.000Z",
  artifactPath: "generated/local-job/manual-fixture-job/capture/video.webm",
});

assert.equal("status" in progress ? progress.status : undefined, "capturing");

const result = GenerationResultSchema.parse({
  jobId: "manual-fixture-job",
  status: "completed",
  projectPath: "generated/local-job/manual-fixture-job/demo-project.json",
  outputDirectory: "generated/local-job/manual-fixture-job",
  artifactPaths: ["generated/local-job/manual-fixture-job/capture-result.json"],
});

assert.equal("status" in result ? result.status : undefined, "completed");

const hyperframesRendererResult = {
  outputVideoPath: "generated/local-job/ai-url-job/hyperframes/output.mp4",
  generationManifestPath: "generated/local-job/ai-url-job/hyperframes/generation-manifest.json",
  assetManifestPath: "generated/local-job/ai-url-job/hyperframes/asset-manifest.json",
};
const playwrightRendererResult = {
  projectPath: "generated/local-job/ai-url-job/playwright/demo-project.json",
  captureResultPath: "generated/local-job/ai-url-job/playwright/capture-result.json",
};
const aiUrlGenerationResult = {
  jobId: "ai-url-job",
  status: "completed",
  projectPath: "generated/local-job/ai-url-job/hyperframes/output.mp4",
  captureResultPath: "generated/local-job/ai-url-job/hyperframes/generation-manifest.json",
  outputDirectory: "generated/local-job/ai-url-job",
  artifactPaths: ["generated/local-job/ai-url-job/hyperframes/output.mp4"],
};

assert.equal(
  GenerationResultSchema.safeParse({
    ...aiUrlGenerationResult,
    renderer: "both",
    rendererResults: { hyperframes: hyperframesRendererResult },
  }).success,
  false,
);
assert.equal(
  GenerationResultSchema.safeParse({
    ...aiUrlGenerationResult,
    renderer: "hyperframes",
    rendererResults: { playwright: playwrightRendererResult },
  }).success,
  false,
);
assert.equal(
  GenerationResultSchema.safeParse({
    ...aiUrlGenerationResult,
    renderer: "hyperframes",
    rendererResults: { hyperframes: { ...hyperframesRendererResult, extra: "not allowed" } },
  }).success,
  false,
);
assert.equal(
  GenerationResultSchema.safeParse({
    ...aiUrlGenerationResult,
    renderer: "both",
    rendererResults: { hyperframes: hyperframesRendererResult, playwright: playwrightRendererResult },
  }).success,
  true,
);

for (const stage of ["validation", "analysis", "planning", "verification", "capture", "assembly", "unknown"] as const) {
  const failure = GenerationErrorSchema.parse({
    jobId: "manual-fixture-job",
    status: "failed",
    stage,
    message: `${stage} failed`,
  });

  assert.equal("stage" in failure ? failure.stage : undefined, stage);
}

console.log("generation contract tests passed");
