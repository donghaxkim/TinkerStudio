import { describe, expect, it } from "vitest";
import { selectCanonicalBundleFiles } from "./bundleFiles.js";

function f(relativePath: string) {
  return { relativePath };
}

describe("selectCanonicalBundleFiles", () => {
  it("keeps the canonical hyperframes files and remaps to hyperframes/* paths", () => {
    const out = selectCanonicalBundleFiles([
      f("job-abc/hyperframes/index.html"),
      f("job-abc/hyperframes/output.mp4"),
      f("job-abc/hyperframes/generation-manifest.json"),
      f("job-abc/hyperframes/assets/logo.png"),
      f("job-abc/hyperframes/render.log"),
      f("job-abc/revisions/r1/hyperframes/index.html"),
      f("job-abc/product-analysis.json"),
    ]);
    expect(out.map((x) => x.relativePath).sort()).toEqual(
      [
        "hyperframes/assets/logo.png",
        "hyperframes/generation-manifest.json",
        "hyperframes/index.html",
        "hyperframes/output.mp4",
      ].sort(),
    );
  });

  it("handles a folder dropped at its hyperframes root", () => {
    const out = selectCanonicalBundleFiles([f("hyperframes/index.html"), f("hyperframes/output.mp4")]);
    expect(out.map((x) => x.relativePath).sort()).toEqual(["hyperframes/index.html", "hyperframes/output.mp4"]);
  });

  it("returns empty when no index.html is present", () => {
    expect(selectCanonicalBundleFiles([f("output.mp4")])).toEqual([]);
  });
});
