import { describe, expect, it } from "vitest";
import goldenProjectInput from "../../../../packages/project-schema/fixtures/person-a-generated-project.sample.json" with { type: "json" };
import { DemoProjectSchema } from "@tinker/project-schema";
import { createJobStore } from "./jobStore.js";

const request = { mode: "ai-url-planning" as const, repoUrl: "https://github.com/a/b", productUrl: "https://a.com", durationCapSeconds: 60, aspectRatio: "16:9" as const };
const goldenProject = DemoProjectSchema.parse(goldenProjectInput);
const completedResult = { method: "playwright" as const, project: goldenProject, artifacts: [], warnings: [] };

describe("jobStore", () => {
  it("creates and completes a typed Playwright job snapshot", () => {
    const store = createJobStore();
    store.create({ id: "j", request, outputRoot: "/tmp/j", now: "2026-01-01T00:00:00.000Z" });
    store.complete("j", completedResult, "2026-01-01T00:00:01.000Z");
    expect(store.getSnapshot("j")).toMatchObject({ id: "j", status: "completed", request: { id: "j" }, result: { method: "playwright" } });
  });
});
