import { constants } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import {
  AiUrlPlanningCreateDemoRequestSchema,
  ApiGenerationMethodSchema,
  EditCompositionRequestBodySchema,
  GenerationErrorSchema,
  type AiUrlPlanningCreateDemoRequest,
  type ApiArtifact,
  type ApiArtifactKind,
  type ApiGenerationJob,
  type ApiGenerationResult,
} from "@tinker/generation-contract";
import { indexArtifacts } from "../jobs/artifactIndex.js";
import type { JobStore } from "../jobs/jobStore.js";
import type { JobQueue } from "../server.js";

export type ProductUrlResolver = (repoUrl: string) => Promise<string | undefined>;

export type JobsRoutesOptions = {
  store: JobStore;
  queue: JobQueue;
  repoRoot: string;
  now: () => string;
  idGenerator: () => string;
  productUrlResolver?: ProductUrlResolver;
};

function validationError(message: string) {
  return GenerationErrorSchema.parse({ status: "failed", stage: "validation", message });
}

function formatZodIssues(issues: Array<{ path: PropertyKey[]; message: string }>) {
  return issues
    .map((issue) => `${issue.path.length === 0 ? "request" : issue.path.map(String).join(".")}: ${issue.message}`)
    .join("; ");
}

function requestBodyWithoutClientId(body: unknown) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return body;
  }

  const { id: _id, ...requestBody } = body as Record<string, unknown>;
  return requestBody;
}

const RestorableHyperframesArtifactPaths = [
  "hyperframes/index.html",
  "hyperframes/output.mp4",
  "hyperframes/asset-manifest.json",
  "hyperframes/generation-manifest.json",
  "hyperframes/lint.log",
  "hyperframes/render.log",
  "hyperframes/product-analysis.png",
  "product-analysis.json",
  "product-analysis.png",
  "repo-analysis.json",
];

const ApiJobCreateRequestBodySchema = AiUrlPlanningCreateDemoRequestSchema.omit({
  id: true,
  outputDirectory: true,
  renderer: true,
  productUrl: true,
})
  .extend({
    productUrl: AiUrlPlanningCreateDemoRequestSchema.shape.productUrl.optional(),
    renderer: ApiGenerationMethodSchema.optional(),
  })
  .strict();

function parseGithubRepo(repoUrl: string) {
  const url = new URL(repoUrl);
  const [, owner, repo] = url.pathname.split("/");
  if (owner === undefined || repo === undefined) return undefined;
  return { owner, repo: repo.endsWith(".git") ? repo.slice(0, -4) : repo };
}

function isSafeLocalJobId(id: string) {
  return id.length > 0 && !id.includes("/") && !id.includes("\\") && !id.includes("\0") && id !== "." && id !== "..";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function candidateOutputRoots(repoRoot: string, id: string) {
  return [
    resolve(repoRoot, "generated", "local-job", id),
    resolve(repoRoot, "packages", "generated", "local-job", id),
  ];
}

async function pathExists(path: string) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function pathIsFile(path: string) {
  const fileStat = await stat(path).catch(() => undefined);
  return fileStat?.isFile() === true;
}

function hasDriveLetterPrefix(path: string) {
  return /^[A-Za-z]:(?:$|[\\/])/.test(path);
}

function hasParentSegment(path: string) {
  return path.split(/[\\/]+/).includes("..");
}

function isInsideDirectory(root: string, filePath: string) {
  const relativePath = relative(root, filePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function pathVariants(value: string) {
  const variants = [value];
  let current = value;
  for (let i = 0; i < 5 && current.includes("%"); i += 1) {
    try {
      current = decodeURIComponent(current);
    } catch {
      return undefined;
    }
    variants.push(current);
  }
  return variants;
}

function safeHyperframesManifestOutputPath(outputRoot: string, outputPath: string) {
  const trimmed = outputPath.trim();
  if (trimmed.length === 0 || trimmed.includes("\0")) return undefined;

  const variants = pathVariants(trimmed);
  if (variants === undefined) return undefined;
  for (const variant of variants) {
    if (variant.includes("\0") || isAbsolute(variant) || hasDriveLetterPrefix(variant) || hasParentSegment(variant)) {
      return undefined;
    }
  }

  const hyperframesRoot = resolve(outputRoot, "hyperframes");
  const artifactPath = resolve(hyperframesRoot, trimmed);
  return isInsideDirectory(hyperframesRoot, artifactPath) ? artifactPath : undefined;
}

async function manifestDeclaredHyperframesArtifactPaths(outputRoot: string) {
  let manifest: unknown;
  try {
    manifest = JSON.parse(await readFile(join(outputRoot, "hyperframes", "asset-manifest.json"), "utf8")) as unknown;
  } catch {
    return [];
  }
  if (!isRecord(manifest) || !Array.isArray(manifest.assets)) return [];

  const paths: string[] = [];
  for (const asset of manifest.assets) {
    if (!isRecord(asset) || typeof asset.outputPath !== "string") continue;
    const artifactPath = safeHyperframesManifestOutputPath(outputRoot, asset.outputPath);
    if (artifactPath !== undefined && (await pathIsFile(artifactPath))) paths.push(artifactPath);
  }
  return paths;
}

async function existingRestorableArtifactPaths(outputRoot: string) {
  const paths = new Set<string>();
  for (const relativePath of RestorableHyperframesArtifactPaths) {
    const artifactPath = join(outputRoot, relativePath);
    if (await pathExists(artifactPath)) paths.add(artifactPath);
  }
  for (const artifactPath of await manifestDeclaredHyperframesArtifactPaths(outputRoot)) {
    paths.add(artifactPath);
  }
  return [...paths];
}

function requireArtifact(artifacts: ApiArtifact[], kind: ApiArtifactKind) {
  const artifact = artifacts.find((candidate) => candidate.kind === kind);
  if (artifact === undefined) {
    throw new Error(`Restored job is missing required ${kind} artifact`);
  }
  return artifact;
}

function optionalArtifact(artifacts: ApiArtifact[], kind: ApiArtifactKind) {
  return artifacts.find((candidate) => candidate.kind === kind);
}

function buildRestoredHyperframesResult(artifacts: ApiArtifact[]): ApiGenerationResult {
  const generationManifestArtifact = optionalArtifact(artifacts, "generation-manifest");
  const assetManifestArtifact = optionalArtifact(artifacts, "asset-manifest");
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

async function readGenerationManifest(outputRoot: string) {
  try {
    const parsed = JSON.parse(await readFile(join(outputRoot, "hyperframes", "generation-manifest.json"), "utf8")) as unknown;
    if (!isRecord(parsed)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

async function restoreCompletedHyperframesJob(id: string, options: JobsRoutesOptions): Promise<ApiGenerationJob | undefined> {
  if (!isSafeLocalJobId(id)) return undefined;

  for (const outputRoot of candidateOutputRoots(options.repoRoot, id)) {
    const manifest = await readGenerationManifest(outputRoot);
    if (manifest === undefined || manifest.renderer !== "hyperframes") continue;

    const requestResult = AiUrlPlanningCreateDemoRequestSchema.safeParse({
      id,
      mode: "ai-url-planning",
      repoUrl: manifest.sourceRepoUrl,
      productUrl: manifest.productUrl,
      durationCapSeconds: manifest.durationCapSeconds,
      aspectRatio: manifest.aspectRatio,
      renderer: "hyperframes",
      hyperframesAgent: "opencode",
    });
    if (!requestResult.success) continue;

    const artifactPaths = await existingRestorableArtifactPaths(outputRoot);
    const artifacts = indexArtifacts({ jobId: id, outputRoot, artifactPaths });
    let result: ApiGenerationResult;
    try {
      result = buildRestoredHyperframesResult(artifacts);
    } catch {
      continue;
    }

    options.store.create({ id, request: requestResult.data, outputRoot, now: options.now() });
    options.store.complete(id, result, options.now());
    return options.store.getSnapshot(id);
  }

  return undefined;
}

function isPublicHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

async function readGithubJson(url: string): Promise<unknown | undefined> {
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "tinker-local-api",
      },
    });
    if (!response.ok) return undefined;
    return response.json();
  } catch {
    return undefined;
  }
}

function homepageFromPackageContents(value: unknown) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const content = (value as { content?: unknown }).content;
  if (typeof content !== "string") return undefined;
  try {
    const pkg = JSON.parse(Buffer.from(content.replace(/\s/g, ""), "base64").toString("utf8")) as { homepage?: unknown };
    return isPublicHttpUrl(pkg.homepage) ? pkg.homepage : undefined;
  } catch {
    return undefined;
  }
}

export async function resolveProductUrlFromGithubRepo(repoUrl: string): Promise<string | undefined> {
  const repo = parseGithubRepo(repoUrl);
  if (repo === undefined) return undefined;

  const apiBase = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`;
  const metadata = await readGithubJson(apiBase);
  if (metadata !== undefined && typeof metadata === "object" && !Array.isArray(metadata)) {
    const homepage = (metadata as { homepage?: unknown }).homepage;
    if (isPublicHttpUrl(homepage)) return homepage;
  }

  const packageJson = await readGithubJson(`${apiBase}/contents/package.json`);
  return homepageFromPackageContents(packageJson);
}

export function registerJobsRoutes(server: FastifyInstance, options: JobsRoutesOptions) {
  server.post("/api/jobs", async (request, reply) => {
    const parsed = ApiJobCreateRequestBodySchema.safeParse(requestBodyWithoutClientId(request.body));
    if (!parsed.success) {
      return reply.status(422).send(validationError(formatZodIssues(parsed.error.issues)));
    }

    const productUrl = parsed.data.productUrl ?? (await (options.productUrlResolver ?? resolveProductUrlFromGithubRepo)(parsed.data.repoUrl));
    if (productUrl === undefined) {
      return reply
        .status(422)
        .send(validationError("Could not derive a product URL from this GitHub repo. Add a public homepage or package.json homepage URL."));
    }

    if (!options.queue.hasCapacity()) {
      return reply.status(429).send({ message: "Generation queue is full" });
    }

    const id = options.idGenerator();
    const renderer = parsed.data.renderer ?? "playwright";
    const acceptedRequestResult = AiUrlPlanningCreateDemoRequestSchema.safeParse({
      id,
      mode: "ai-url-planning",
      repoUrl: parsed.data.repoUrl,
      productUrl,
      durationCapSeconds: parsed.data.durationCapSeconds,
      aspectRatio: parsed.data.aspectRatio,
      renderer,
      hyperframesAgent: parsed.data.hyperframesAgent,
      ...(parsed.data.prompt === undefined ? {} : { prompt: parsed.data.prompt }),
      ...(parsed.data.approvedOutline === undefined ? {} : { approvedOutline: parsed.data.approvedOutline }),
    });
    if (!acceptedRequestResult.success) {
      return reply.status(422).send(validationError(formatZodIssues(acceptedRequestResult.error.issues)));
    }
    const acceptedRequest: AiUrlPlanningCreateDemoRequest = acceptedRequestResult.data;
    const outputRoot = resolve(options.repoRoot, "generated", "local-job", id);
    const snapshot = options.store.create({ id, request: acceptedRequest, outputRoot, now: options.now() });

    if (!options.queue.enqueue(id)) {
      return reply.status(429).send({ message: "Generation queue is full" });
    }

    return reply.status(202).send(snapshot);
  });

  server.get<{ Params: { id: string } }>("/api/jobs/:id", async (request, reply) => {
    const snapshot = options.store.getSnapshot(request.params.id) ?? (await restoreCompletedHyperframesJob(request.params.id, options));
    if (snapshot === undefined) {
      return reply.status(404).send({ message: "Job not found" });
    }

    return snapshot;
  });

  server.post<{ Params: { id: string } }>("/api/jobs/:id/edits", async (request, reply) => {
    const job = options.store.getRecord(request.params.id);
    if (job === undefined) {
      return reply.status(404).send({ message: "Job not found" });
    }
    const parsed = EditCompositionRequestBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send(validationError(formatZodIssues(parsed.error.issues)));
    }
    if (!options.queue.hasCapacity()) {
      return reply.status(429).send({ message: "Generation queue is full" });
    }
    const revId = options.idGenerator();
    options.store.setPendingEdit(request.params.id, { revId, instruction: parsed.data.instruction, context: parsed.data.context });
    if (!options.queue.enqueue(request.params.id)) {
      return reply.status(429).send({ message: "Generation queue is full" });
    }
    return reply.status(202).send(options.store.getSnapshot(request.params.id));
  });

  server.post<{ Params: { id: string; revId: string } }>("/api/jobs/:id/revisions/:revId/render", async (request, reply) => {
    const job = options.store.getRecord(request.params.id);
    if (job === undefined) return reply.status(404).send({ message: "Job not found" });
    if (!(job.revisions ?? []).some((r) => r.id === request.params.revId && r.status === "completed")) {
      return reply.status(404).send({ message: "Revision not found or not ready to render" });
    }
    if (!options.queue.hasCapacity()) return reply.status(429).send({ message: "Generation queue is full" });
    options.store.setPendingRender(request.params.id, { revId: request.params.revId });
    if (!options.queue.enqueue(request.params.id)) return reply.status(429).send({ message: "Generation queue is full" });
    return reply.status(202).send(options.store.getSnapshot(request.params.id));
  });
}
