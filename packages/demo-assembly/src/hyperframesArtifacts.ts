import { access, readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";

const assetManifestSchema = z
  .object({
    assets: z.array(
      z
        .object({
          id: z.string().trim().min(1),
          type: z.string().trim().min(1),
          sourcePath: z.string().trim().min(1),
          outputPath: z.string().trim().min(1),
          evidence: z.string().trim().min(1),
        })
        .strict(),
    ),
  })
  .strict();

const generationManifestSchema = z
  .object({
    renderer: z.literal("hyperframes"),
    productUrl: z.string().url(),
    sourceRepoUrl: z.string().url(),
    durationCapSeconds: z.number().positive(),
    aspectRatio: z.enum(["16:9", "9:16", "1:1"]),
    sourceGrounding: z.array(z.enum(["repo", "website-analysis"])).min(1),
    outputVideoPath: z.string().trim().min(1),
  })
  .strict();

export type HyperframesAssetManifest = z.infer<typeof assetManifestSchema>;
export type HyperframesGenerationManifest = z.infer<typeof generationManifestSchema>;

export type ValidateHyperframesArtifactsInput = {
  hyperframesDir: string;
  productUrl: string;
  repoUrl: string;
};

export type ValidatedHyperframesArtifacts = {
  indexPath: string;
  assetManifestPath: string;
  generationManifestPath: string;
  outputVideoPath: string;
  assetManifest: HyperframesAssetManifest;
  generationManifest: HyperframesGenerationManifest;
};

const FORBIDDEN_GENERATED_ARTIFACT_NAMES = new Set([
  ".npmrc",
  "bun.lock",
  "bun.lockb",
  "node_modules",
  "package-lock.json",
  "package.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

function formatZodIssues(error: z.ZodError) {
  return error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).join("; ");
}

function assertInside(parent: string, child: string, message: string) {
  const relativePath = relative(resolve(parent), resolve(child));
  if (relativePath === "" || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(message);
  }
}

async function readJson(path: string, malformedMessage: string) {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    throw new Error(malformedMessage, { cause: error });
  }
}

async function assertNoForbiddenGeneratedArtifacts(hyperframesDir: string) {
  const entries = await readdir(hyperframesDir, { recursive: true, withFileTypes: true });

  for (const entry of entries) {
    if (FORBIDDEN_GENERATED_ARTIFACT_NAMES.has(entry.name)) {
      throw new Error(`forbidden generated Hyperframes artifact: ${entry.name}`);
    }
  }
}

export async function validateHyperframesArtifacts(
  input: ValidateHyperframesArtifactsInput,
): Promise<ValidatedHyperframesArtifacts> {
  const hyperframesDir = resolve(input.hyperframesDir);
  const indexPath = join(hyperframesDir, "index.html");
  const assetManifestPath = join(hyperframesDir, "asset-manifest.json");
  const generationManifestPath = join(hyperframesDir, "generation-manifest.json");
  await assertNoForbiddenGeneratedArtifacts(hyperframesDir);

  try {
    await access(indexPath);
  } catch (error) {
    throw new Error("Hyperframes index.html is required", { cause: error });
  }

  const assetManifestResult = assetManifestSchema.safeParse(
    await readJson(assetManifestPath, "Hyperframes asset-manifest.json is malformed"),
  );
  if (!assetManifestResult.success) {
    throw new Error(`Hyperframes asset-manifest.json is invalid: ${formatZodIssues(assetManifestResult.error)}`);
  }

  const generationManifestResult = generationManifestSchema.safeParse(
    await readJson(generationManifestPath, "Hyperframes generation-manifest.json is malformed"),
  );
  if (!generationManifestResult.success) {
    throw new Error(
      `Hyperframes generation-manifest.json is invalid: ${formatZodIssues(generationManifestResult.error)}`,
    );
  }

  const generationManifest = generationManifestResult.data;
  if (generationManifest.productUrl !== input.productUrl) {
    throw new Error("Hyperframes generation-manifest.json productUrl must match analyzed product URL");
  }
  if (generationManifest.sourceRepoUrl !== input.repoUrl) {
    throw new Error("Hyperframes generation-manifest.json sourceRepoUrl must match requested repo URL");
  }

  for (const asset of assetManifestResult.data.assets) {
    if (isAbsolute(asset.outputPath)) {
      throw new Error("asset outputPath must stay inside the Hyperframes directory");
    }
    assertInside(
      hyperframesDir,
      join(hyperframesDir, asset.outputPath),
      "asset outputPath must stay inside the Hyperframes directory",
    );
  }

  if (isAbsolute(generationManifest.outputVideoPath)) {
    throw new Error("outputVideoPath must stay inside the Hyperframes directory");
  }
  const outputVideoPath = join(hyperframesDir, generationManifest.outputVideoPath);
  assertInside(hyperframesDir, outputVideoPath, "outputVideoPath must stay inside the Hyperframes directory");

  return {
    indexPath,
    assetManifestPath,
    generationManifestPath,
    outputVideoPath,
    assetManifest: assetManifestResult.data,
    generationManifest,
  };
}
