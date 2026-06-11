import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve } from "node:path";
import { describe, expect, it, test } from "vitest";
import type { AiUrlPlanningCreateDemoRequest, GenerationError, ManualFixtureProgressEvent } from "@tinker/generation-contract";
import { readConfig } from "./config.js";
import { indexArtifacts } from "./jobs/artifactIndex.js";
import { createJobStore } from "./jobs/jobStore.js";
import { buildServer } from "./server.js";

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
});
