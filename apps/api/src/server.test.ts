import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve } from "node:path";
import { describe, expect, it, test } from "vitest";
import type { AiUrlPlanningCreateDemoRequest, GenerationError, ManualFixtureProgressEvent } from "@tinker/generation-contract";
import { readConfig } from "./config.js";
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

    store.complete("job-test", {
      artifacts: [
        {
          kind: "composition-index",
          relativePath: "hyperframes/index.html",
          url: "/api/jobs/job-test/artifacts/hyperframes/index.html",
          mediaType: "text/html; charset=utf-8",
        },
      ],
    }, "2026-06-11T00:00:02.000Z");

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

  it("does not sanitize invalid API request fields into valid snapshots", () => {
    const store = createJobStore();

    expect(() => store.create({
      id: "job-playwright",
      request: { ...request, renderer: "playwright" },
      outputRoot: "/tmp/job-playwright",
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
      id: "job-invalid",
      request: { ...request, renderer: "playwright" },
      outputRoot: "/tmp/job-invalid",
      now: "2026-06-11T00:00:00.000Z",
    })).toThrow();

    expect(store.getRecord("job-invalid")).toBeUndefined();
    expect(store.getSnapshot("job-invalid")).toBeUndefined();
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
    store.complete("job-completed-terminal", { artifacts: [] }, "2026-06-11T00:00:02.000Z");

    store.appendProgress("job-completed-terminal", {
      jobId: "job-completed-terminal",
      status: "running",
      message: "Late progress event",
      time: "2026-06-11T00:00:03.000Z",
    });

    const snapshot = store.getSnapshot("job-completed-terminal");
    expect(snapshot?.status).toBe("completed");
    expect(snapshot?.result).toEqual({ artifacts: [] });
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

    expect(queue.enqueue("job-1")).toBe(true);
    expect(queue.enqueue("job-2")).toBe(true);
    expect(queue.enqueue("job-3")).toBe(false);

    await Promise.resolve();
    expect(started).toEqual(["job-1"]);

    first.resolve();
    await first.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(started).toEqual(["job-1", "job-2"]);
    expect(finished).toEqual(["job-1", "job-2"]);
  });
});

describe("generation worker", () => {
  it("invokes the runner, appends progress, indexes artifacts, and completes the job", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "tinker-api-worker-"));
    const outputRoot = join(repoRoot, "generated", "local-job", "job-test");
    const store = createJobStore();
    store.create({ id: "job-test", request, outputRoot, now: "2026-06-11T00:00:00.000Z" });

    const runner: GenerationRunner = async (rawRequest, options) => {
      expect(rawRequest).toMatchObject({ id: "job-test", mode: "ai-url-planning", renderer: "hyperframes" });
      options?.onProgress?.({
        jobId: "job-test",
        status: "running",
        message: "AI URL analysis started",
        time: "2026-06-11T00:00:01.000Z",
      });
      await mkdir(join(outputRoot, "hyperframes"), { recursive: true });
      await writeFile(join(outputRoot, "hyperframes", "index.html"), "<html></html>");
      await writeFile(join(outputRoot, "hyperframes", "output.mp4"), "video");
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
    expect(completed?.progressEvents.map((event) => event.message)).toEqual(["AI URL analysis started"]);
    expect(completed?.result?.artifacts.map((artifact) => artifact.kind)).toEqual(["composition-index", "output-video"]);
  });
});
