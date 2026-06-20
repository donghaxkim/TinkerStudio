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
    const outputDirectory = join(outputRoot, "testreel", "output");
    await mkdir(outputDirectory, { recursive: true });
    const recordingPlanPath = join(outputRoot, "testreel", "recording-plan.json");
    const recordingPath = join(outputRoot, "testreel", "recording.json");
    const manifestPath = join(outputDirectory, "output.json");
    const screenshotPath = join(outputDirectory, "final.png");
    const finalVideoPath = join(outputRoot, "testreel", "final.mp4");
    await writeFile(recordingPlanPath, JSON.stringify({ engine: "testreel" }));
    await writeFile(recordingPath, JSON.stringify({ url: "https://example.com", steps: [{ action: "wait", ms: 1 }] }));
    await writeFile(manifestPath, "{}\n");
    await writeFile(screenshotPath, "png");
    await writeFile(finalVideoPath, "video");

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
      },
      outputRoot,
      now: "2026-06-11T00:00:00.000Z",
    });
    const generationResult: ManualFixtureGenerationResult = {
      jobId: "job-late-cancel",
      status: "completed",
      publishedVideoPath: finalVideoPath,
      outputDirectory: outputRoot,
      artifactPaths: [recordingPlanPath, recordingPath, manifestPath, screenshotPath, finalVideoPath],
      renderer: "testreel",
      rendererResults: { testreel: { recordingPlanPath, recordingPath, outputDirectory, finalVideoPath, manifestPath, screenshotPaths: [screenshotPath] } },
    };
    const worker = createGenerationWorker({ store, runner: async () => generationResult, now: () => "2026-06-11T00:00:02.000Z" });

    const running = worker("job-late-cancel");
    await buildStarted.promise;
    expect(worker.cancel("job-late-cancel")).toBe(true);
    buildRelease.resolve({ method: "testreel", artifacts: [{ kind: "published-video", relativePath: "testreel/final.mp4", url: "/api/jobs/job-late-cancel/artifacts/testreel/final.mp4", mediaType: "video/mp4" }], warnings: [] });
    await running;

    expect(store.getSnapshot("job-late-cancel")).toMatchObject({
      status: "failed",
      error: { stage: "cancelled", message: "Generation cancelled." },
    });
  });
});
