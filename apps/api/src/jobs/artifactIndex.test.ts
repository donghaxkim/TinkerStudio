import { describe, expect, it } from "vitest";
import { indexArtifacts } from "./artifactIndex.js";

describe("indexArtifacts", () => {
  it("classifies Testreel artifacts and treats unrelated paths as other", () => {
    expect(indexArtifacts({ jobId: "j", outputRoot: "/root", artifactPaths: ["/root/legacy-composition/index.html"] })[0]?.kind).toBe("other");
    expect(indexArtifacts({ jobId: "j", outputRoot: "/root", artifactPaths: ["/root/testreel/final.mp4"] })[0]?.kind).toBe("published-video");
    expect(indexArtifacts({ jobId: "j", outputRoot: "/root", artifactPaths: ["/root/testreel/recording-plan.json"] })[0]?.kind).toBe("testreel-recording-plan");
    expect(indexArtifacts({ jobId: "j", outputRoot: "/root", artifactPaths: ["/root/testreel/recording.json"] })[0]?.kind).toBe("testreel-recording-definition");
    expect(indexArtifacts({ jobId: "j", outputRoot: "/root", artifactPaths: ["/root/testreel/output/output.json"] })[0]?.kind).toBe("testreel-manifest");
    expect(indexArtifacts({ jobId: "j", outputRoot: "/root", artifactPaths: ["/root/testreel/output/final.png"] })[0]?.kind).toBe("testreel-screenshot");
  });
});
