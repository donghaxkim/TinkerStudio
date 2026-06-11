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

const absoluteVideoRoot = await mkdtemp(join(tmpdir(), "tinker-hyperframes-absolute-video-"));
const absoluteVideoDir = join(absoluteVideoRoot, "hyperframes");
await mkdir(absoluteVideoDir, { recursive: true });
await writeFile(join(absoluteVideoDir, "index.html"), "<html></html>\n");
await writeFile(join(absoluteVideoDir, "asset-manifest.json"), JSON.stringify({ assets: [] }));
await writeFile(
  join(absoluteVideoDir, "generation-manifest.json"),
  JSON.stringify({
    renderer: "hyperframes",
    productUrl: "https://example.com",
    sourceRepoUrl: "https://github.com/example/product",
    durationCapSeconds: 12,
    aspectRatio: "16:9",
    sourceGrounding: ["repo"],
    outputVideoPath: join(tmpdir(), "outside.mp4"),
  }),
);
await assert.rejects(
  () =>
    validateHyperframesArtifacts({
      hyperframesDir: absoluteVideoDir,
      productUrl: "https://example.com",
      repoUrl: "https://github.com/example/product",
    }),
  /outputVideoPath must stay inside the Hyperframes directory/,
);

const absoluteAssetRoot = await mkdtemp(join(tmpdir(), "tinker-hyperframes-absolute-asset-"));
const absoluteAssetDir = join(absoluteAssetRoot, "hyperframes");
await mkdir(absoluteAssetDir, { recursive: true });
await writeFile(join(absoluteAssetDir, "index.html"), "<html></html>\n");
await writeFile(
  join(absoluteAssetDir, "asset-manifest.json"),
  JSON.stringify({
    assets: [
      {
        id: "logo-primary",
        type: "logo",
        sourcePath: "public/logo.svg",
        outputPath: join(tmpdir(), "logo.svg"),
        evidence: "Primary logo from public assets.",
      },
    ],
  }),
);
await writeFile(
  join(absoluteAssetDir, "generation-manifest.json"),
  JSON.stringify({
    renderer: "hyperframes",
    productUrl: "https://example.com",
    sourceRepoUrl: "https://github.com/example/product",
    durationCapSeconds: 12,
    aspectRatio: "16:9",
    sourceGrounding: ["repo"],
    outputVideoPath: "output.mp4",
  }),
);
await assert.rejects(
  () =>
    validateHyperframesArtifacts({
      hyperframesDir: absoluteAssetDir,
      productUrl: "https://example.com",
      repoUrl: "https://github.com/example/product",
    }),
  /asset outputPath must stay inside the Hyperframes directory/,
);

for (const forbiddenArtifactPath of [
  "node_modules/.bin/hyperframes",
  "Node_Modules/.bin/hyperframes",
  "package.json",
  "Package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "PNPM-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  ".npmrc",
]) {
  const forbiddenRoot = await mkdtemp(join(tmpdir(), "tinker-hyperframes-forbidden-artifact-"));
  const forbiddenDir = join(forbiddenRoot, "hyperframes");
  await mkdir(join(forbiddenDir, "assets"), { recursive: true });
  await writeFile(join(forbiddenDir, "index.html"), "<html></html>\n");
  await writeFile(join(forbiddenDir, "asset-manifest.json"), JSON.stringify({ assets: [] }));
  await writeFile(
    join(forbiddenDir, "generation-manifest.json"),
    JSON.stringify({
      renderer: "hyperframes",
      productUrl: "https://example.com",
      sourceRepoUrl: "https://github.com/example/product",
      durationCapSeconds: 12,
      aspectRatio: "16:9",
      sourceGrounding: ["repo"],
      outputVideoPath: "output.mp4",
    }),
  );
  await mkdir(join(forbiddenDir, forbiddenArtifactPath, ".."), { recursive: true });
  await writeFile(join(forbiddenDir, forbiddenArtifactPath), "forbidden\n");

  await assert.rejects(
    () =>
      validateHyperframesArtifacts({
        hyperframesDir: forbiddenDir,
        productUrl: "https://example.com",
        repoUrl: "https://github.com/example/product",
      }),
    /forbidden generated Hyperframes artifact/,
  );
}

console.log("hyperframes artifact tests passed");
