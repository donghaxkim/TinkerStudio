import { describe, expect, it } from "vitest";
import type { ApiGenerationJob } from "@tinker/generation-contract";
import { isTerminalStatus, selectArtifact, selectArtifactUrl } from "./compositionGenerationClient.js";

const playwrightVideoArtifact = {
  kind: "playwright-video",
  relativePath: "playwright/final.mp4",
  url: "/api/jobs/job-1/artifacts/playwright/final.mp4",
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
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  progressEvents: [],
  result: {
    method: "playwright",
    project: {
      schemaVersion: "0.1.0",
      id: "job-1",
      title: "Driftboard demo",
      duration: 10,
      fps: 60,
      aspectRatio: "16:9",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      assets: [],
      tracks: [],
      zooms: [],
      cursorEvents: [],
      aiEditHistory: [],
      metadata: { notes: [] },
    },
    artifacts: [playwrightVideoArtifact],
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
    expect(selectArtifactUrl(completed, "playwright-video")).toBe("/api/jobs/job-1/artifacts/playwright/final.mp4");
    expect(selectArtifact(completed, "playwright-video")?.mediaType).toBe("video/mp4");
    expect(selectArtifactUrl(completed, "other")).toBeUndefined();
  });

  it("returns undefined when the job has no result yet", () => {
    const running = { ...completed, status: "running", result: undefined } as unknown as ApiGenerationJob;
    expect(selectArtifact(running, "playwright-video")).toBeUndefined();
    expect(selectArtifactUrl(running, "playwright-video")).toBeUndefined();
  });
});
