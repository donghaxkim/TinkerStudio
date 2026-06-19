import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ApiGenerationResult, ManualFixtureGenerationResult } from "@tinker/generation-contract";
import { createJobStore } from "../jobs/jobStore.js";

const buildStarted = deferred<void>();
const buildRelease = deferred<ApiGenerationResult>();

vi.mock("./apiGenerationResult.js", () => ({
  buildApiGenerationResult: vi.fn(async () => {
    buildStarted.resolve();
    return await buildRelease.promise;
  }),
}));

const { createGenerationWorker } = await import("./generationWorker.js");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

describe("generation worker cancellation", () => {
  it("does not complete a job cancelled while API result indexing is pending", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "tinker-api-worker-late-cancel-"));
    await mkdir(join(outputRoot, "hyperframes"), { recursive: true });
    const indexPath = join(outputRoot, "hyperframes", "index.html");
    const outputVideoPath = join(outputRoot, "hyperframes", "output.mp4");
    await writeFile(indexPath, "<html>composition</html>");
    await writeFile(outputVideoPath, "video");

    const store = createJobStore();
    store.create({
      id: "job-late-cancel",
      request: {
        id: "job-late-cancel",
        mode: "ai-url-planning",
        repoUrl: "https://github.com/example/product",
        productUrl: "https://example.com",
        durationCapSeconds: 12,
        aspectRatio: "16:9",
        renderer: "hyperframes",
        hyperframesAgent: "opencode",
      },
      outputRoot,
      now: "2026-06-11T00:00:00.000Z",
    });
    const generationResult: ManualFixtureGenerationResult = {
      jobId: "job-late-cancel",
      status: "completed",
      projectPath: outputVideoPath,
      captureResultPath: join(outputRoot, "hyperframes", "generation-manifest.json"),
      outputDirectory: outputRoot,
      artifactPaths: [indexPath, outputVideoPath],
      renderer: "hyperframes",
      rendererResults: {
        hyperframes: {
          outputVideoPath,
          generationManifestPath: join(outputRoot, "hyperframes", "generation-manifest.json"),
          assetManifestPath: join(outputRoot, "hyperframes", "asset-manifest.json"),
        },
      },
    };
    const worker = createGenerationWorker({
      store,
      runner: async () => generationResult,
      now: () => "2026-06-11T00:00:02.000Z",
    });

    const running = worker("job-late-cancel");
    await buildStarted.promise;
    expect(worker.cancel("job-late-cancel")).toBe(true);
    buildRelease.resolve({
      method: "hyperframes",
      composition: {
        indexArtifact: {
          kind: "composition-index",
          relativePath: "hyperframes/index.html",
          url: "/api/jobs/job-late-cancel/artifacts/hyperframes/index.html",
          mediaType: "text/html",
        },
        outputVideoArtifact: {
          kind: "output-video",
          relativePath: "hyperframes/output.mp4",
          url: "/api/jobs/job-late-cancel/artifacts/hyperframes/output.mp4",
          mediaType: "video/mp4",
        },
      },
      artifacts: [],
      warnings: [],
    });

    await running;

    expect(store.getSnapshot("job-late-cancel")).toMatchObject({
      status: "failed",
      error: { stage: "cancelled", message: "Generation cancelled." },
    });
  });
});
