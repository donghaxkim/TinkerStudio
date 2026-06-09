import assert from "node:assert/strict";
import {
  CreateDemoRequestSchema,
  GenerationErrorSchema,
  GenerationJobSchema,
  GenerationProgressEventSchema,
  GenerationResultSchema,
} from "./index.js";

const validRequest = CreateDemoRequestSchema.parse({
  id: "manual-fixture-job",
  durationCapSeconds: 12,
  aspectRatio: "16:9",
  mode: "manual-fixture",
  productUrl: "https://example.com/product",
  repoUrl: "https://github.com/example/product",
  prompt: "Show the export flow.",
  outputDirectory: "generated/local-job/manual-fixture-job",
});

assert.equal(validRequest.id, "manual-fixture-job");
assert.equal(validRequest.durationCapSeconds, 12);
assert.equal(validRequest.aspectRatio, "16:9");
assert.equal(validRequest.mode, "manual-fixture");

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
    mode: "manual-fixture",
    outputDirectory: "bad\0path",
  }).success,
  false,
);

const job = GenerationJobSchema.parse({
  id: "manual-fixture-job",
  request: validRequest,
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

const failure = GenerationErrorSchema.parse({
  jobId: "manual-fixture-job",
  status: "failed",
  stage: "capture",
  message: "Capture failed",
});

assert.equal(failure.stage, "capture");

console.log("generation contract tests passed");
