import { randomBytes } from "node:crypto";
import cors from "@fastify/cors";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import type { ApiConfig } from "./config.js";
import { createJobQueue } from "./jobs/jobQueue.js";
import { createJobStore } from "./jobs/jobStore.js";
import { createClaudePlanningAgentRunner } from "./planning/claudePlanningAgent.js";
import { createPlanningSessionStore } from "./planning/planningSessionStore.js";
import type { PlanningAgentRunner } from "./planning/planningRunner.js";
import { registerArtifactsRoutes } from "./routes/artifacts.js";
import { registerJobsRoutes, type ProductUrlResolver } from "./routes/jobs.js";
import { registerPlanningSessionsRoutes } from "./routes/planningSessions.js";
import { createGenerationWorker, type GenerationRunner } from "./workers/generationWorker.js";

export type JobQueue = ReturnType<typeof createJobQueue>;

export type BuildServerOptions = {
  config: ApiConfig;
  runner?: GenerationRunner;
  now?: () => string;
  idGenerator?: () => string;
  maxPendingJobs?: number;
  productUrlResolver?: ProductUrlResolver;
  planningRunner?: PlanningAgentRunner;
};

function defaultIdGenerator() {
  return `job-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}

export async function buildServer(options: BuildServerOptions): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });
  const now = options.now ?? (() => new Date().toISOString());
  const idGenerator = options.idGenerator ?? defaultIdGenerator;
  const store = createJobStore();
  const planningStore = createPlanningSessionStore();
  const generationWorker = createGenerationWorker({ store, runner: options.runner, now });
  const queue = createJobQueue({ maxPendingJobs: options.maxPendingJobs ?? 10, runJob: generationWorker });

  await server.register(cors, {
    origin: options.config.corsOrigins,
  });

  server.get("/health", async () => ({ ok: true }));

  server.setErrorHandler((error: FastifyError, _request, reply) => {
    const isMalformedJsonBody = error.code === "FST_ERR_CTP_INVALID_JSON_BODY";
    const errorStatusCode = error.statusCode;
    const hasHttpErrorStatus = typeof errorStatusCode === "number" && errorStatusCode >= 400 && errorStatusCode <= 599;
    const statusCode = isMalformedJsonBody ? 400 : hasHttpErrorStatus ? errorStatusCode : 500;
    const message = isMalformedJsonBody ? "Malformed JSON body" : statusCode < 500 ? error.message : "Internal server error";
    void reply.status(statusCode).send({ message });
  });

  registerJobsRoutes(server, {
    store,
    queue,
    repoRoot: options.config.repoRoot,
    now,
    idGenerator,
    productUrlResolver: options.productUrlResolver,
    cancelJob: generationWorker.cancel,
  });
  registerPlanningSessionsRoutes(server, {
    store: planningStore,
    repoRoot: options.config.repoRoot,
    now,
    idGenerator,
    runner: options.planningRunner ?? createClaudePlanningAgentRunner(),
  });
  registerArtifactsRoutes(server, { store });

  return server;
}
