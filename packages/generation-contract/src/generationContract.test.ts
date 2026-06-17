import assert from "node:assert/strict";
import {
  CreatePlanningSessionRequestSchema,
  CreateDemoRequestSchema,
  DemoOutlineSchema,
  GenerationErrorSchema,
  GenerationJobSchema,
  GenerationProgressEventSchema,
  GenerationResultSchema,
  PlanningSessionResponseSchema,
  parseDemoOutline,
  safeParseDemoOutline,
} from "./index.js";
import { parseCreateDemoRequest, safeParseCreateDemoRequest } from "./createDemoRequest.js";
import sampleProject from "../../project-schema/fixtures/demo-project.sample.json";

assert.equal(
  CreateDemoRequestSchema.safeParse({
    id: "manual-fixture-job",
    durationCapSeconds: 12,
    aspectRatio: "16:9",
    mode: "manual-fixture",
    productUrl: "https://example.com/product",
    repoUrl: "https://github.com/example/product",
    prompt: "Show the export flow.",
    outputDirectory: "generated/local-job/manual-fixture-job",
  }).success,
  false,
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
assert.equal("hyperframesAgent" in validAiUrlRequest ? validAiUrlRequest.hyperframesAgent : undefined, "opencode");

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
assert.equal("hyperframesAgent" in parsedDefaultRendererRequest ? parsedDefaultRendererRequest.hyperframesAgent : undefined, "opencode");

for (const renderer of ["hyperframes", "playwright", "both"] as const) {
  const parsed = parseCreateDemoRequest({ ...aiUrlBaseRequest, renderer });
  assert.equal("mode" in parsed ? parsed.mode : undefined, "ai-url-planning");
  assert.equal("renderer" in parsed ? parsed.renderer : undefined, renderer);
}

for (const hyperframesAgent of ["opencode", "claude"] as const) {
  const parsed = parseCreateDemoRequest({ ...aiUrlBaseRequest, hyperframesAgent });
  assert.equal("mode" in parsed ? parsed.mode : undefined, "ai-url-planning");
  assert.equal("hyperframesAgent" in parsed ? parsed.hyperframesAgent : undefined, hyperframesAgent);
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
assert.equal(safeParseCreateDemoRequest({ ...aiUrlBaseRequest, hyperframesAgent: "fable" }).success, false);

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

const validDemoOutline = {
  title: "Driftboard launch demo",
  durationCapSeconds: 60,
  aspectRatio: "16:9",
  summary: "Show how teams turn scattered work into a polished launch board.",
  scenes: [
    {
      id: "scene-1",
      goal: "Introduce the launch problem",
      visual: "Show the product homepage and hero promise.",
      narration: "Launch work gets scattered fast.",
      startHint: 0,
      endHint: 12,
      evidence: ["website"],
    },
    {
      id: "scene-2",
      goal: "Prove the repo-backed workflow",
      visual: "Reference real repo routes and components in a clean UI walkthrough.",
      evidence: ["repo", "website"],
    },
  ],
  generationNotes: ["Keep the pacing crisp and avoid invented dashboards."],
} as const;

assert.deepEqual(DemoOutlineSchema.parse(validDemoOutline), validDemoOutline);
assert.deepEqual(parseDemoOutline(validDemoOutline), validDemoOutline);
assert.equal(safeParseDemoOutline(validDemoOutline).success, true);

assert.equal(
  DemoOutlineSchema.safeParse({
    ...validDemoOutline,
    scenes: [],
  }).success,
  false,
);

assert.equal(
  DemoOutlineSchema.safeParse({
    ...validDemoOutline,
    scenes: [{ ...validDemoOutline.scenes[0], startHint: 20, endHint: 10 }],
  }).success,
  false,
);

assert.equal(
  DemoOutlineSchema.safeParse({
    ...validDemoOutline,
    scenes: [{ ...validDemoOutline.scenes[0], endHint: 61 }],
  }).success,
  false,
);

assert.equal(
  DemoOutlineSchema.parse({
    ...validDemoOutline,
    generationNotes: undefined,
  }).generationNotes.length,
  0,
);

const planningResponse = PlanningSessionResponseSchema.parse({
  id: "plan-test",
  productUrl: "https://example.com",
  repoUrl: "https://github.com/example/product",
  agent: "claude",
  status: "ready",
  messages: [{ role: "assistant", content: "I drafted an outline." }],
  outline: validDemoOutline,
  outlineValid: true,
});
assert.equal(planningResponse.outlineValid, true);

assert.equal(
  CreatePlanningSessionRequestSchema.safeParse({
    productUrl: "https://example.com",
    repoUrl: "https://github.com/example/product",
  }).success,
  true,
);

// Repo-first planning: the product URL is optional now.
assert.equal(
  CreatePlanningSessionRequestSchema.safeParse({
    repoUrl: "https://github.com/example/product",
  }).success,
  true,
);

// The optional client-supplied id must be a UUID so it is a safe path segment.
assert.equal(
  CreatePlanningSessionRequestSchema.safeParse({
    id: "123e4567-e89b-42d3-a456-426614174000",
    repoUrl: "https://github.com/example/product",
  }).success,
  true,
);
assert.equal(
  CreatePlanningSessionRequestSchema.safeParse({
    id: "../escape",
    repoUrl: "https://github.com/example/product",
  }).success,
  false,
);

// Progress defaults to an empty list and accepts streamed stage entries.
assert.deepEqual(planningResponse.progress, []);
const planningProgressResponse = PlanningSessionResponseSchema.parse({
  id: "plan-test",
  repoUrl: "https://github.com/example/product",
  agent: "claude",
  status: "running",
  messages: [],
  progress: [
    { stage: "preparing", status: "done" },
    { stage: "analyzing-repo", status: "active" },
  ],
  outlineValid: false,
});
assert.equal(planningProgressResponse.progress.length, 2);
assert.equal(planningProgressResponse.productUrl, undefined);

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
  "https://github.com/example_/product",
  "https://github.com/-example/product",
  "https://github.com/example/.",
  "https://github.com/example/..",
  "https://github.com/%20/product",
  "https://github.com/example/%20",
  "https://user:token@github.com/example/product",
  "file:///tmp/product",
  "../product",
]) {
  assert.equal(
    CreatePlanningSessionRequestSchema.safeParse({
      productUrl: "https://example.com",
      repoUrl,
    }).success,
    false,
    `Expected planning repoUrl to reject ${repoUrl}`,
  );
}

assert.equal(
  PlanningSessionResponseSchema.safeParse({
    id: "plan-test",
    productUrl: "https://example.com",
    repoUrl: "https://github.com/example_/product",
    agent: "claude",
    status: "ready",
    messages: [{ role: "assistant", content: "I drafted an outline." }],
    outline: validDemoOutline,
    outlineValid: true,
  }).success,
  false,
);

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
  id: "ai-url-job",
  request: validAiUrlRequest,
  status: "queued",
  createdAt: "2026-06-09T00:00:00.000Z",
  updatedAt: "2026-06-09T00:00:00.000Z",
});

assert.equal(job.status, "queued");

const progress = GenerationProgressEventSchema.parse({
  jobId: "ai-url-job",
  status: "capturing",
  message: "Capturing AI URL demo",
  time: "2026-06-09T00:00:01.000Z",
  artifactPath: "generated/local-job/ai-url-job/hyperframes/output.mp4",
});

assert.equal("status" in progress ? progress.status : undefined, "capturing");

const result = GenerationResultSchema.parse({
  jobId: "ai-url-job",
  status: "completed",
  projectPath: "generated/local-job/ai-url-job/hyperframes/output.mp4",
  outputDirectory: "generated/local-job/ai-url-job",
  artifactPaths: ["generated/local-job/ai-url-job/hyperframes/output.mp4"],
});

assert.equal("status" in result ? result.status : undefined, "completed");
assert.equal(
  GenerationResultSchema.safeParse({
    jobId: "ai-url-job",
    status: "completed",
    projectPath: "generated/local-job/ai-url-job/hyperframes/output.mp4",
    outputDirectory: "generated/local-job/ai-url-job",
    artifactPaths: ["generated/local-job/ai-url-job/hyperframes/output.mp4"],
    unexpected: "field",
  }).success,
  false,
);

assert.equal(
  GenerationResultSchema.safeParse({
    project: sampleProject,
    warnings: [],
    unexpected: "field",
  }).success,
  false,
);

assert.equal(
  GenerationResultSchema.safeParse({
    project: sampleProject,
    artifacts: {
      storyboardAssetId: "asset_storyboard_json",
      unexpected: "field",
    },
    warnings: [],
  }).success,
  false,
);

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
    rendererResults: { hyperframes: hyperframesRendererResult },
  }).success,
  false,
);
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
    rendererResults: { hyperframes: hyperframesRendererResult, playwright: playwrightRendererResult },
  }).success,
  false,
);
assert.equal(
  GenerationResultSchema.safeParse({
    ...aiUrlGenerationResult,
    renderer: "playwright",
    rendererResults: { hyperframes: hyperframesRendererResult, playwright: playwrightRendererResult },
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
    projectPath: "generated/local-job/ai-url-job/hyperframes/other.mp4",
    renderer: "hyperframes",
    rendererResults: { hyperframes: hyperframesRendererResult },
  }).success,
  false,
);
assert.equal(
  GenerationResultSchema.safeParse({
    ...aiUrlGenerationResult,
    captureResultPath: "generated/local-job/ai-url-job/hyperframes/other-manifest.json",
    renderer: "hyperframes",
    rendererResults: { hyperframes: hyperframesRendererResult },
  }).success,
  false,
);
assert.equal(
  GenerationResultSchema.safeParse({
    ...aiUrlGenerationResult,
    renderer: "playwright",
    rendererResults: { playwright: playwrightRendererResult },
  }).success,
  false,
);
assert.equal(
  GenerationResultSchema.safeParse({
    ...aiUrlGenerationResult,
    projectPath: playwrightRendererResult.projectPath,
    captureResultPath: "generated/local-job/ai-url-job/playwright/other-capture-result.json",
    renderer: "playwright",
    rendererResults: { playwright: playwrightRendererResult },
  }).success,
  false,
);
assert.equal(
  GenerationResultSchema.safeParse({
    ...aiUrlGenerationResult,
    projectPath: "generated/local-job/ai-url-job/playwright/demo-project.json",
    renderer: "both",
    rendererResults: { hyperframes: hyperframesRendererResult, playwright: playwrightRendererResult },
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
    jobId: "ai-url-job",
    status: "failed",
    stage,
    message: `${stage} failed`,
  });

  assert.equal("stage" in failure ? failure.stage : undefined, stage);
}

console.log("generation contract tests passed");
