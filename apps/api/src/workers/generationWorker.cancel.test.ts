import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import goldenProjectInput from "../../../../packages/project-schema/fixtures/person-a-generated-project.sample.json" with { type: "json" };
import { DemoProjectSchema } from "@tinker/project-schema";
import type { ApiGenerationResult, ManualFixtureGenerationResult } from "@tinker/generation-contract";
import { createJobStore } from "../jobs/jobStore.js";

const buildStarted = deferred<void>();
const buildRelease = deferred<ApiGenerationResult>();
const goldenProject = DemoProjectSchema.parse(goldenProjectInput);

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
    await mkdir(join(outputRoot, "playwright"), { recursive: true });
    const projectPath = join(outputRoot, "playwright", "demo-project.json");
    const captureResultPath = join(outputRoot, "playwright", "capture-result.json");
    const finalVideoPath = join(outputRoot, "playwright", "final.mp4");
    await writeFile(projectPath, `${JSON.stringify(goldenProject, null, 2)}\n`);
    await writeFile(captureResultPath, "{}");
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
      projectPath,
      captureResultPath,
      outputDirectory: outputRoot,
      artifactPaths: [projectPath, captureResultPath, finalVideoPath],
      renderer: "playwright",
      rendererResults: { playwright: { projectPath, captureResultPath } },
    };
    const worker = createGenerationWorker({ store, runner: async () => generationResult, now: () => "2026-06-11T00:00:02.000Z" });

    const running = worker("job-late-cancel");
    await buildStarted.promise;
    expect(worker.cancel("job-late-cancel")).toBe(true);
    buildRelease.resolve({ method: "playwright", project: goldenProject, artifacts: [], warnings: [] });
    await running;

    expect(store.getSnapshot("job-late-cancel")).toMatchObject({
      status: "failed",
      error: { stage: "cancelled", message: "Generation cancelled." },
    });
  });
});
