import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import {
  ContinuePlanningSessionRequestSchema,
  CreatePlanningSessionRequestSchema,
  GenerationErrorSchema,
} from "@tinker/generation-contract";
import type { PlanningSessionStore } from "../planning/planningSessionStore.js";
import { readValidatedOutline, type PlanningAgentRunner } from "../planning/planningRunner.js";
import { resolveProductUrlFromGithubRepo, type ProductUrlResolver } from "./jobs.js";

export type PlanningSessionsRoutesOptions = {
  store: PlanningSessionStore;
  repoRoot: string;
  now: () => string;
  idGenerator: () => string;
  runner: PlanningAgentRunner;
  /** Derives a product URL from the repo when the client omits one (repo-first planning). */
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

function errorMessage(error: unknown) {
  return error instanceof Error && error.message.trim() !== "" ? error.message : "Planning runner failed.";
}

function validatedResumeHandle(agentResumeHandle: string | undefined) {
  const trimmed = agentResumeHandle?.trim();
  if (trimmed === undefined || trimmed === "") {
    throw new Error("Planning runner must return a non-empty resume handle.");
  }
  return trimmed;
}

export function registerPlanningSessionsRoutes(server: FastifyInstance, options: PlanningSessionsRoutesOptions) {
  // Polled by the client to stream planning progress while the create request is in flight.
  server.get<{ Params: { id: string } }>("/api/planning-sessions/:id", async (request, reply) => {
    const snapshot = options.store.getSnapshot(request.params.id);
    if (snapshot === undefined) {
      return reply.status(404).send({ message: "Planning session not found" });
    }
    return snapshot;
  });

  server.post("/api/planning-sessions", async (request, reply) => {
    const parsed = CreatePlanningSessionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send(validationError(formatZodIssues(parsed.error.issues)));
    }

    const id = parsed.data.id ?? options.idGenerator();
    // Repo-first: derive a product URL from the repo when one was not supplied.
    // Planning still proceeds repo-only when nothing can be derived.
    const productUrl =
      parsed.data.productUrl ?? (await (options.productUrlResolver ?? resolveProductUrlFromGithubRepo)(parsed.data.repoUrl));
    const workspaceRoot = resolve(options.repoRoot, "generated", "planning", id);
    const outlinePath = resolve(workspaceRoot, "outline.json");
    options.store.create({
      id,
      ...(productUrl === undefined ? {} : { productUrl }),
      repoUrl: parsed.data.repoUrl,
      agent: parsed.data.agent,
      workspaceRoot,
      outlinePath,
      now: options.now(),
    });

    try {
      options.store.markRunning(id, options.now());
      await mkdir(workspaceRoot, { recursive: true });
      const result = await options.runner({
        kind: "initial",
        ...(productUrl === undefined ? {} : { productUrl }),
        repoUrl: parsed.data.repoUrl,
        agent: parsed.data.agent,
        workspaceRoot,
        outlinePath,
        onProgress: (stage, status) => options.store.setProgress(id, stage, status, options.now()),
      });
      const outlineResult = await readValidatedOutline(outlinePath);
      options.store.markReady(id, { ...result, agentResumeHandle: validatedResumeHandle(result.agentResumeHandle), ...outlineResult }, options.now());
      return reply.status(201).send(options.store.getSnapshot(id));
    } catch (error) {
      options.store.markError(id, errorMessage(error), options.now());
      return reply.status(500).send(options.store.getSnapshot(id));
    }
  });

  server.post<{ Params: { id: string } }>("/api/planning-sessions/:id/messages", async (request, reply) => {
    const record = options.store.getRecord(request.params.id);
    if (record === undefined) {
      return reply.status(404).send({ message: "Planning session not found" });
    }

    if (record.status === "starting" || record.status === "running") {
      return reply.status(409).send({ message: "Planning session is already running" });
    }

    const agentResumeHandle = record.agentResumeHandle;
    if (agentResumeHandle === undefined) {
      return reply.status(409).send({ message: "Planning session cannot be resumed" });
    }

    const parsed = ContinuePlanningSessionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send(validationError(formatZodIssues(parsed.error.issues)));
    }

    options.store.appendUserMessage(record.id, parsed.data.message, options.now());

    try {
      options.store.markRunning(record.id, options.now());
      const result = await options.runner({
        kind: "followup",
        ...(record.productUrl === undefined ? {} : { productUrl: record.productUrl }),
        repoUrl: record.repoUrl,
        agent: record.agent,
        workspaceRoot: record.workspaceRoot,
        outlinePath: record.outlinePath,
        message: parsed.data.message,
        agentResumeHandle,
        onProgress: (stage, status) => options.store.setProgress(record.id, stage, status, options.now()),
      });
      const outlineResult = await readValidatedOutline(record.outlinePath);
      options.store.markReady(record.id, { ...result, agentResumeHandle: validatedResumeHandle(result.agentResumeHandle), ...outlineResult }, options.now());
      return reply.status(200).send(options.store.getSnapshot(record.id));
    } catch (error) {
      options.store.markError(record.id, errorMessage(error), options.now());
      return reply.status(500).send(options.store.getSnapshot(record.id));
    }
  });
}
