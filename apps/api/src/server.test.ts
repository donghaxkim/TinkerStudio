import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, test, vi } from "vitest";
import goldenProjectInput from "../../../packages/project-schema/fixtures/person-a-generated-project.sample.json" with { type: "json" };
import { DemoProjectSchema } from "@tinker/project-schema";
import type { AiUrlPlanningCreateDemoRequest, GenerationError, ManualFixtureGenerationResult, ManualFixtureProgressEvent } from "@tinker/generation-contract";
import { readConfig } from "./config.js";
import { indexArtifacts } from "./jobs/artifactIndex.js";
import { createJobQueue } from "./jobs/jobQueue.js";
import { createJobStore } from "./jobs/jobStore.js";
import { resolveProductUrlFromGithubRepo } from "./routes/jobs.js";
import { buildServer } from "./server.js";
import { createGenerationWorker, type GenerationRunner } from "./workers/generationWorker.js";

const request: AiUrlPlanningCreateDemoRequest = {
  id: "job-test",
  mode: "ai-url-planning",
  repoUrl: "https://github.com/example/product",
  productUrl: "https://example.com",
  prompt: "Make a short demo.",
  durationCapSeconds: 12,
  aspectRatio: "16:9",
};

const runningEvent: ManualFixtureProgressEvent = {
  jobId: "job-test",
  status: "running",
  message: "AI URL analysis started",
  time: "2026-06-11T00:00:01.000Z",
};

const goldenProject = DemoProjectSchema.parse(goldenProjectInput);

async function writePlaywrightArtifacts(outputRoot: string) {
  const projectPath = join(outputRoot, "playwright", "demo-project.json");
  const captureResultPath = join(outputRoot, "playwright", "capture-result.json");
  const finalVideoPath = join(outputRoot, "playwright", "final.mp4");
  await mkdir(join(outputRoot, "playwright"), { recursive: true });
  await writeFile(projectPath, `${JSON.stringify(goldenProject, null, 2)}\n`);
  await writeFile(captureResultPath, "{}");
  await writeFile(finalVideoPath, "video");
  return { projectPath, captureResultPath, finalVideoPath, artifactPaths: [projectPath, captureResultPath, finalVideoPath] };
}

function playwrightManualResult(
  jobId: string,
  outputRoot: string,
  paths: Awaited<ReturnType<typeof writePlaywrightArtifacts>>,
): ManualFixtureGenerationResult {
  return {
    jobId,
    status: "completed",
    projectPath: paths.projectPath,
    captureResultPath: paths.captureResultPath,
    outputDirectory: outputRoot,
    artifactPaths: paths.artifactPaths,
    renderer: "playwright",
    rendererResults: {
      playwright: {
        projectPath: paths.projectPath,
        captureResultPath: paths.captureResultPath,
      },
    },
  };
}

function playwrightApiResult() {
  return {
    method: "playwright" as const,
    project: goldenProject,
    artifacts: [
      {
        kind: "playwright-demo-project" as const,
        relativePath: "playwright/demo-project.json",
        url: "/api/jobs/job-test/artifacts/playwright/demo-project.json",
        mediaType: "application/json; charset=utf-8",
      },
    ],
    warnings: [],
  };
}

function testConfig(repoRoot: string) {
  return {
    port: 4500,
    host: "127.0.0.1" as const,
    corsOrigins: ["http://localhost:5173"],
    repoRoot,
  };
}

describe("readConfig", () => {
  test("uses local development defaults", () => {
    expect(readConfig({})).toEqual({
      port: 4500,
      host: "127.0.0.1",
      corsOrigins: ["http://localhost:5173", "http://127.0.0.1:5173"],
      repoRoot: resolve(process.cwd(), "../.."),
    });
  });
});

describe("buildServer", () => {
  test("returns ok from the health endpoint", async () => {
    const server = await buildServer({ config: readConfig({}) });
    try {
      const response = await server.inject({ method: "GET", url: "/health" });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ ok: true });
    } finally {
      await server.close();
    }
  });

  test("returns a malformed JSON response for invalid JSON bodies", async () => {
    const server = await buildServer({ config: readConfig({}) });
    server.post("/echo", async (req) => req.body);
    try {
      const response = await server.inject({ method: "POST", url: "/echo", headers: { "content-type": "application/json" }, payload: "{" });
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({ message: "Malformed JSON body" });
    } finally {
      await server.close();
    }
  });

  test("preserves custom 422 errors", async () => {
    const server = await buildServer({ config: readConfig({}) });
    server.get("/custom-422", async () => {
      const error = new Error("Validation failed") as Error & { statusCode: number };
      error.statusCode = 422;
      throw error;
    });
    try {
      const response = await server.inject({ method: "GET", url: "/custom-422" });
      expect(response.statusCode).toBe(422);
      expect(JSON.parse(response.body)).toEqual({ message: "Validation failed" });
    } finally {
      await server.close();
    }
  });
});

describe("resolveProductUrlFromGithubRepo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the GitHub repository homepage metadata when present", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ homepage: "https://product.example.com" }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await expect(resolveProductUrlFromGithubRepo("https://github.com/example/product")).resolves.toBe("https://product.example.com");
  });

  it("falls back to package.json homepage from the GitHub contents API", async () => {
    const encodedPackageJson = Buffer.from(JSON.stringify({ homepage: "https://package-home.example.com" })).toString("base64");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ homepage: "" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ content: encodedPackageJson }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await expect(resolveProductUrlFromGithubRepo("https://github.com/example/product")).resolves.toBe("https://package-home.example.com");
  });
});

describe("job routes", () => {
  const validBody = {
    mode: "ai-url-planning",
    repoUrl: "https://github.com/example/product",
    productUrl: "https://example.com",
    prompt: "Make a short demo.",
    durationCapSeconds: 12,
    aspectRatio: "16:9",
  } as const;

  it("rejects removed renderer and HyperFrames agent fields", async () => {
    const server = await buildServer({ config: testConfig(await mkdtemp(join(tmpdir(), `tinker-api-routes-${randomUUID()}-`))) });
    try {
      for (const payload of [
        { ...validBody, renderer: "hyperframes" },
        { ...validBody, renderer: "both" },
        { ...validBody, renderer: "playwright" },
        { ...validBody, hyperframesAgent: "opencode" },
      ]) {
        const response = await server.inject({ method: "POST", url: "/api/jobs", payload });
        expect(response.statusCode).toBe(422);
      }
    } finally {
      await server.close();
    }
  });

  it("does not restore completed HyperFrames folders from disk", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-api-routes-no-restore-${randomUUID()}-`));
    await mkdir(join(repoRoot, "generated", "local-job", "old-job", "hyperframes"), { recursive: true });
    await writeFile(join(repoRoot, "generated", "local-job", "old-job", "hyperframes", "generation-manifest.json"), JSON.stringify({ renderer: "hyperframes" }));
    const server = await buildServer({ config: testConfig(repoRoot) });
    try {
      const response = await server.inject({ method: "GET", url: "/api/jobs/old-job" });
      expect(response.statusCode).toBe(404);
    } finally {
      await server.close();
    }
  });

  it("no longer exposes HyperFrames import, edit, or revision render routes", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-api-routes-deleted-${randomUUID()}-`));
    const server = await buildServer({ config: testConfig(repoRoot) });
    try {
      expect((await server.inject({ method: "POST", url: "/api/jobs/import" })).statusCode).toBe(404);
      expect((await server.inject({ method: "POST", url: "/api/jobs/missing/edits", payload: { instruction: "x", context: [] } })).statusCode).toBe(404);
      expect((await server.inject({ method: "POST", url: "/api/jobs/missing/revisions/rev-1/render" })).statusCode).toBe(404);
    } finally {
      await server.close();
    }
  });

  it("accepts Playwright-compatible jobs, injects the server id, and exposes completed snapshots", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-api-routes-${randomUUID()}-`));
    const outputRoot = join(repoRoot, "generated", "local-job", "job-test");
    const completed = deferred<void>();
    const server = await buildServer({
      config: testConfig(repoRoot),
      idGenerator: () => "job-test",
      runner: async (rawRequest, options): Promise<ManualFixtureGenerationResult> => {
        expect(rawRequest).toEqual({ ...validBody, id: "job-test" });
        expect(rawRequest).not.toMatchObject({ id: "client-id" });
        options?.onProgress?.(runningEvent);
        const playwright = await writePlaywrightArtifacts(outputRoot);
        completed.resolve();
        return playwrightManualResult("job-test", outputRoot, playwright);
      },
      now: () => "2026-06-11T00:00:00.000Z",
    });
    try {
      const postResponse = await server.inject({ method: "POST", url: "/api/jobs", payload: { ...validBody, id: "client-id" } });
      expect(postResponse.statusCode).toBe(202);
      expect(JSON.parse(postResponse.body)).toMatchObject({ id: "job-test", status: "queued", request: { id: "job-test" } });
      await completed.promise;
      await waitForJobStatus(server, "job-test", "completed");

      const getResponse = await server.inject({ method: "GET", url: "/api/jobs/job-test" });
      expect(getResponse.statusCode).toBe(200);
      expect(JSON.parse(getResponse.body)).toMatchObject({
        id: "job-test",
        status: "completed",
        request: { id: "job-test" },
        result: {
          method: "playwright",
          artifacts: [
            { kind: "playwright-demo-project", relativePath: "playwright/demo-project.json" },
            { kind: "playwright-capture-result", relativePath: "playwright/capture-result.json" },
            { kind: "playwright-video", relativePath: "playwright/final.mp4" },
          ],
        },
      });
    } finally {
      await server.close();
    }
  });

  it("derives productUrl from the repo when the create-job body omits it", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-api-routes-derived-url-${randomUUID()}-`));
    const outputRoot = join(repoRoot, "generated", "local-job", "job-test");
    const completed = deferred<void>();
    const server = await buildServer({
      config: testConfig(repoRoot),
      idGenerator: () => "job-test",
      productUrlResolver: async (repoUrl) => {
        expect(repoUrl).toBe("https://github.com/example/product");
        return "https://product.example.com";
      },
      runner: async (rawRequest): Promise<ManualFixtureGenerationResult> => {
        expect(rawRequest).toEqual({ ...validBody, id: "job-test", productUrl: "https://product.example.com" });
        const playwright = await writePlaywrightArtifacts(outputRoot);
        completed.resolve();
        return playwrightManualResult("job-test", outputRoot, playwright);
      },
      now: () => "2026-06-11T00:00:00.000Z",
    });
    try {
      const { productUrl: _productUrl, ...body } = validBody;
      const response = await server.inject({ method: "POST", url: "/api/jobs", payload: body });
      expect(response.statusCode).toBe(202);
      expect(JSON.parse(response.body)).toMatchObject({ request: { productUrl: "https://product.example.com" } });
      await completed.promise;
    } finally {
      await server.close();
    }
  });

  it("rejects repo-only create-job requests when no productUrl can be derived", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-api-routes-missing-derived-url-${randomUUID()}-`));
    let runnerCalled = false;
    const server = await buildServer({
      config: testConfig(repoRoot),
      productUrlResolver: async () => undefined,
      runner: async (): Promise<ManualFixtureGenerationResult> => {
        runnerCalled = true;
        throw new Error("runner should not be called");
      },
    });
    try {
      const { productUrl: _productUrl, ...body } = validBody;
      const response = await server.inject({ method: "POST", url: "/api/jobs", payload: body });
      expect(response.statusCode).toBe(422);
      expect(JSON.parse(response.body)).toMatchObject({ status: "failed", stage: "validation", message: expect.stringContaining("Could not derive a product URL") });
      expect(runnerCalled).toBe(false);
    } finally {
      await server.close();
    }
  });

  it("cancels a running generation job and aborts the runner", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-api-routes-cancel-${randomUUID()}-`));
    const runnerStarted = deferred<AbortSignal | undefined>();
    const runnerAborted = deferred<void>();
    const server = await buildServer({
      config: testConfig(repoRoot),
      idGenerator: () => "job-cancel",
      runner: async (_rawRequest, options): Promise<ManualFixtureGenerationResult> => {
        runnerStarted.resolve(options?.signal);
        options?.signal?.addEventListener("abort", () => runnerAborted.resolve(), { once: true });
        await runnerAborted.promise;
        throw new Error("runner should stop after cancellation");
      },
      now: () => "2026-06-11T00:00:00.000Z",
    });
    try {
      expect((await server.inject({ method: "POST", url: "/api/jobs", payload: validBody })).statusCode).toBe(202);
      await expect(runnerStarted.promise).resolves.toBeInstanceOf(AbortSignal);
      const cancelResponse = await server.inject({ method: "POST", url: "/api/jobs/job-cancel/cancel" });
      expect(cancelResponse.statusCode).toBe(200);
      expect(JSON.parse(cancelResponse.body)).toMatchObject({ id: "job-cancel", status: "failed", error: { stage: "cancelled", message: "Generation cancelled." } });
      await runnerAborted.promise;
    } finally {
      await server.close();
    }
  });

  it("cancels a queued generation job and frees queue capacity", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-api-routes-cancel-queued-${randomUUID()}-`));
    const firstRunnerRelease = deferred<void>();
    const ids = ["job-running", "job-queued", "job-replacement"];
    const started: string[] = [];
    const server = await buildServer({
      config: testConfig(repoRoot),
      idGenerator: () => ids.shift() ?? "job-extra",
      maxPendingJobs: 1,
      runner: async (rawRequest): Promise<ManualFixtureGenerationResult> => {
        const jobId = (rawRequest as { id: string }).id;
        started.push(jobId);
        if (jobId === "job-running") await firstRunnerRelease.promise;
        const outputRoot = join(repoRoot, "generated", "local-job", jobId);
        const playwright = await writePlaywrightArtifacts(outputRoot);
        return playwrightManualResult(jobId, outputRoot, playwright);
      },
    });
    try {
      expect((await server.inject({ method: "POST", url: "/api/jobs", payload: validBody })).statusCode).toBe(202);
      await Promise.resolve();
      expect((await server.inject({ method: "POST", url: "/api/jobs", payload: validBody })).statusCode).toBe(202);
      const cancelResponse = await server.inject({ method: "POST", url: "/api/jobs/job-queued/cancel" });
      expect(cancelResponse.statusCode).toBe(200);
      expect(JSON.parse(cancelResponse.body)).toMatchObject({ status: "failed", error: { stage: "cancelled" } });
      expect((await server.inject({ method: "POST", url: "/api/jobs", payload: validBody })).statusCode).toBe(202);
      firstRunnerRelease.resolve();
      await waitForJobStatus(server, "job-replacement", "completed");
      expect(started).toEqual(["job-running", "job-replacement"]);
    } finally {
      firstRunnerRelease.resolve();
      await server.close();
    }
  });

  it("rejects invalid job requests and caps pending queue capacity", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-api-routes-validation-${randomUUID()}-`));
    const validationServer = await buildServer({ config: testConfig(repoRoot) });
    try {
      for (const invalidBody of [
        { ...validBody, renderer: "canvas" },
        { ...validBody, outputDirectory: "generated/local-job/x" },
        { ...validBody, mode: "manual-fixture" },
        { repoUrl: validBody.repoUrl, productUrl: validBody.productUrl, prompt: "Assisted", durationCapSeconds: 12, aspectRatio: "16:9" },
      ]) {
        const response = await validationServer.inject({ method: "POST", url: "/api/jobs", payload: invalidBody });
        expect(response.statusCode).toBe(422);
      }
    } finally {
      await validationServer.close();
    }

    const blocker = deferred<void>();
    let idCount = 0;
    const capacityServer = await buildServer({
      config: testConfig(repoRoot),
      idGenerator: () => `job-${++idCount}`,
      maxPendingJobs: 1,
      runner: async (rawRequest) => {
        await blocker.promise;
        const jobId = (rawRequest as { id: string }).id;
        const outputRoot = join(repoRoot, "generated", "local-job", jobId);
        return playwrightManualResult(jobId, outputRoot, await writePlaywrightArtifacts(outputRoot));
      },
    });
    try {
      expect((await capacityServer.inject({ method: "POST", url: "/api/jobs", payload: validBody })).statusCode).toBe(202);
      expect((await capacityServer.inject({ method: "POST", url: "/api/jobs", payload: validBody })).statusCode).toBe(202);
      const third = await capacityServer.inject({ method: "POST", url: "/api/jobs", payload: validBody });
      expect(third.statusCode).toBe(429);
    } finally {
      blocker.resolve();
      await capacityServer.close();
    }
  });

  it("serves safe job artifacts and rejects traversal or encoded slash paths", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-api-artifact-route-${randomUUID()}-`));
    const outputRoot = join(repoRoot, "generated", "local-job", "job-test");
    const completed = deferred<void>();
    const server = await buildServer({
      config: testConfig(repoRoot),
      idGenerator: () => "job-test",
      runner: async (): Promise<ManualFixtureGenerationResult> => {
        const playwright = await writePlaywrightArtifacts(outputRoot);
        await mkdir(join(outputRoot, "playwright", "capture", "videos"), { recursive: true });
        const clipPath = join(outputRoot, "playwright", "capture", "videos", "clip.webm");
        await writeFile(clipPath, "webm");
        completed.resolve();
        return playwrightManualResult("job-test", outputRoot, { ...playwright, artifactPaths: [...playwright.artifactPaths, clipPath] });
      },
    });
    try {
      expect((await server.inject({ method: "POST", url: "/api/jobs", payload: validBody })).statusCode).toBe(202);
      await completed.promise;
      await waitForJobStatus(server, "job-test", "completed");

      const artifactResponse = await server.inject({ method: "GET", url: "/api/jobs/job-test/artifacts/playwright/demo-project.json" });
      expect(artifactResponse.statusCode).toBe(200);
      expect(artifactResponse.headers["x-content-type-options"]).toBe("nosniff");
      expect(artifactResponse.headers["content-type"]).toContain("application/json");

      const videoResponse = await server.inject({ method: "GET", url: "/api/jobs/job-test/artifacts/playwright/capture/videos/clip.webm" });
      expect(videoResponse.statusCode).toBe(200);
      expect(videoResponse.headers["content-type"]).toContain("video/webm");

      for (const unsafeUrl of [
        "/api/jobs/job-test/artifacts/../package.json",
        "/api/jobs/job-test/artifacts/%2e%2e/package.json",
        "/api/jobs/job-test/artifacts/playwright%2fdemo-project.json",
        "/api/jobs/missing/artifacts/playwright/demo-project.json",
      ]) {
        expect((await server.inject({ method: "GET", url: unsafeUrl })).statusCode).toBe(404);
      }
    } finally {
      await server.close();
    }
  });

  it("rejects symlinked artifacts that resolve outside the job output root", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-api-artifact-symlink-${randomUUID()}-`));
    const outputRoot = join(repoRoot, "generated", "local-job", "job-test");
    const outsidePath = join(repoRoot, "outside.txt");
    const symlinkPath = join(outputRoot, "playwright", "outside.txt");
    let symlinkUnsupported = false;
    const completed = deferred<void>();
    const server = await buildServer({
      config: testConfig(repoRoot),
      idGenerator: () => "job-test",
      runner: async (): Promise<ManualFixtureGenerationResult> => {
        const playwright = await writePlaywrightArtifacts(outputRoot);
        await writeFile(outsidePath, "outside output root");
        try {
          await symlink(outsidePath, symlinkPath);
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === "EACCES" || code === "EPERM" || code === "ENOSYS" || code === "ENOTSUP") symlinkUnsupported = true;
          else throw error;
        }
        completed.resolve();
        return playwrightManualResult("job-test", outputRoot, { ...playwright, artifactPaths: symlinkUnsupported ? playwright.artifactPaths : [...playwright.artifactPaths, symlinkPath] });
      },
    });
    try {
      expect((await server.inject({ method: "POST", url: "/api/jobs", payload: validBody })).statusCode).toBe(202);
      await completed.promise;
      await waitForJobStatus(server, "job-test", "completed");
      if (!symlinkUnsupported) {
        expect((await server.inject({ method: "GET", url: "/api/jobs/job-test/artifacts/playwright/outside.txt" })).statusCode).toBe(404);
      }
    } finally {
      await server.close();
    }
  });

  it("rejects unlisted, running, and failed job artifacts", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-api-artifact-unavailable-${randomUUID()}-`));
    const outputRoot = join(repoRoot, "generated", "local-job", "job-test");
    const completed = deferred<void>();
    const server = await buildServer({
      config: testConfig(repoRoot),
      idGenerator: () => "job-test",
      runner: async (): Promise<ManualFixtureGenerationResult> => {
        const playwright = await writePlaywrightArtifacts(outputRoot);
        await writeFile(join(outputRoot, "playwright", "secret.txt"), "not listed");
        completed.resolve();
        return playwrightManualResult("job-test", outputRoot, playwright);
      },
    });
    try {
      expect((await server.inject({ method: "POST", url: "/api/jobs", payload: validBody })).statusCode).toBe(202);
      await completed.promise;
      await waitForJobStatus(server, "job-test", "completed");
      expect((await server.inject({ method: "GET", url: "/api/jobs/job-test/artifacts/playwright/secret.txt" })).statusCode).toBe(404);
    } finally {
      await server.close();
    }
  });
});

describe("artifact indexing", () => {
  it("classifies Playwright artifacts and treats HyperFrames paths as other", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "tinker-api-artifacts-"));
    expect(indexArtifacts({ jobId: "j", outputRoot: "/root", artifactPaths: ["/root/hyperframes/index.html"] })[0]?.kind).toBe("other");
    expect(indexArtifacts({ jobId: "j", outputRoot: "/root", artifactPaths: ["/root/playwright/final.mp4"] })[0]?.kind).toBe("playwright-video");
    const artifacts = indexArtifacts({
      jobId: "job-test",
      outputRoot,
      artifactPaths: [
        join(outputRoot, "playwright", "demo-project.json"),
        join(outputRoot, "playwright", "storyboard.json"),
        join(outputRoot, "playwright", "capture-plan.json"),
        join(outputRoot, "playwright", "capture-result.json"),
        join(outputRoot, "playwright", "final.mp4"),
        join(outputRoot, "playwright", "capture", "videos", "clip.webm"),
        join(outputRoot, "playwright", "capture", "screenshots", "frame.png"),
        join(outputRoot, "playwright", "capture", "trace.zip"),
        join(outputRoot, "playwright", "notes.txt"),
      ],
    });
    expect(artifacts.map((artifact) => artifact.kind)).toEqual([
      "playwright-demo-project",
      "playwright-storyboard",
      "playwright-capture-plan",
      "playwright-capture-result",
      "playwright-video",
      "playwright-video",
      "playwright-screenshot",
      "playwright-trace",
      "other",
    ]);
  });
});

describe("job store", () => {
  it("creates snapshots, appends progress, and stores terminal result xor error", () => {
    const store = createJobStore();
    store.create({ id: "job-test", request, outputRoot: "/tmp/job-test", now: "2026-06-11T00:00:00.000Z" });
    store.appendProgress("job-test", runningEvent);
    store.complete("job-test", playwrightApiResult(), "2026-06-11T00:00:02.000Z");
    const completed = store.getSnapshot("job-test");
    expect(completed?.status).toBe("completed");
    expect(completed?.result?.method).toBe("playwright");
    expect(completed?.error).toBeUndefined();
  });

  it("stores failed jobs with typed generation errors", () => {
    const store = createJobStore();
    const error: GenerationError = { status: "failed", stage: "planning", message: "Planner failed" };
    store.create({ id: "job-test", request, outputRoot: "/tmp/job-test", now: "2026-06-11T00:00:00.000Z" });
    store.fail("job-test", error, "2026-06-11T00:00:02.000Z");
    expect(store.getSnapshot("job-test")).toMatchObject({ status: "failed", error });
  });
});

describe("job queue", () => {
  it("runs one job at a time in FIFO order and bounds pending jobs", async () => {
    const first = deferred<void>();
    const started: string[] = [];
    const queue = createJobQueue({
      maxPendingJobs: 1,
      runJob: async (id) => {
        started.push(id);
        if (id === "job-1") await first.promise;
      },
    });
    expect(queue.enqueue("job-1")).toBe(true);
    expect(queue.enqueue("job-2")).toBe(true);
    expect(queue.enqueue("job-3")).toBe(false);
    first.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual(["job-1", "job-2"]);
  });

  it("removes cancelled pending jobs so capacity is released", async () => {
    const first = deferred<void>();
    const started: string[] = [];
    const queue = createJobQueue({
      maxPendingJobs: 1,
      runJob: async (id) => {
        started.push(id);
        if (id === "job-1") await first.promise;
      },
    });
    expect(queue.enqueue("job-1")).toBe(true);
    expect(queue.enqueue("job-2")).toBe(true);
    expect(queue.cancel("job-2")).toBe(true);
    expect(queue.enqueue("job-3")).toBe(true);
    first.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual(["job-1", "job-3"]);
  });
});

describe("generation worker", () => {
  it("completes Playwright jobs with a parsed DemoProject", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "tinker-api-worker-playwright-"));
    const outputRoot = join(repoRoot, "generated", "local-job", "job-test");
    const store = createJobStore();
    store.create({ id: "job-test", request, outputRoot, now: "2026-06-11T00:00:00.000Z" });
    const runner: GenerationRunner = async (_rawRequest, options) => {
      options?.onProgress?.(runningEvent);
      return playwrightManualResult("job-test", outputRoot, await writePlaywrightArtifacts(outputRoot));
    };
    await createGenerationWorker({ store, runner, now: () => "2026-06-11T00:00:02.000Z" })("job-test");
    const completed = store.getSnapshot("job-test");
    expect(completed?.status).toBe("completed");
    expect(completed?.progressEvents.map((event) => event.message)).toEqual(["AI URL analysis started"]);
    expect(completed?.result?.method === "playwright" ? completed.result.project.id : undefined).toBe(goldenProject.id);
  });

  it("ignores progress events for a different job id", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "tinker-api-worker-progress-"));
    const store = createJobStore();
    store.create({ id: "job-test", request, outputRoot, now: "2026-06-11T00:00:00.000Z" });
    const runner: GenerationRunner = async (_rawRequest, options) => {
      options?.onProgress?.({ ...runningEvent, jobId: "other-job" });
      return playwrightManualResult("job-test", outputRoot, await writePlaywrightArtifacts(outputRoot));
    };
    await createGenerationWorker({ store, runner, now: () => "2026-06-11T00:00:02.000Z" })("job-test");
    expect(store.getSnapshot("job-test")?.progressEvents).toEqual([]);
  });

  it("fails unknown empty-message errors with a non-empty typed generation error", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "tinker-api-worker-error-"));
    const store = createJobStore();
    store.create({ id: "job-empty-error", request: { ...request, id: "job-empty-error" }, outputRoot, now: "2026-06-11T00:00:00.000Z" });
    await createGenerationWorker({ store, runner: async () => { throw new Error(""); }, now: () => "2026-06-11T00:00:02.000Z" })("job-empty-error");
    expect(store.getSnapshot("job-empty-error")?.error?.message.trim().length).toBeGreaterThan(0);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

async function waitForJobStatus(server: Awaited<ReturnType<typeof buildServer>>, id: string, status: "completed" | "failed") {
  for (let attempt = 0; attempt < 100; attempt++) {
    const response = await server.inject({ method: "GET", url: `/api/jobs/${id}` });
    const snapshot = JSON.parse(response.body) as { status?: string };
    if (snapshot.status === status) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Timed out waiting for ${id} to become ${status}`);
}
