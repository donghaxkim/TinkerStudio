import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  AiUrlPlanningCreateDemoRequestSchema,
  PublicGithubRepoUrlSchema,
  PublicUrlSchema,
  type AiUrlPlanningCreateDemoRequest,
  type ApiArtifact,
  type ApiArtifactKind,
  type ApiGenerationResult,
} from "@tinker/generation-contract";
import { AspectRatioSchema } from "@tinker/project-schema";
import { lintComposition } from "../edit/compositionLint.js";
import { indexArtifacts } from "./artifactIndex.js";

export type ImportFile = { relativePath: string; content: Buffer };

export class ImportValidationError extends Error {}

export type PreparedBundle = {
  indexHtml: Buffer;
  outputMp4: Buffer;
  manifestJson?: Buffer;
  assetManifestJson?: Buffer;
  assets: ImportFile[];
};

function normalize(relativePath: string): string {
  return relativePath.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function isUnsafe(rawPath: string, normalized: string): boolean {
  const lower = rawPath.toLowerCase();
  return (
    normalized.length === 0 ||
    normalized.includes("\0") ||
    lower.includes("%2f") ||
    lower.includes("%5c") ||
    /^[A-Za-z]:(?:$|[\\/])/.test(normalized) ||
    normalized.startsWith("/") ||
    normalized.split("/").includes("..")
  );
}

function isRevision(path: string): boolean {
  return path.split("/").includes("revisions");
}

/** Picks the shortest path matching `suffix` exactly or as a `/`-bounded suffix. */
function findShortest(candidates: ImportFile[], suffix: string): ImportFile | undefined {
  return candidates
    .filter((f) => f.relativePath === suffix || f.relativePath.endsWith(`/${suffix}`))
    .sort((a, b) => a.relativePath.length - b.relativePath.length)[0];
}

export function prepareImportedBundle(files: ImportFile[]): PreparedBundle {
  const normalized: ImportFile[] = files.map((f) => {
    const relativePath = normalize(f.relativePath);
    if (isUnsafe(f.relativePath, relativePath)) {
      throw new ImportValidationError(`Unsafe file path in upload: ${f.relativePath}`);
    }
    return { relativePath, content: f.content };
  });
  const usable = normalized.filter((f) => !isRevision(f.relativePath));

  const index = findShortest(usable, "hyperframes/index.html") ?? findShortest(usable, "index.html");
  if (index === undefined) {
    throw new ImportValidationError("Couldn't find hyperframes/index.html in the uploaded folder.");
  }
  const lint = lintComposition(index.content.toString("utf8"));
  if (!lint.ok) {
    throw new ImportValidationError(`Uploaded composition isn't editable: ${lint.issues.join("; ")}`);
  }

  const output = findShortest(usable, "hyperframes/output.mp4") ?? findShortest(usable, "output.mp4");
  if (output === undefined) {
    throw new ImportValidationError("Couldn't find hyperframes/output.mp4 in the uploaded folder.");
  }

  const manifest = findShortest(usable, "hyperframes/generation-manifest.json") ?? findShortest(usable, "generation-manifest.json");
  const assetManifest = findShortest(usable, "hyperframes/asset-manifest.json") ?? findShortest(usable, "asset-manifest.json");
  const assets = usable
    .filter((f) => /(^|\/)hyperframes\/assets\//.test(f.relativePath))
    .map((f) => ({
      relativePath: `hyperframes/assets/${f.relativePath.split("hyperframes/assets/")[1]!}`,
      content: f.content,
    }));

  return {
    indexHtml: index.content,
    outputMp4: output.content,
    ...(manifest === undefined ? {} : { manifestJson: manifest.content }),
    ...(assetManifest === undefined ? {} : { assetManifestJson: assetManifest.content }),
    assets,
  };
}

const DEFAULTS = {
  repoUrl: "https://github.com/tinker-studio/imported-demo",
  productUrl: "https://imported.tinker.studio",
  durationCapSeconds: 30,
  aspectRatio: "16:9" as const,
};

function readManifest(manifestJson: Buffer | undefined): Record<string, unknown> {
  if (manifestJson === undefined) return {};
  try {
    const parsed: unknown = JSON.parse(manifestJson.toString("utf8"));
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function synthesizeImportRequest(manifestJson: Buffer | undefined, id: string): AiUrlPlanningCreateDemoRequest {
  const manifest = readManifest(manifestJson);
  const repo = PublicGithubRepoUrlSchema.safeParse(manifest.sourceRepoUrl);
  const product = PublicUrlSchema.safeParse(manifest.productUrl);
  const duration = typeof manifest.durationCapSeconds === "number" && manifest.durationCapSeconds > 0 ? manifest.durationCapSeconds : undefined;
  const aspect = AspectRatioSchema.safeParse(manifest.aspectRatio);

  return AiUrlPlanningCreateDemoRequestSchema.parse({
    id,
    mode: "ai-url-planning",
    repoUrl: repo.success ? repo.data : DEFAULTS.repoUrl,
    productUrl: product.success ? product.data : DEFAULTS.productUrl,
    durationCapSeconds: duration ?? DEFAULTS.durationCapSeconds,
    aspectRatio: aspect.success ? aspect.data : DEFAULTS.aspectRatio,
    renderer: "hyperframes",
    hyperframesAgent: "claude",
  });
}

export async function writeImportedBundle(outputRoot: string, bundle: PreparedBundle): Promise<string[]> {
  const hyperframesDir = join(outputRoot, "hyperframes");
  await mkdir(hyperframesDir, { recursive: true });

  const writes: ImportFile[] = [
    { relativePath: "hyperframes/index.html", content: bundle.indexHtml },
    { relativePath: "hyperframes/output.mp4", content: bundle.outputMp4 },
    ...(bundle.manifestJson ? [{ relativePath: "hyperframes/generation-manifest.json", content: bundle.manifestJson }] : []),
    ...(bundle.assetManifestJson ? [{ relativePath: "hyperframes/asset-manifest.json", content: bundle.assetManifestJson }] : []),
    ...bundle.assets,
  ];

  const paths: string[] = [];
  for (const w of writes) {
    const full = join(outputRoot, w.relativePath);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, w.content);
    paths.push(full);
  }
  return paths;
}

function requireArtifact(artifacts: ApiArtifact[], kind: ApiArtifactKind): ApiArtifact {
  const artifact = artifacts.find((a) => a.kind === kind);
  if (artifact === undefined) throw new Error(`Imported job is missing required ${kind} artifact`);
  return artifact;
}

export function buildImportedHyperframesResult(input: { jobId: string; outputRoot: string; artifactPaths: string[] }): ApiGenerationResult {
  const artifacts = indexArtifacts({ jobId: input.jobId, outputRoot: input.outputRoot, artifactPaths: input.artifactPaths });
  const generationManifestArtifact = artifacts.find((a) => a.kind === "generation-manifest");
  const assetManifestArtifact = artifacts.find((a) => a.kind === "asset-manifest");
  return {
    method: "hyperframes",
    composition: {
      indexArtifact: requireArtifact(artifacts, "composition-index"),
      outputVideoArtifact: requireArtifact(artifacts, "output-video"),
      ...(generationManifestArtifact === undefined ? {} : { generationManifestArtifact }),
      ...(assetManifestArtifact === undefined ? {} : { assetManifestArtifact }),
    },
    artifacts,
    warnings: [],
  };
}
