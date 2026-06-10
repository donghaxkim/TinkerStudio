import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateHyperframesArtifacts } from "./hyperframesArtifacts.js";

const root = await mkdtemp(join(tmpdir(), "tinker-hyperframes-artifacts-"));
const hyperframesDir = join(root, "hyperframes");
await mkdir(join(hyperframesDir, "assets"), { recursive: true });

await writeFile(join(hyperframesDir, "index.html"), "<html><body>Tinker</body></html>\n");
await writeFile(
  join(hyperframesDir, "asset-manifest.json"),
  JSON.stringify({
    assets: [
      {
        id: "logo-primary",
        type: "logo",
        sourcePath: "public/logo.svg",
        outputPath: "assets/logo.svg",
        evidence: "Primary logo from public assets.",
      },
    ],
  }),
);
await writeFile(join(hyperframesDir, "assets", "logo.svg"), "<svg />\n");
await writeFile(
  join(hyperframesDir, "generation-manifest.json"),
  JSON.stringify({
    renderer: "hyperframes",
    productUrl: "https://example.com",
    sourceRepoUrl: "https://github.com/example/product",
    durationCapSeconds: 12,
    aspectRatio: "16:9",
    sourceGrounding: ["repo", "website-analysis"],
    outputVideoPath: "output.mp4",
  }),
);

const result = await validateHyperframesArtifacts({
  hyperframesDir,
  productUrl: "https://example.com",
  repoUrl: "https://github.com/example/product",
});

assert.equal(result.indexPath, join(hyperframesDir, "index.html"));
assert.equal(result.assetManifestPath, join(hyperframesDir, "asset-manifest.json"));
assert.equal(result.generationManifestPath, join(hyperframesDir, "generation-manifest.json"));
assert.equal(result.outputVideoPath, join(hyperframesDir, "output.mp4"));

const missingRoot = await mkdtemp(join(tmpdir(), "tinker-hyperframes-missing-"));
await mkdir(join(missingRoot, "hyperframes"), { recursive: true });
await assert.rejects(
  () =>
    validateHyperframesArtifacts({
      hyperframesDir: join(missingRoot, "hyperframes"),
      productUrl: "https://example.com",
      repoUrl: "https://github.com/example/product",
    }),
  /index.html is required/,
);

const escapingRoot = await mkdtemp(join(tmpdir(), "tinker-hyperframes-escaping-"));
const escapingDir = join(escapingRoot, "hyperframes");
await mkdir(escapingDir, { recursive: true });
await writeFile(join(escapingDir, "index.html"), "<html></html>\n");
await writeFile(join(escapingDir, "asset-manifest.json"), JSON.stringify({ assets: [] }));
await writeFile(
  join(escapingDir, "generation-manifest.json"),
  JSON.stringify({
    renderer: "hyperframes",
    productUrl: "https://example.com",
    sourceRepoUrl: "https://github.com/example/product",
    durationCapSeconds: 12,
    aspectRatio: "16:9",
    sourceGrounding: ["repo"],
    outputVideoPath: "../outside.mp4",
  }),
);
await assert.rejects(
  () =>
    validateHyperframesArtifacts({
      hyperframesDir: escapingDir,
      productUrl: "https://example.com",
      repoUrl: "https://github.com/example/product",
    }),
  /outputVideoPath must stay inside the Hyperframes directory/,
);

console.log("hyperframes artifact tests passed");
