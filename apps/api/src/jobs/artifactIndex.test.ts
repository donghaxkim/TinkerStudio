import { describe, expect, it } from "vitest";
import { indexArtifacts } from "./artifactIndex.js";

describe("indexArtifacts", () => {
  it("classifies Playwright artifacts and treats unrelated paths as other", () => {
    expect(indexArtifacts({ jobId: "j", outputRoot: "/root", artifactPaths: ["/root/legacy-composition/index.html"] })[0]?.kind).toBe("other");
    expect(indexArtifacts({ jobId: "j", outputRoot: "/root", artifactPaths: ["/root/playwright/final.mp4"] })[0]?.kind).toBe("playwright-video");
  });
});
