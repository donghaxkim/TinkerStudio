import { describe, expect, it } from "vitest";
import { indexArtifacts } from "./artifactIndex.js";

describe("indexArtifacts revision paths", () => {
  it("classifies revision composition-index + output-video by stripping the revisions/<id>/ prefix", () => {
    const arts = indexArtifacts({
      jobId: "j", outputRoot: "/root",
      artifactPaths: ["/root/revisions/rev-1/hyperframes/index.html", "/root/revisions/rev-1/hyperframes/output.mp4"],
    });
    expect(arts.find((a) => a.relativePath.endsWith("index.html"))?.kind).toBe("composition-index");
    expect(arts.find((a) => a.relativePath.endsWith("output.mp4"))?.kind).toBe("output-video");
    expect(arts[0]?.url).toBe("/api/jobs/j/artifacts/revisions/rev-1/hyperframes/index.html");
  });
  it("still classifies base (non-revision) paths", () => {
    const arts = indexArtifacts({ jobId: "j", outputRoot: "/root", artifactPaths: ["/root/hyperframes/index.html"] });
    expect(arts[0]?.kind).toBe("composition-index");
  });
});
