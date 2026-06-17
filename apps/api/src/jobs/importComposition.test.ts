import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ImportValidationError,
  buildImportedHyperframesResult,
  prepareImportedBundle,
  synthesizeImportRequest,
  writeImportedBundle,
  type ImportFile,
} from "./importComposition.js";

const VALID_INDEX = `<!doctype html><html><body><main data-composition-id="x"></main>
<script>window.__timelines = {};</script></body></html>`;

function file(relativePath: string, content = "x"): ImportFile {
  return { relativePath, content: Buffer.from(content) };
}

describe("prepareImportedBundle", () => {
  it("locates the canonical hyperframes files and ignores revisions", () => {
    const bundle = prepareImportedBundle([
      file("hyperframes/index.html", VALID_INDEX),
      file("hyperframes/output.mp4", "mp4"),
      file("hyperframes/generation-manifest.json", "{}"),
      file("hyperframes/asset-manifest.json", "{}"),
      file("hyperframes/assets/logo.png", "png"),
      file("revisions/job-2/hyperframes/index.html", "ignored"),
      file("product-analysis.json", "ignored"),
    ]);
    expect(bundle.indexHtml.toString()).toBe(VALID_INDEX);
    expect(bundle.outputMp4.toString()).toBe("mp4");
    expect(bundle.manifestJson?.toString()).toBe("{}");
    expect(bundle.assetManifestJson?.toString()).toBe("{}");
    expect(bundle.assets.map((a) => a.relativePath)).toEqual(["hyperframes/assets/logo.png"]);
  });

  it("accepts a folder dropped at its hyperframes root (no leading segment)", () => {
    const bundle = prepareImportedBundle([file("index.html", VALID_INDEX), file("output.mp4", "mp4")]);
    expect(bundle.indexHtml.toString()).toBe(VALID_INDEX);
    expect(bundle.outputMp4.toString()).toBe("mp4");
  });

  it("throws when index.html is missing", () => {
    expect(() => prepareImportedBundle([file("hyperframes/output.mp4", "mp4")])).toThrow(ImportValidationError);
  });

  it("throws when output.mp4 is missing", () => {
    expect(() => prepareImportedBundle([file("hyperframes/index.html", VALID_INDEX)])).toThrow(/output\.mp4/);
  });

  it("throws when the composition fails lint", () => {
    expect(() =>
      prepareImportedBundle([file("hyperframes/index.html", "<html></html>"), file("hyperframes/output.mp4", "mp4")]),
    ).toThrow(/editable/i);
  });

  it("rejects unsafe paths", () => {
    expect(() =>
      prepareImportedBundle([file("../escape/index.html", VALID_INDEX), file("hyperframes/output.mp4", "mp4")]),
    ).toThrow(ImportValidationError);
  });
});

describe("synthesizeImportRequest", () => {
  it("derives fields from a valid manifest", () => {
    const manifest = Buffer.from(
      JSON.stringify({
        productUrl: "https://www.longcut.ai/",
        sourceRepoUrl: "https://github.com/SamuelZ12/longcut",
        durationCapSeconds: 20,
        aspectRatio: "16:9",
      }),
    );
    const req = synthesizeImportRequest(manifest, "job-1");
    expect(req.repoUrl).toBe("https://github.com/SamuelZ12/longcut");
    expect(req.productUrl).toBe("https://www.longcut.ai/");
    expect(req.durationCapSeconds).toBe(20);
    expect(req.renderer).toBe("hyperframes");
    expect(req.mode).toBe("ai-url-planning");
  });

  it("falls back to valid placeholders when manifest is absent or invalid", () => {
    const req = synthesizeImportRequest(undefined, "job-2");
    expect(() => new URL(req.productUrl)).not.toThrow();
    expect(req.repoUrl.startsWith("https://github.com/")).toBe(true);
    expect(req.durationCapSeconds).toBeGreaterThan(0);
    expect(req.aspectRatio).toBe("16:9");
  });

  it("falls back per-field when only some manifest fields are valid", () => {
    const manifest = Buffer.from(JSON.stringify({ aspectRatio: "9:16", productUrl: "not-a-url" }));
    const req = synthesizeImportRequest(manifest, "job-3");
    expect(req.aspectRatio).toBe("9:16");
    expect(() => new URL(req.productUrl)).not.toThrow();
  });
});

describe("writeImportedBundle + buildImportedHyperframesResult", () => {
  it("writes the hyperframes layout and indexes composition + video artifacts", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "import-"));
    const bundle = {
      indexHtml: Buffer.from(VALID_INDEX),
      outputMp4: Buffer.from("mp4"),
      manifestJson: Buffer.from("{}"),
      assets: [{ relativePath: "hyperframes/assets/logo.png", content: Buffer.from("png") }],
    };
    const paths = await writeImportedBundle(outputRoot, bundle);
    expect(await readFile(join(outputRoot, "hyperframes/index.html"), "utf8")).toBe(VALID_INDEX);
    expect(await readFile(join(outputRoot, "hyperframes/output.mp4"), "utf8")).toBe("mp4");
    expect(await readFile(join(outputRoot, "hyperframes/assets/logo.png"), "utf8")).toBe("png");

    const result = buildImportedHyperframesResult({ jobId: "job-1", outputRoot, artifactPaths: paths });
    expect(result.method).toBe("hyperframes");
    if (result.method !== "hyperframes") throw new Error("unreachable");
    expect(result.composition.indexArtifact.url).toBe("/api/jobs/job-1/artifacts/hyperframes/index.html");
    expect(result.composition.outputVideoArtifact.url).toBe("/api/jobs/job-1/artifacts/hyperframes/output.mp4");
  });
});
