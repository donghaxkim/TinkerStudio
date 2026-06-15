import { randomUUID } from "node:crypto";
import { readFile, mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve } from "node:path";
import { describe, expect, it, test } from "vitest";
import goldenProjectInput from "../../../packages/project-schema/fixtures/person-a-generated-project.sample.json" with { type: "json" };
import { DemoProjectSchema } from "@tinker/project-schema";
import type {
  AiUrlPlanningCreateDemoRequest,
  GenerationError,
  ManualFixtureGenerationResult,
  ManualFixtureProgressEvent,
} from "@tinker/generation-contract";
import { readConfig } from "./config.js";
import { createComposeRunEdit } from "./edit/composeRunEdit.js";
import { indexArtifacts } from "./jobs/artifactIndex.js";
import { createJobQueue } from "./jobs/jobQueue.js";
import { createJobStore } from "./jobs/jobStore.js";
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
  renderer: "hyperframes",
};

const runningEvent: ManualFixtureProgressEvent = {
  jobId: "job-test",
  status: "running",
  message: "AI URL analysis started",
  time: "2026-06-11T00:00:01.000Z",
};

const goldenProject = DemoProjectSchema.parse(goldenProjectInput);

function hyperframesApiResult(artifacts = [
  {
    kind: "composition-index" as const,
    relativePath: "hyperframes/index.html",
    url: "/api/jobs/job-test/artifacts/hyperframes/index.html",
    mediaType: "text/html; charset=utf-8",
  },
  {
    kind: "output-video" as const,
    relativePath: "hyperframes/output.mp4",
    url: "/api/jobs/job-test/artifacts/hyperframes/output.mp4",
    mediaType: "video/mp4",
  },
]) {
  const indexArtifact = artifacts.find((artifact) => artifact.kind === "composition-index");
  const outputVideoArtifact = artifacts.find((artifact) => artifact.kind === "output-video");
  if (indexArtifact === undefined || outputVideoArtifact === undefined) {
    throw new Error("hyperframesApiResult requires composition-index and output-video artifacts");
  }
  return {
    method: "hyperframes" as const,
    composition: { indexArtifact, outputVideoArtifact },
    artifacts,
    warnings: [],
  };
}

function hyperframesRevisionResult(artifacts: ReturnType<typeof indexArtifacts>) {
  const indexArtifact = artifacts.find((artifact) => artifact.kind === "composition-index");
  const outputVideoArtifact = artifacts.find((artifact) => artifact.kind === "output-video");
  if (indexArtifact === undefined) {
    throw new Error("hyperframesRevisionResult requires a composition-index artifact");
  }
  return {
    method: "hyperframes" as const,
    composition: {
      indexArtifact,
      ...(outputVideoArtifact === undefined ? {} : { outputVideoArtifact }),
    },
    artifacts,
    warnings: [],
  };
}

async function writePlaywrightArtifacts(outputRoot: string) {
  const projectPath = join(outputRoot, "playwright", "demo-project.json");
  const captureResultPath = join(outputRoot, "playwright", "capture-result.json");
  await mkdir(join(outputRoot, "playwright"), { recursive: true });
  await writeFile(projectPath, `${JSON.stringify(goldenProject, null, 2)}\n`);
  await writeFile(captureResultPath, "{}");
  return {
    projectPath,
    captureResultPath,
    artifactPaths: [projectPath, captureResultPath],
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
    server.post("/echo", async (request) => request.body);

    try {
      const response = await server.inject({
        method: "POST",
        url: "/echo",
        headers: { "content-type": "application/json" },
        payload: "{",
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({ message: "Malformed JSON body" });
    } finally {
      await server.close();
    }
  });

  test("preserves custom 400 errors without labeling them as malformed JSON", async () => {
    const server = await buildServer({ config: readConfig({}) });
    server.get("/custom-400", async () => {
      const error = new Error("Custom bad request") as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    });

    try {
      const response = await server.inject({ method: "GET", url: "/custom-400" });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({ message: "Custom bad request" });
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

describe("job routes", () => {
  const validBody = {
    mode: "ai-url-planning",
    repoUrl: "https://github.com/example/product",
    productUrl: "https://example.com",
    prompt: "Make a short demo.",
    durationCapSeconds: 12,
    aspectRatio: "16:9",
  } as const;

  it("accepts explicit Hyperframes jobs, injects the server id, runs Hyperframes, and exposes completed snapshots", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-api-routes-${randomUUID()}-`));
    const outputRoot = join(repoRoot, "generated", "local-job", "job-test");
    const completed = deferred<void>();
    const server = await buildServer({
      config: testConfig(repoRoot),
      idGenerator: () => "job-test",
      runner: async (rawRequest, options): Promise<ManualFixtureGenerationResult> => {
        expect(rawRequest).toEqual({
          ...validBody,
          id: "job-test",
          renderer: "hyperframes",
        });
        expect(rawRequest).not.toMatchObject({ id: "client-id" });
        options?.onProgress?.(runningEvent);
        await mkdir(join(outputRoot, "hyperframes"), { recursive: true });
        await writeFile(join(outputRoot, "hyperframes", "index.html"), "<html>composition</html>");
        await writeFile(join(outputRoot, "hyperframes", "output.mp4"), "video");
        completed.resolve();
        return {
          jobId: "job-test",
          status: "completed",
          projectPath: join(outputRoot, "hyperframes", "output.mp4"),
          captureResultPath: join(outputRoot, "hyperframes", "generation-manifest.json"),
          outputDirectory: outputRoot,
          artifactPaths: [
            join(outputRoot, "hyperframes", "index.html"),
            join(outputRoot, "hyperframes", "output.mp4"),
          ],
          renderer: "hyperframes",
          rendererResults: {
            hyperframes: {
              outputVideoPath: join(outputRoot, "hyperframes", "output.mp4"),
              generationManifestPath: join(outputRoot, "hyperframes", "generation-manifest.json"),
              assetManifestPath: join(outputRoot, "hyperframes", "asset-manifest.json"),
            },
          },
        };
      },
      now: () => "2026-06-11T00:00:00.000Z",
    });

    try {
      const postResponse = await server.inject({
        method: "POST",
        url: "/api/jobs",
        payload: { ...validBody, id: "client-id", renderer: "hyperframes" },
      });

      expect(postResponse.statusCode).toBe(202);
      expect(JSON.parse(postResponse.body)).toMatchObject({
        id: "job-test",
        status: "queued",
        request: { id: "job-test", renderer: "hyperframes" },
      });

      await completed.promise;
      await Promise.resolve();

      const getResponse = await server.inject({ method: "GET", url: "/api/jobs/job-test" });

      expect(getResponse.statusCode).toBe(200);
      expect(JSON.parse(getResponse.body)).toMatchObject({
        id: "job-test",
        status: "completed",
        result: {
          artifacts: [
            { kind: "composition-index", relativePath: "hyperframes/index.html" },
            { kind: "output-video", relativePath: "hyperframes/output.mp4" },
          ],
        },
      });
    } finally {
      await server.close();
    }
  });

  it("ignores malformed client ids before validating job requests", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-api-routes-client-id-${randomUUID()}-`));
    const outputRoot = join(repoRoot, "generated", "local-job", "job-test");
    const completed = deferred<void>();
    const server = await buildServer({
      config: testConfig(repoRoot),
      idGenerator: () => "job-test",
      runner: async (rawRequest): Promise<ManualFixtureGenerationResult> => {
        expect(rawRequest).toMatchObject({ id: "job-test", mode: "ai-url-planning", renderer: "playwright" });
        const playwright = await writePlaywrightArtifacts(outputRoot);
        completed.resolve();
        return {
          jobId: "job-test",
          status: "completed",
          projectPath: playwright.projectPath,
          captureResultPath: playwright.captureResultPath,
          outputDirectory: outputRoot,
          artifactPaths: playwright.artifactPaths,
          renderer: "playwright",
          rendererResults: {
            playwright: {
              projectPath: playwright.projectPath,
              captureResultPath: playwright.captureResultPath,
            },
          },
        };
      },
      now: () => "2026-06-11T00:00:00.000Z",
    });

    try {
      const response = await server.inject({
        method: "POST",
        url: "/api/jobs",
        payload: { ...validBody, id: "" },
      });

      expect(response.statusCode).toBe(202);
      expect(JSON.parse(response.body)).toMatchObject({
        id: "job-test",
        status: "queued",
        request: { id: "job-test" },
      });
      await completed.promise;
    } finally {
      await server.close();
    }
  });

  it("rejects unknown extra fields on job requests", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-api-routes-unknown-field-${randomUUID()}-`));
    const server = await buildServer({ config: testConfig(repoRoot) });

    try {
      const response = await server.inject({
        method: "POST",
        url: "/api/jobs",
        payload: { ...validBody, chatEndpoint: "https://example.com/chat" },
      });

      expect(response.statusCode).toBe(422);
      expect(JSON.parse(response.body)).toMatchObject({ status: "failed", stage: "validation" });
    } finally {
      await server.close();
    }
  });

  it("defaults omitted renderer to Playwright and stores Playwright in the response snapshot", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-api-routes-default-renderer-${randomUUID()}-`));
    const outputRoot = join(repoRoot, "generated", "local-job", "job-test");
    const completed = deferred<void>();
    const server = await buildServer({
      config: testConfig(repoRoot),
      idGenerator: () => "job-test",
      runner: async (rawRequest): Promise<ManualFixtureGenerationResult> => {
        expect(rawRequest).toMatchObject({ id: "job-test", mode: "ai-url-planning", renderer: "playwright" });
        const playwright = await writePlaywrightArtifacts(outputRoot);
        completed.resolve();
        return {
          jobId: "job-test",
          status: "completed",
          projectPath: playwright.projectPath,
          captureResultPath: playwright.captureResultPath,
          outputDirectory: outputRoot,
          artifactPaths: playwright.artifactPaths,
          renderer: "playwright",
          rendererResults: {
            playwright: {
              projectPath: playwright.projectPath,
              captureResultPath: playwright.captureResultPath,
            },
          },
        };
      },
      now: () => "2026-06-11T00:00:00.000Z",
    });

    try {
      const response = await server.inject({ method: "POST", url: "/api/jobs", payload: validBody });

      expect(response.statusCode).toBe(202);
      expect(JSON.parse(response.body)).toMatchObject({
        id: "job-test",
        status: "queued",
        request: { id: "job-test", renderer: "playwright" },
      });
      await completed.promise;
    } finally {
      await server.close();
    }
  });

  it("accepts explicit Playwright jobs and rejects renderer both", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-api-routes-playwright-${randomUUID()}-`));
    const outputRoot = join(repoRoot, "generated", "local-job", "job-playwright");
    const server = await buildServer({
      config: testConfig(repoRoot),
      idGenerator: () => "job-playwright",
      runner: async (rawRequest): Promise<ManualFixtureGenerationResult> => {
        expect(rawRequest).toMatchObject({ id: "job-playwright", mode: "ai-url-planning", renderer: "playwright" });
        await mkdir(join(outputRoot, "playwright"), { recursive: true });
        await writeFile(join(outputRoot, "playwright", "demo-project.json"), `${JSON.stringify(goldenProject, null, 2)}\n`);
        await writeFile(join(outputRoot, "playwright", "capture-result.json"), "{}");
        return {
          jobId: "job-playwright",
          status: "completed",
          projectPath: join(outputRoot, "playwright", "demo-project.json"),
          captureResultPath: join(outputRoot, "playwright", "capture-result.json"),
          outputDirectory: outputRoot,
          artifactPaths: [
            join(outputRoot, "playwright", "demo-project.json"),
            join(outputRoot, "playwright", "capture-result.json"),
          ],
          renderer: "playwright",
          rendererResults: {
            playwright: {
              projectPath: join(outputRoot, "playwright", "demo-project.json"),
              captureResultPath: join(outputRoot, "playwright", "capture-result.json"),
            },
          },
        };
      },
      now: () => "2026-06-11T00:00:00.000Z",
    });

    try {
      const playwrightResponse = await server.inject({
        method: "POST",
        url: "/api/jobs",
        payload: { ...validBody, renderer: "playwright" },
      });

      expect(playwrightResponse.statusCode).toBe(202);
      expect(JSON.parse(playwrightResponse.body)).toMatchObject({
        id: "job-playwright",
        request: { id: "job-playwright", renderer: "playwright" },
      });

      const bothResponse = await server.inject({
        method: "POST",
        url: "/api/jobs",
        payload: { ...validBody, renderer: "both" },
      });
      expect(bothResponse.statusCode).toBe(422);
      expect(JSON.parse(bothResponse.body).message).toContain("renderer");
    } finally {
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
        {
          repoUrl: validBody.repoUrl,
          productUrl: validBody.productUrl,
          prompt: "Assisted",
          durationCapSeconds: 12,
          aspectRatio: "16:9",
        },
      ]) {
        const response = await validationServer.inject({ method: "POST", url: "/api/jobs", payload: invalidBody });

        expect(response.statusCode).toBe(422);
        expect(JSON.parse(response.body)).toMatchObject({ status: "failed", stage: "validation" });
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
      runner: async () => {
        await blocker.promise;
        const outputRoot = join(repoRoot, "generated", "local-job", "job-blocked");
        const playwright = await writePlaywrightArtifacts(outputRoot);
        return {
          jobId: "job-blocked",
          status: "completed",
          projectPath: playwright.projectPath,
          captureResultPath: playwright.captureResultPath,
          outputDirectory: outputRoot,
          artifactPaths: playwright.artifactPaths,
          renderer: "playwright",
          rendererResults: {
            playwright: {
              projectPath: playwright.projectPath,
              captureResultPath: playwright.captureResultPath,
            },
          },
        };
      },
    });

    try {
      const first = await capacityServer.inject({ method: "POST", url: "/api/jobs", payload: validBody });
      const second = await capacityServer.inject({ method: "POST", url: "/api/jobs", payload: validBody });
      const third = await capacityServer.inject({ method: "POST", url: "/api/jobs", payload: validBody });

      expect(first.statusCode).toBe(202);
      expect(second.statusCode).toBe(202);
      expect(third.statusCode).toBe(429);
      expect(JSON.parse(third.body)).toEqual({ message: "Generation queue is full" });
    } finally {
      blocker.resolve();
      await Promise.resolve();
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
        await mkdir(join(outputRoot, "hyperframes", "assets"), { recursive: true });
        await mkdir(join(outputRoot, "playwright", "capture", "videos"), { recursive: true });
        await writeFile(join(outputRoot, "hyperframes", "index.html"), "<html>composition</html>");
        await writeFile(join(outputRoot, "hyperframes", "output.mp4"), "video");
        await writeFile(join(outputRoot, "hyperframes", "assets", "logo.png"), "png");
        await writeFile(join(outputRoot, "hyperframes", "artifact.unknownext"), "unknown");
        await writeFile(join(outputRoot, "playwright", "capture", "videos", "clip.webm"), "webm");
        completed.resolve();
        return {
          jobId: "job-test",
          status: "completed",
          projectPath: join(outputRoot, "hyperframes", "output.mp4"),
          captureResultPath: join(outputRoot, "hyperframes", "generation-manifest.json"),
          outputDirectory: outputRoot,
          artifactPaths: [
            join(outputRoot, "hyperframes", "index.html"),
            join(outputRoot, "hyperframes", "output.mp4"),
            join(outputRoot, "hyperframes", "assets", "logo.png"),
            join(outputRoot, "hyperframes", "artifact.unknownext"),
            join(outputRoot, "playwright", "capture", "videos", "clip.webm"),
          ],
          renderer: "hyperframes",
          rendererResults: {
            hyperframes: {
              outputVideoPath: join(outputRoot, "hyperframes", "output.mp4"),
              generationManifestPath: join(outputRoot, "hyperframes", "generation-manifest.json"),
              assetManifestPath: join(outputRoot, "hyperframes", "asset-manifest.json"),
            },
          },
        };
      },
    });

    try {
      const postResponse = await server.inject({ method: "POST", url: "/api/jobs", payload: { ...validBody, renderer: "hyperframes" } });
      expect(postResponse.statusCode).toBe(202);
      await completed.promise;
      await Promise.resolve();

      const artifactResponse = await server.inject({
        method: "GET",
        url: "/api/jobs/job-test/artifacts/hyperframes/index.html",
      });

      expect(artifactResponse.statusCode).toBe(200);
      expect(artifactResponse.headers["x-content-type-options"]).toBe("nosniff");
      expect(artifactResponse.headers["content-type"]).toContain("text/html");
      expect(artifactResponse.body).toContain("composition");

      const unknownArtifactResponse = await server.inject({
        method: "GET",
        url: "/api/jobs/job-test/artifacts/hyperframes/artifact.unknownext",
      });

      expect(unknownArtifactResponse.statusCode).toBe(200);
      expect(unknownArtifactResponse.headers["x-content-type-options"]).toBe("nosniff");
      expect(unknownArtifactResponse.headers["content-type"]).toContain("application/octet-stream");

      const playwrightVideoResponse = await server.inject({
        method: "GET",
        url: "/api/jobs/job-test/artifacts/playwright/capture/videos/clip.webm",
      });

      expect(playwrightVideoResponse.statusCode).toBe(200);
      expect(playwrightVideoResponse.headers["x-content-type-options"]).toBe("nosniff");
      expect(playwrightVideoResponse.headers["content-type"]).toContain("video/webm");

      for (const unsafeUrl of [
        "/api/jobs/job-test/artifacts/../package.json",
        "/api/jobs/job-test/artifacts/%2e%2e/package.json",
        "/api/jobs/job-test/artifacts/hyperframes%2findex.html",
        "/api/jobs/missing/artifacts/hyperframes/index.html",
      ]) {
        const response = await server.inject({ method: "GET", url: unsafeUrl });
        expect(response.statusCode).toBe(404);
      }
    } finally {
      await server.close();
    }
  });

  it("rejects symlinked artifacts that resolve outside the job output root", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-api-artifact-symlink-${randomUUID()}-`));
    const outputRoot = join(repoRoot, "generated", "local-job", "job-test");
    const outsidePath = join(repoRoot, "outside.txt");
    const symlinkPath = join(outputRoot, "hyperframes", "outside.txt");
    const completed = deferred<void>();
    let symlinkUnsupported = false;
    const server = await buildServer({
      config: testConfig(repoRoot),
      idGenerator: () => "job-test",
      runner: async (): Promise<ManualFixtureGenerationResult> => {
        await mkdir(join(outputRoot, "hyperframes"), { recursive: true });
        await writeFile(join(outputRoot, "hyperframes", "index.html"), "<html>composition</html>");
        await writeFile(join(outputRoot, "hyperframes", "output.mp4"), "video");
        await writeFile(outsidePath, "outside output root");
        try {
          await symlink(outsidePath, symlinkPath);
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === "EACCES" || code === "EPERM" || code === "ENOSYS" || code === "ENOTSUP") {
            symlinkUnsupported = true;
          } else {
            throw error;
          }
        }
        completed.resolve();
        return {
          jobId: "job-test",
          status: "completed",
          projectPath: join(outputRoot, "hyperframes", "output.mp4"),
          captureResultPath: join(outputRoot, "hyperframes", "generation-manifest.json"),
          outputDirectory: outputRoot,
          artifactPaths: [
            join(outputRoot, "hyperframes", "index.html"),
            join(outputRoot, "hyperframes", "output.mp4"),
            ...(symlinkUnsupported ? [] : [symlinkPath]),
          ],
          renderer: "hyperframes",
          rendererResults: {
            hyperframes: {
              outputVideoPath: join(outputRoot, "hyperframes", "output.mp4"),
              generationManifestPath: join(outputRoot, "hyperframes", "generation-manifest.json"),
              assetManifestPath: join(outputRoot, "hyperframes", "asset-manifest.json"),
            },
          },
        };
      },
    });

    try {
      const postResponse = await server.inject({ method: "POST", url: "/api/jobs", payload: { ...validBody, renderer: "hyperframes" } });
      expect(postResponse.statusCode).toBe(202);
      await completed.promise;
      await Promise.resolve();

      if (symlinkUnsupported) {
        return;
      }

      const response = await server.inject({
        method: "GET",
        url: "/api/jobs/job-test/artifacts/hyperframes/outside.txt",
      });

      expect(response.statusCode).toBe(404);
    } finally {
      await server.close();
    }
  });

  it("rejects completed job files that were not recorded as artifacts", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-api-artifact-unlisted-${randomUUID()}-`));
    const outputRoot = join(repoRoot, "generated", "local-job", "job-test");
    const completed = deferred<void>();
    const server = await buildServer({
      config: testConfig(repoRoot),
      idGenerator: () => "job-test",
      runner: async (): Promise<ManualFixtureGenerationResult> => {
        await mkdir(join(outputRoot, "hyperframes"), { recursive: true });
        await writeFile(join(outputRoot, "hyperframes", "index.html"), "<html>composition</html>");
        await writeFile(join(outputRoot, "hyperframes", "output.mp4"), "video");
        await writeFile(join(outputRoot, "hyperframes", "secret.txt"), "not listed");
        completed.resolve();
        return {
          jobId: "job-test",
          status: "completed",
          projectPath: join(outputRoot, "hyperframes", "output.mp4"),
          captureResultPath: join(outputRoot, "hyperframes", "generation-manifest.json"),
          outputDirectory: outputRoot,
          artifactPaths: [join(outputRoot, "hyperframes", "index.html"), join(outputRoot, "hyperframes", "output.mp4")],
          renderer: "hyperframes",
          rendererResults: {
            hyperframes: {
              outputVideoPath: join(outputRoot, "hyperframes", "output.mp4"),
              generationManifestPath: join(outputRoot, "hyperframes", "generation-manifest.json"),
              assetManifestPath: join(outputRoot, "hyperframes", "asset-manifest.json"),
            },
          },
        };
      },
    });

    try {
      const postResponse = await server.inject({ method: "POST", url: "/api/jobs", payload: { ...validBody, renderer: "hyperframes" } });
      expect(postResponse.statusCode).toBe(202);
      await completed.promise;
      await waitForJobStatus(server, "job-test", "completed");

      const response = await server.inject({
        method: "GET",
        url: "/api/jobs/job-test/artifacts/hyperframes/secret.txt",
      });

      expect(response.statusCode).toBe(404);
    } finally {
      await server.close();
    }
  });

  it("rejects existing artifact files while a job is still running", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-api-artifact-running-${randomUUID()}-`));
    const outputRoot = join(repoRoot, "generated", "local-job", "job-test");
    const running = deferred<void>();
    const unblock = deferred<void>();
    const server = await buildServer({
      config: testConfig(repoRoot),
      idGenerator: () => "job-test",
      runner: async (_rawRequest, options): Promise<ManualFixtureGenerationResult> => {
        await mkdir(join(outputRoot, "hyperframes"), { recursive: true });
        await writeFile(join(outputRoot, "hyperframes", "index.html"), "<html>partial</html>");
        options?.onProgress?.(runningEvent);
        running.resolve();
        await unblock.promise;
        return {
          jobId: "job-test",
          status: "completed",
          projectPath: join(outputRoot, "hyperframes", "output.mp4"),
          captureResultPath: join(outputRoot, "hyperframes", "generation-manifest.json"),
          outputDirectory: outputRoot,
          artifactPaths: [join(outputRoot, "hyperframes", "index.html"), join(outputRoot, "hyperframes", "output.mp4")],
          renderer: "hyperframes",
          rendererResults: {
            hyperframes: {
              outputVideoPath: join(outputRoot, "hyperframes", "output.mp4"),
              generationManifestPath: join(outputRoot, "hyperframes", "generation-manifest.json"),
              assetManifestPath: join(outputRoot, "hyperframes", "asset-manifest.json"),
            },
          },
        };
      },
    });

    try {
      const postResponse = await server.inject({ method: "POST", url: "/api/jobs", payload: { ...validBody, renderer: "hyperframes" } });
      expect(postResponse.statusCode).toBe(202);
      await running.promise;

      const response = await server.inject({
        method: "GET",
        url: "/api/jobs/job-test/artifacts/hyperframes/index.html",
      });

      expect(response.statusCode).toBe(404);
    } finally {
      unblock.resolve();
      await server.close();
    }
  });

  it("rejects existing artifact files after a job fails", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), `tinker-api-artifact-failed-${randomUUID()}-`));
    const outputRoot = join(repoRoot, "generated", "local-job", "job-test");
    const wroteFile = deferred<void>();
    const server = await buildServer({
      config: testConfig(repoRoot),
      idGenerator: () => "job-test",
      runner: async () => {
        await mkdir(join(outputRoot, "hyperframes"), { recursive: true });
        await writeFile(join(outputRoot, "hyperframes", "index.html"), "<html>failed</html>");
        wroteFile.resolve();
        throw new Error("generation failed");
      },
    });

    try {
      const postResponse = await server.inject({ method: "POST", url: "/api/jobs", payload: validBody });
      expect(postResponse.statusCode).toBe(202);
      await wroteFile.promise;
      await waitForJobStatus(server, "job-test", "failed");

      const response = await server.inject({
        method: "GET",
        url: "/api/jobs/job-test/artifacts/hyperframes/index.html",
      });

      expect(response.statusCode).toBe(404);
    } finally {
      await server.close();
    }
  });

  it("POST /api/jobs/:id/edits enqueues an edit and appends a revision", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "tinker-api-edit-"));
    const outputRoot = join(repoRoot, "generated", "local-job", "id-1");
    const completed = deferred<void>();
    let idCount = 0;
    const runEdit = async () => hyperframesRevisionResult([{ kind: "composition-index" as const, relativePath: "revisions/rev/hyperframes/index.html", url: "/api/jobs/x/artifacts/revisions/rev/hyperframes/index.html", mediaType: "text/html" }]);
    const server = await buildServer({
      config: testConfig(repoRoot),
      idGenerator: () => `id-${++idCount}`,
      runEdit,
      runner: async (): Promise<ManualFixtureGenerationResult> => {
        await mkdir(join(outputRoot, "hyperframes"), { recursive: true });
        await writeFile(join(outputRoot, "hyperframes", "index.html"), "<html>composition</html>");
        await writeFile(join(outputRoot, "hyperframes", "output.mp4"), "video");
        completed.resolve();
        return {
          jobId: "id-1",
          status: "completed",
          projectPath: join(outputRoot, "hyperframes", "output.mp4"),
          captureResultPath: join(outputRoot, "hyperframes", "generation-manifest.json"),
          outputDirectory: outputRoot,
          artifactPaths: [join(outputRoot, "hyperframes", "index.html"), join(outputRoot, "hyperframes", "output.mp4")],
          renderer: "hyperframes",
          rendererResults: {
            hyperframes: {
              outputVideoPath: join(outputRoot, "hyperframes", "output.mp4"),
              generationManifestPath: join(outputRoot, "hyperframes", "generation-manifest.json"),
              assetManifestPath: join(outputRoot, "hyperframes", "asset-manifest.json"),
            },
          },
        };
      },
    });

    try {
      const created = await server.inject({ method: "POST", url: "/api/jobs", payload: { ...validBody, renderer: "hyperframes" } });
      expect(created.statusCode).toBe(202);
      const jobId = created.json().id as string;
      await completed.promise;
      await waitForJobStatus(server, jobId, "completed");

      const edit = await server.inject({ method: "POST", url: `/api/jobs/${jobId}/edits`, payload: { instruction: "punch in", context: [] } });
      expect(edit.statusCode).toBe(202);
      await waitForRevision(server, jobId);
      const got = await server.inject({ method: "GET", url: `/api/jobs/${jobId}` });
      expect(got.json().status).toBe("completed");
      expect(got.json().revisions?.[0]?.status).toBe("completed");
    } finally {
      await server.close();
    }
  });

  it("POST /edits → 404 for unknown job, 422 for bad body", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "tinker-api-edit-"));
    const server = await buildServer({ config: testConfig(repoRoot), runEdit: async () => hyperframesRevisionResult([{ kind: "composition-index" as const, relativePath: "revisions/rev/hyperframes/index.html", url: "/api/jobs/x/artifacts/revisions/rev/hyperframes/index.html", mediaType: "text/html" }]) });
    try {
      expect((await server.inject({ method: "POST", url: "/api/jobs/nope/edits", payload: { instruction: "x", context: [] } })).statusCode).toBe(404);
      const created = await server.inject({ method: "POST", url: "/api/jobs", payload: { mode: "ai-url-planning", repoUrl: "https://github.com/a/b", productUrl: "https://a.com", durationCapSeconds: 60, aspectRatio: "16:9" } });
      expect(created.statusCode).toBe(202);
      expect((await server.inject({ method: "POST", url: `/api/jobs/${created.json().id}/edits`, payload: { instruction: "", context: [] } })).statusCode).toBe(422);
    } finally {
      await server.close();
    }
  });

  it("serves a revision artifact when the parent job is completed", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "tinker-api-rev-"));
    const outputRoot = join(repoRoot, "generated", "local-job", "id-1");
    const completed = deferred<void>();
    let n = 0;
    const runEdit = createComposeRunEdit({
      runAgent: async () => "<<<<<<< SEARCH\nconst D=1.0;\n=======\nconst D=2.0;\n>>>>>>> REPLACE",
    });
    const server = await buildServer({
      config: testConfig(repoRoot),
      runEdit,
      idGenerator: () => `id-${++n}`,
      runner: async (): Promise<ManualFixtureGenerationResult> => {
        await mkdir(join(outputRoot, "hyperframes"), { recursive: true });
        await writeFile(
          join(outputRoot, "hyperframes", "index.html"),
          '<div data-composition-id="demo"></div><script>window.__timelines={demo:1};\nconst D=1.0;</script>',
        );
        await writeFile(join(outputRoot, "hyperframes", "output.mp4"), "video");
        completed.resolve();
        return {
          jobId: "id-1",
          status: "completed",
          projectPath: join(outputRoot, "hyperframes", "output.mp4"),
          captureResultPath: join(outputRoot, "hyperframes", "generation-manifest.json"),
          outputDirectory: outputRoot,
          artifactPaths: [join(outputRoot, "hyperframes", "index.html"), join(outputRoot, "hyperframes", "output.mp4")],
          renderer: "hyperframes",
          rendererResults: {
            hyperframes: {
              outputVideoPath: join(outputRoot, "hyperframes", "output.mp4"),
              generationManifestPath: join(outputRoot, "hyperframes", "generation-manifest.json"),
              assetManifestPath: join(outputRoot, "hyperframes", "asset-manifest.json"),
            },
          },
        };
      },
    });

    try {
      const created = await server.inject({ method: "POST", url: "/api/jobs", payload: { ...validBody, renderer: "hyperframes" } });
      expect(created.statusCode).toBe(202);
      const jobId = created.json().id as string;
      await completed.promise;
      await waitForJobStatus(server, jobId, "completed");

      const edit = await server.inject({
        method: "POST",
        url: `/api/jobs/${jobId}/edits`,
        payload: { instruction: "slower", context: [] },
      });
      expect(edit.statusCode).toBe(202);
      await waitForRevision(server, jobId);

      const got = await server.inject({ method: "GET", url: `/api/jobs/${jobId}` });
      const rev = got
        .json()
        .revisions[0].result.artifacts.find((a: { kind: string }) => a.kind === "composition-index");
      const res = await server.inject({ method: "GET", url: rev.url });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/html/);
    } finally {
      await server.close();
    }
  });

  it("POST /revisions/:revId/render renders a completed revision and adds an output-video artifact", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "tinker-api-render-"));
    const outputRoot = join(repoRoot, "generated", "local-job", "id-1");
    const completed = deferred<void>();
    let n = 0;
    const runEdit = createComposeRunEdit({
      runAgent: async () => "<<<<<<< SEARCH\nconst D=1.0;\n=======\nconst D=2.0;\n>>>>>>> REPLACE",
    });
    // Fake render seam (the real createDefaultRunRender shells out to `npx hyperframes` and would hang CI).
    const runRender = async (
      record: { id: string; outputRoot: string },
      render: { revId: string },
    ) => hyperframesRevisionResult(indexArtifacts({
        jobId: record.id,
        outputRoot: record.outputRoot,
        artifactPaths: [
          join(record.outputRoot, "revisions", render.revId, "hyperframes", "index.html"),
          join(record.outputRoot, "revisions", render.revId, "hyperframes", "output.mp4"),
        ],
      }));
    const server = await buildServer({
      config: testConfig(repoRoot),
      runEdit,
      runRender,
      idGenerator: () => `id-${++n}`,
      runner: async (): Promise<ManualFixtureGenerationResult> => {
        await mkdir(join(outputRoot, "hyperframes"), { recursive: true });
        await writeFile(
          join(outputRoot, "hyperframes", "index.html"),
          '<div data-composition-id="demo"></div><script>window.__timelines={demo:1};\nconst D=1.0;</script>',
        );
        await writeFile(join(outputRoot, "hyperframes", "output.mp4"), "video");
        completed.resolve();
        return {
          jobId: "id-1",
          status: "completed",
          projectPath: join(outputRoot, "hyperframes", "output.mp4"),
          captureResultPath: join(outputRoot, "hyperframes", "generation-manifest.json"),
          outputDirectory: outputRoot,
          artifactPaths: [join(outputRoot, "hyperframes", "index.html"), join(outputRoot, "hyperframes", "output.mp4")],
          renderer: "hyperframes",
          rendererResults: {
            hyperframes: {
              outputVideoPath: join(outputRoot, "hyperframes", "output.mp4"),
              generationManifestPath: join(outputRoot, "hyperframes", "generation-manifest.json"),
              assetManifestPath: join(outputRoot, "hyperframes", "asset-manifest.json"),
            },
          },
        };
      },
    });

    try {
      const created = await server.inject({ method: "POST", url: "/api/jobs", payload: { ...validBody, renderer: "hyperframes" } });
      expect(created.statusCode).toBe(202);
      const jobId = created.json().id as string;
      await completed.promise;
      await waitForJobStatus(server, jobId, "completed");

      const edit = await server.inject({
        method: "POST",
        url: `/api/jobs/${jobId}/edits`,
        payload: { instruction: "slower", context: [] },
      });
      expect(edit.statusCode).toBe(202);
      await waitForRevision(server, jobId);

      const afterEdit = await server.inject({ method: "GET", url: `/api/jobs/${jobId}` });
      const revId = afterEdit.json().revisions[0].id as string;

      // 404 paths: unknown job and unknown revision.
      expect((await server.inject({ method: "POST", url: `/api/jobs/nope/revisions/${revId}/render` })).statusCode).toBe(404);
      expect((await server.inject({ method: "POST", url: `/api/jobs/${jobId}/revisions/nope/render` })).statusCode).toBe(404);

      const render = await server.inject({ method: "POST", url: `/api/jobs/${jobId}/revisions/${revId}/render` });
      expect(render.statusCode).toBe(202);

      let hasVideo = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        const got = await server.inject({ method: "GET", url: `/api/jobs/${jobId}` });
        const artifacts = (got.json().revisions[0].result?.artifacts ?? []) as Array<{ kind: string }>;
        if (artifacts.some((a) => a.kind === "output-video")) {
          hasVideo = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      expect(hasVideo).toBe(true);
    } finally {
      await server.close();
    }
  });
});

describe("artifact indexing", () => {
  it("classifies known Hyperframes artifacts and preserves unknown paths", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "tinker-api-artifacts-"));
    const artifacts = indexArtifacts({
      jobId: "job-test",
      outputRoot,
      artifactPaths: [
        join(outputRoot, "hyperframes", "output.mp4"),
        join(outputRoot, "hyperframes", "index.html"),
        join(outputRoot, "hyperframes", "asset-manifest.json"),
        join(outputRoot, "hyperframes", "generation-manifest.json"),
        join(outputRoot, "hyperframes", "lint.log"),
        join(outputRoot, "hyperframes", "render.log"),
        join(outputRoot, "product-analysis.json"),
        join(outputRoot, "product-analysis.png"),
        join(outputRoot, "repo-analysis.json"),
        join(outputRoot, "hyperframes", "assets", "logo.png"),
        join(outputRoot, "hyperframes", "notes.txt"),
      ],
    });

    expect(artifacts.map((artifact) => artifact.kind)).toEqual([
      "output-video",
      "composition-index",
      "asset-manifest",
      "generation-manifest",
      "lint-log",
      "render-log",
      "product-analysis",
      "product-analysis-screenshot",
      "repo-analysis",
      "asset",
      "other",
    ]);
    expect(artifacts[0]).toMatchObject({
      relativePath: "hyperframes/output.mp4",
      url: "/api/jobs/job-test/artifacts/hyperframes/output.mp4",
      mediaType: "video/mp4",
    });

    const unknownArtifact = artifacts.find((artifact) => artifact.relativePath === "hyperframes/notes.txt");
    expect(unknownArtifact).toMatchObject({
      kind: "other",
      relativePath: "hyperframes/notes.txt",
    });
    expect(unknownArtifact?.url.endsWith("/hyperframes/notes.txt")).toBe(true);
  });

  it("classifies Playwright artifacts and keeps unknown Playwright paths", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "tinker-api-playwright-artifacts-"));
    const artifacts = indexArtifacts({
      jobId: "job-test",
      outputRoot,
      artifactPaths: [
        join(outputRoot, "playwright", "demo-project.json"),
        join(outputRoot, "playwright", "storyboard.json"),
        join(outputRoot, "playwright", "capture-plan.json"),
        join(outputRoot, "playwright", "capture-result.json"),
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
      "playwright-screenshot",
      "playwright-trace",
      "other",
    ]);
    expect(artifacts[4]).toMatchObject({
      relativePath: "playwright/capture/videos/clip.webm",
      url: "/api/jobs/job-test/artifacts/playwright/capture/videos/clip.webm",
      mediaType: "video/webm",
    });
    expect(artifacts[5]).toMatchObject({
      relativePath: "playwright/capture/screenshots/frame.png",
      mediaType: "image/png",
    });
  });

  it("excludes artifact paths outside the output root", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "tinker-api-artifacts-"));
    const artifacts = indexArtifacts({
      jobId: "job-test",
      outputRoot,
      artifactPaths: [
        join(outputRoot, "hyperframes", "index.html"),
        join(outputRoot, "..", "outside.txt"),
      ],
    });

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.relativePath).toBe("hyperframes/index.html");
  });
});

describe("job store", () => {
  it("creates snapshots, appends progress, and stores terminal result xor error", () => {
    const store = createJobStore();
    store.create({
      id: "job-test",
      request,
      outputRoot: "/tmp/job-test",
      now: "2026-06-11T00:00:00.000Z",
    });

    expect(store.getSnapshot("job-test")?.status).toBe("queued");

    store.appendProgress("job-test", runningEvent);
    expect(store.getSnapshot("job-test")?.status).toBe("running");
    expect(store.getSnapshot("job-test")?.progressEvents).toEqual([runningEvent]);

    store.complete("job-test", hyperframesApiResult(), "2026-06-11T00:00:02.000Z");

    const completed = store.getSnapshot("job-test");
    expect(completed?.status).toBe("completed");
    expect(completed?.result?.artifacts[0]?.kind).toBe("composition-index");
    expect(completed?.error).toBeUndefined();
  });

  it("stores failed jobs with typed generation errors", () => {
    const store = createJobStore();
    const error: GenerationError = {
      status: "failed",
      stage: "planning",
      message: "Planner failed",
    };

    store.create({
      id: "job-test",
      request,
      outputRoot: "/tmp/job-test",
      now: "2026-06-11T00:00:00.000Z",
    });
    store.fail("job-test", error, "2026-06-11T00:00:02.000Z");

    const failed = store.getSnapshot("job-test");
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toEqual(error);
    expect(failed?.result).toBeUndefined();
  });

  it("uses the server job id in request snapshots", () => {
    const store = createJobStore();

    const snapshot = store.create({
      id: "server-job-id",
      request: { ...request, id: "client-job-id" },
      outputRoot: "/tmp/server-job-id",
      now: "2026-06-11T00:00:00.000Z",
    });

    expect(snapshot.id).toBe("server-job-id");
    expect(snapshot.request.id).toBe("server-job-id");
  });

  it("stores supported API renderers without sanitizing request snapshots", () => {
    const store = createJobStore();

    for (const renderer of ["hyperframes", "playwright"] as const) {
      const snapshot = store.create({
        id: `job-${renderer}`,
        request: { ...request, id: `job-${renderer}`, renderer },
        outputRoot: `/tmp/job-${renderer}`,
        now: "2026-06-11T00:00:00.000Z",
      });

      expect(snapshot.request.renderer).toBe(renderer);
    }

    expect(() => store.create({
      id: "job-both",
      request: { ...request, id: "job-both", renderer: "both" },
      outputRoot: "/tmp/job-both",
      now: "2026-06-11T00:00:00.000Z",
    })).toThrow();

    expect(() => store.create({
      id: "job-output-directory",
      request: { ...request, outputDirectory: "/tmp/output" },
      outputRoot: "/tmp/job-output-directory",
      now: "2026-06-11T00:00:00.000Z",
    })).toThrow();
  });

  it("does not persist invalid records when create validation fails", () => {
    const store = createJobStore();

    expect(() => store.create({
      id: "job-invalid-output-directory",
      request: { ...request, outputDirectory: "/tmp/output" },
      outputRoot: "/tmp/job-invalid-output-directory",
      now: "2026-06-11T00:00:00.000Z",
    })).toThrow();

    expect(store.getRecord("job-invalid-output-directory")).toBeUndefined();
    expect(store.getSnapshot("job-invalid-output-directory")).toBeUndefined();
  });

  it("ignores terminal progress statuses until complete or fail records terminal payloads", () => {
    for (const status of ["completed", "failed"] as const) {
      const store = createJobStore();
      const id = `job-${status}`;
      store.create({
        id,
        request: { ...request, id },
        outputRoot: `/tmp/${id}`,
        now: "2026-06-11T00:00:00.000Z",
      });
      store.appendProgress(id, { ...runningEvent, jobId: id });

      store.appendProgress(id, {
        jobId: id,
        status,
        message: `${status} progress event`,
        time: "2026-06-11T00:00:02.000Z",
      });

      expect(store.getSnapshot(id)?.status).toBe("running");
    }
  });

  it("keeps completed jobs terminal after later progress events", () => {
    const store = createJobStore();
    store.create({
      id: "job-completed-terminal",
      request: { ...request, id: "job-completed-terminal" },
      outputRoot: "/tmp/job-completed-terminal",
      now: "2026-06-11T00:00:00.000Z",
    });
    store.complete("job-completed-terminal", hyperframesApiResult(), "2026-06-11T00:00:02.000Z");

    store.appendProgress("job-completed-terminal", {
      jobId: "job-completed-terminal",
      status: "running",
      message: "Late progress event",
      time: "2026-06-11T00:00:03.000Z",
    });

    const snapshot = store.getSnapshot("job-completed-terminal");
    expect(snapshot?.status).toBe("completed");
    expect(snapshot?.result?.method).toBe("hyperframes");
  });

  it("keeps the previous updatedAt for progress events without datetime times", () => {
    const store = createJobStore();
    store.create({
      id: "job-invalid-progress-time",
      request: { ...request, id: "job-invalid-progress-time" },
      outputRoot: "/tmp/job-invalid-progress-time",
      now: "2026-06-11T00:00:00.000Z",
    });

    store.appendProgress("job-invalid-progress-time", {
      jobId: "job-invalid-progress-time",
      status: "running",
      message: "Progress with non-datetime time",
      time: "not-a-datetime",
    });

    const snapshot = store.getSnapshot("job-invalid-progress-time");
    expect(snapshot?.status).toBe("running");
    expect(snapshot?.updatedAt).toBe("2026-06-11T00:00:00.000Z");
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

async function waitForJobStatus(
  server: Awaited<ReturnType<typeof buildServer>>,
  id: string,
  status: "completed" | "failed",
) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const response = await server.inject({ method: "GET", url: `/api/jobs/${id}` });
    const snapshot = JSON.parse(response.body) as { status?: string };
    if (snapshot.status === status) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error(`Timed out waiting for ${id} to become ${status}`);
}

async function waitForRevision(server: Awaited<ReturnType<typeof buildServer>>, id: string) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await server.inject({ method: "GET", url: `/api/jobs/${id}` });
    const snapshot = JSON.parse(response.body) as { revisions?: Array<{ id?: string }> };
    if (snapshot.revisions?.[0] !== undefined) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error(`Timed out waiting for ${id} to record a revision`);
}

describe("job queue", () => {
  it("runs one job at a time in FIFO order and bounds pending jobs", async () => {
    const first = deferred<void>();
    const started: string[] = [];
    const finished: string[] = [];
    const queue = createJobQueue({
      maxPendingJobs: 1,
      runJob: async (id) => {
        started.push(id);
        if (id === "job-1") {
          await first.promise;
        }
        finished.push(id);
      },
    });

    expect(queue.pendingCount()).toBe(0);
    expect(queue.hasCapacity()).toBe(true);
    expect(queue.isRunning()).toBe(false);

    expect(queue.enqueue("job-1")).toBe(true);
    expect(queue.pendingCount()).toBe(0);
    expect(queue.hasCapacity()).toBe(true);
    expect(queue.isRunning()).toBe(true);

    expect(queue.enqueue("job-2")).toBe(true);
    expect(queue.pendingCount()).toBe(1);
    expect(queue.hasCapacity()).toBe(false);
    expect(queue.isRunning()).toBe(true);

    expect(queue.enqueue("job-3")).toBe(false);
    expect(queue.pendingCount()).toBe(1);
    expect(queue.hasCapacity()).toBe(false);
    expect(queue.isRunning()).toBe(true);

    await Promise.resolve();
    expect(started).toEqual(["job-1"]);

    first.resolve();
    await first.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(started).toEqual(["job-1", "job-2"]);
    expect(finished).toEqual(["job-1", "job-2"]);
    expect(queue.pendingCount()).toBe(0);
    expect(queue.hasCapacity()).toBe(true);
    expect(queue.isRunning()).toBe(false);
  });

  it("continues draining after a job rejects", async () => {
    const started: string[] = [];
    const queue = createJobQueue({
      maxPendingJobs: 2,
      runJob: async (id) => {
        started.push(id);
        if (id === "job-1") {
          throw new Error("first job failed");
        }
      },
    });

    expect(queue.enqueue("job-1")).toBe(true);
    expect(queue.enqueue("job-2")).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(started).toEqual(["job-1", "job-2"]);
    expect(queue.pendingCount()).toBe(0);
    expect(queue.isRunning()).toBe(false);
  });
});

describe("generation worker", () => {
  it("completes HyperFrames jobs with composition artifacts", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "tinker-api-worker-hyperframes-"));
    const outputRoot = join(repoRoot, "generated", "local-job", "job-test");
    const store = createJobStore();
    store.create({ id: "job-test", request, outputRoot, now: "2026-06-11T00:00:00.000Z" });

    const runner: GenerationRunner = async (rawRequest, options) => {
      expect(rawRequest).toMatchObject({ id: "job-test", mode: "ai-url-planning", renderer: "hyperframes" });
      options?.onProgress?.(runningEvent);
      await mkdir(join(outputRoot, "hyperframes"), { recursive: true });
      await writeFile(join(outputRoot, "hyperframes", "index.html"), "<html>composition</html>");
      await writeFile(join(outputRoot, "hyperframes", "output.mp4"), "video");
      await writeFile(join(outputRoot, "hyperframes", "generation-manifest.json"), "{}");
      await writeFile(join(outputRoot, "hyperframes", "asset-manifest.json"), "{}");
      return {
        jobId: "job-test",
        status: "completed",
        projectPath: join(outputRoot, "hyperframes", "output.mp4"),
        captureResultPath: join(outputRoot, "hyperframes", "generation-manifest.json"),
        outputDirectory: outputRoot,
        artifactPaths: [
          join(outputRoot, "hyperframes", "index.html"),
          join(outputRoot, "hyperframes", "output.mp4"),
          join(outputRoot, "hyperframes", "generation-manifest.json"),
          join(outputRoot, "hyperframes", "asset-manifest.json"),
        ],
        renderer: "hyperframes",
        rendererResults: {
          hyperframes: {
            outputVideoPath: join(outputRoot, "hyperframes", "output.mp4"),
            generationManifestPath: join(outputRoot, "hyperframes", "generation-manifest.json"),
            assetManifestPath: join(outputRoot, "hyperframes", "asset-manifest.json"),
          },
        },
      };
    };

    const worker = createGenerationWorker({ store, runner, now: () => "2026-06-11T00:00:02.000Z" });
    await worker("job-test");

    const completed = store.getSnapshot("job-test");
    expect(completed?.status).toBe("completed");
    expect(completed?.progressEvents.map((event) => event.message)).toEqual(["AI URL analysis started"]);
    expect(completed?.result?.method).toBe("hyperframes");
    expect(completed?.result?.artifacts.map((artifact) => artifact.kind)).toEqual([
      "composition-index",
      "output-video",
      "generation-manifest",
      "asset-manifest",
    ]);
    expect(completed?.result?.method === "hyperframes" ? completed.result.composition.indexArtifact.kind : undefined).toBe(
      "composition-index",
    );
  });

  it("completes Playwright jobs with a parsed DemoProject", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "tinker-api-worker-playwright-"));
    const outputRoot = join(repoRoot, "generated", "local-job", "job-test");
    const store = createJobStore();
    store.create({
      id: "job-test",
      request: { ...request, renderer: "playwright" },
      outputRoot,
      now: "2026-06-11T00:00:00.000Z",
    });

    const runner: GenerationRunner = async () => {
      await mkdir(join(outputRoot, "playwright"), { recursive: true });
      await writeFile(join(outputRoot, "playwright", "demo-project.json"), `${JSON.stringify(goldenProject, null, 2)}\n`);
      await writeFile(join(outputRoot, "playwright", "capture-result.json"), "{}");
      const rawProject = await readFile(join(outputRoot, "playwright", "demo-project.json"), "utf8");
      expect(DemoProjectSchema.parse(JSON.parse(rawProject)).id).toBe(goldenProject.id);
      return {
        jobId: "job-test",
        status: "completed",
        projectPath: join(outputRoot, "playwright", "demo-project.json"),
        captureResultPath: join(outputRoot, "playwright", "capture-result.json"),
        outputDirectory: outputRoot,
        artifactPaths: [
          join(outputRoot, "playwright", "demo-project.json"),
          join(outputRoot, "playwright", "capture-result.json"),
        ],
        renderer: "playwright",
        rendererResults: {
          playwright: {
            projectPath: join(outputRoot, "playwright", "demo-project.json"),
            captureResultPath: join(outputRoot, "playwright", "capture-result.json"),
          },
        },
      };
    };

    const worker = createGenerationWorker({ store, runner, now: () => "2026-06-11T00:00:02.000Z" });
    await worker("job-test");

    const completed = store.getSnapshot("job-test");
    expect(completed?.status).toBe("completed");
    expect(completed?.result?.method).toBe("playwright");
    expect(completed?.result?.method === "playwright" ? completed.result.project.id : undefined).toBe(goldenProject.id);
    expect(completed?.result?.artifacts.map((artifact) => artifact.kind)).toEqual([
      "playwright-demo-project",
      "playwright-capture-result",
    ]);
  });

  it("embeds Playwright projects from the indexed demo-project artifact", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "tinker-api-worker-playwright-indexed-project-"));
    const outputRoot = join(repoRoot, "generated", "local-job", "job-test");
    const indexedProjectPath = join(outputRoot, "playwright", "demo-project.json");
    const unindexedProjectPath = join(outputRoot, "playwright", "unindexed-demo-project.json");
    const captureResultPath = join(outputRoot, "playwright", "capture-result.json");
    const unindexedProject = DemoProjectSchema.parse({ ...goldenProject, id: "project-from-unindexed-path" });
    const store = createJobStore();
    store.create({
      id: "job-test",
      request: { ...request, renderer: "playwright" },
      outputRoot,
      now: "2026-06-11T00:00:00.000Z",
    });

    const runner: GenerationRunner = async () => {
      await mkdir(join(outputRoot, "playwright"), { recursive: true });
      await writeFile(indexedProjectPath, `${JSON.stringify(goldenProject, null, 2)}\n`);
      await writeFile(unindexedProjectPath, `${JSON.stringify(unindexedProject, null, 2)}\n`);
      await writeFile(captureResultPath, "{}");
      return {
        jobId: "job-test",
        status: "completed",
        projectPath: unindexedProjectPath,
        captureResultPath,
        outputDirectory: outputRoot,
        artifactPaths: [indexedProjectPath, captureResultPath],
        renderer: "playwright",
        rendererResults: {
          playwright: {
            projectPath: unindexedProjectPath,
            captureResultPath,
          },
        },
      };
    };

    const worker = createGenerationWorker({ store, runner, now: () => "2026-06-11T00:00:02.000Z" });
    await worker("job-test");

    const completed = store.getSnapshot("job-test");
    expect(completed?.status).toBe("completed");
    expect(completed?.result?.method === "playwright" ? completed.result.project.id : undefined).toBe(goldenProject.id);
    expect(completed?.result?.artifacts.find((artifact) => artifact.kind === "playwright-demo-project")?.relativePath).toBe(
      "playwright/demo-project.json",
    );
  });

  it("fails HyperFrames jobs that do not expose required composition artifacts", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "tinker-api-worker-missing-hyperframes-"));
    const store = createJobStore();
    store.create({ id: "job-test", request, outputRoot, now: "2026-06-11T00:00:00.000Z" });

    const runner: GenerationRunner = async () => ({
      jobId: "job-test",
      status: "completed",
      projectPath: join(outputRoot, "hyperframes", "output.mp4"),
      captureResultPath: join(outputRoot, "hyperframes", "generation-manifest.json"),
      outputDirectory: outputRoot,
      artifactPaths: [],
      renderer: "hyperframes",
      rendererResults: {
        hyperframes: {
          outputVideoPath: join(outputRoot, "hyperframes", "output.mp4"),
          generationManifestPath: join(outputRoot, "hyperframes", "generation-manifest.json"),
          assetManifestPath: join(outputRoot, "hyperframes", "asset-manifest.json"),
        },
      },
    });

    const worker = createGenerationWorker({ store, runner, now: () => "2026-06-11T00:00:02.000Z" });
    await worker("job-test");

    const failed = store.getSnapshot("job-test");
    expect(failed?.status).toBe("failed");
    expect(failed?.error?.message).toContain("composition-index");
  });

  it("ignores progress events for a different job id", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "tinker-api-worker-progress-"));
    const store = createJobStore();
    store.create({ id: "job-test", request, outputRoot, now: "2026-06-11T00:00:00.000Z" });

    const runner: GenerationRunner = async (_rawRequest, options) => {
      options?.onProgress?.({
        jobId: "other-job",
        status: "running",
        message: "Progress for another job",
        time: "2026-06-11T00:00:01.000Z",
      });
      return {
        jobId: "job-test",
        status: "completed",
        projectPath: join(outputRoot, "hyperframes", "output.mp4"),
        captureResultPath: join(outputRoot, "hyperframes", "generation-manifest.json"),
        outputDirectory: outputRoot,
        artifactPaths: [join(outputRoot, "hyperframes", "index.html"), join(outputRoot, "hyperframes", "output.mp4")],
        renderer: "hyperframes",
        rendererResults: {
          hyperframes: {
            outputVideoPath: join(outputRoot, "hyperframes", "output.mp4"),
            generationManifestPath: join(outputRoot, "hyperframes", "generation-manifest.json"),
            assetManifestPath: join(outputRoot, "hyperframes", "asset-manifest.json"),
          },
        },
      };
    };

    const worker = createGenerationWorker({ store, runner, now: () => "2026-06-11T00:00:02.000Z" });
    await worker("job-test");

    const completed = store.getSnapshot("job-test");
    expect(completed?.status).toBe("completed");
    expect(completed?.progressEvents).toEqual([]);
  });

  it("fails unknown empty-message errors with a non-empty typed generation error", async () => {
    for (const [id, thrown] of [
      ["job-empty-error", new Error("")],
      ["job-empty-string", ""],
    ] as const) {
      const outputRoot = await mkdtemp(join(tmpdir(), "tinker-api-worker-error-"));
      const store = createJobStore();
      store.create({ id, request: { ...request, id }, outputRoot, now: "2026-06-11T00:00:00.000Z" });

      const runner: GenerationRunner = async () => {
        throw thrown;
      };
      const worker = createGenerationWorker({ store, runner, now: () => "2026-06-11T00:00:02.000Z" });

      await expect(worker(id)).resolves.toBeUndefined();

      const failed = store.getSnapshot(id);
      expect(failed?.status).toBe("failed");
      expect(failed?.error).toMatchObject({ status: "failed", stage: "unknown" });
      expect(failed?.error?.message.trim().length).toBeGreaterThan(0);
    }
  });
});
