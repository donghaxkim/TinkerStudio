import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import {
  AiUrlPlanningCreateDemoRequestSchema,
  ApiGenerationMethodSchema,
  EditCompositionRequestBodySchema,
  GenerationErrorSchema,
  type AiUrlPlanningCreateDemoRequest,
} from "@tinker/generation-contract";
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
    const snapshot = options.store.getSnapshot(request.params.id);
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
