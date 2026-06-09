import assert from "node:assert/strict";
import {
  CreateDemoRequestSchema,
  GenerationErrorSchema,
  GenerationJobSchema,
  GenerationProgressEventSchema,
  GenerationResultSchema,
} from "./index.js";

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

assert.equal(validManualRequest.id, "manual-fixture-job");
assert.equal(validManualRequest.durationCapSeconds, 12);
assert.equal(validManualRequest.aspectRatio, "16:9");
assert.equal(validManualRequest.mode, "manual-fixture");

const validAiUrlRequest = CreateDemoRequestSchema.parse({
  id: "ai-url-job",
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  mode: "ai-url-planning",
  productUrl: "http://127.0.0.1:3000/",
  prompt: "Make a short demo of the main value prop.",
  outputDirectory: "generated/local-job/ai-url-job",
});

assert.equal(validAiUrlRequest.mode, "ai-url-planning");
assert.equal(validAiUrlRequest.productUrl, "http://127.0.0.1:3000/");

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
    prompt: "Malformed URL should fail.",
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

assert.equal(progress.status, "capturing");

const result = GenerationResultSchema.parse({
  jobId: "manual-fixture-job",
  status: "completed",
  projectPath: "generated/local-job/manual-fixture-job/demo-project.json",
  outputDirectory: "generated/local-job/manual-fixture-job",
  artifactPaths: ["generated/local-job/manual-fixture-job/capture-result.json"],
});

assert.equal(result.status, "completed");

for (const stage of ["validation", "analysis", "planning", "verification", "capture", "assembly", "unknown"] as const) {
  const failure = GenerationErrorSchema.parse({
    jobId: "manual-fixture-job",
    status: "failed",
    stage,
    message: `${stage} failed`,
  });

  assert.equal(failure.stage, stage);
}

console.log("generation contract tests passed");
