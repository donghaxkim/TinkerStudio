import { describe, expect, it } from "vitest";
import type { ApiGenerationJob } from "@tinker/generation-contract";
import { isTerminalStatus, selectArtifact, selectArtifactUrl } from "./compositionGenerationClient.js";

const compositionIndexArtifact = {
  kind: "composition-index",
  relativePath: "hyperframes/index.html",
  url: "/api/jobs/job-1/artifacts/hyperframes/index.html",
  mediaType: "text/html",
} as const;

const outputVideoArtifact = {
  kind: "output-video",
  relativePath: "hyperframes/output.mp4",
  url: "/api/jobs/job-1/artifacts/hyperframes/output.mp4",
  mediaType: "video/mp4",
} as const;

const completed = {
  id: "job-1",
  status: "completed",
  request: {
    id: "job-1",
    mode: "ai-url-planning",
    repoUrl: "https://github.com/acme/driftboard",
    productUrl: "https://driftboard.example.com",
    durationCapSeconds: 60,
    aspectRatio: "16:9",
    renderer: "hyperframes",
    hyperframesAgent: "claude",
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  progressEvents: [],
  result: {
    method: "hyperframes",
    composition: {
      indexArtifact: compositionIndexArtifact,
      outputVideoArtifact,
    },
    artifacts: [compositionIndexArtifact, outputVideoArtifact],
    warnings: [],
  },
} satisfies ApiGenerationJob;

describe("composition client helpers", () => {
  it("isTerminalStatus is true only for completed/failed", () => {
    expect(isTerminalStatus("completed")).toBe(true);
    expect(isTerminalStatus("failed")).toBe(true);
    expect(isTerminalStatus("running")).toBe(false);
    expect(isTerminalStatus("queued")).toBe(false);
  });

  it("selects an artifact and its url by kind", () => {
    expect(selectArtifactUrl(completed, "composition-index")).toBe("/api/jobs/job-1/artifacts/hyperframes/index.html");
    expect(selectArtifact(completed, "output-video")?.mediaType).toBe("video/mp4");
    expect(selectArtifactUrl(completed, "lint-log")).toBeUndefined();
  });

  it("returns undefined when the job has no result yet", () => {
    const running = { ...completed, status: "running", result: undefined } as unknown as ApiGenerationJob;
    expect(selectArtifact(running, "composition-index")).toBeUndefined();
    expect(selectArtifactUrl(running, "composition-index")).toBeUndefined();
  });
});
