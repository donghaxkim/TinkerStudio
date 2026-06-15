import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import {
  AiUrlPlanningCreateDemoRequestSchema,
  AiUrlRendererSchema,
  EditCompositionRequestBodySchema,
  GenerationErrorSchema,
  type AiUrlPlanningCreateDemoRequest,
} from "@tinker/generation-contract";
import type { JobStore } from "../jobs/jobStore.js";
import type { JobQueue } from "../server.js";

export type JobsRoutesOptions = {
  store: JobStore;
  queue: JobQueue;
  repoRoot: string;
  now: () => string;
  idGenerator: () => string;
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
})
  .extend({
    renderer: AiUrlRendererSchema.optional(),
  })
  .strict();

export function registerJobsRoutes(server: FastifyInstance, options: JobsRoutesOptions) {
  server.post("/api/jobs", async (request, reply) => {
    const parsed = ApiJobCreateRequestBodySchema.safeParse(requestBodyWithoutClientId(request.body));
    if (!parsed.success) {
      return reply.status(422).send(validationError(formatZodIssues(parsed.error.issues)));
    }

    if (!options.queue.hasCapacity()) {
      return reply.status(429).send({ message: "Generation queue is full" });
    }

    const id = options.idGenerator();
    const renderer = parsed.data.renderer ?? "playwright";
    const acceptedRequest = {
      id,
      mode: "ai-url-planning",
      repoUrl: parsed.data.repoUrl,
      productUrl: parsed.data.productUrl,
      durationCapSeconds: parsed.data.durationCapSeconds,
      aspectRatio: parsed.data.aspectRatio,
      renderer,
      ...(parsed.data.prompt === undefined ? {} : { prompt: parsed.data.prompt }),
    } satisfies AiUrlPlanningCreateDemoRequest;
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
}
