import { randomBytes } from "node:crypto";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import type { ApiConfig } from "./config.js";
import { createJobQueue } from "./jobs/jobQueue.js";
import { createJobStore } from "./jobs/jobStore.js";
import { createClaudePlanningAgentRunner } from "./planning/claudePlanningAgent.js";
import { createPlanningSessionStore } from "./planning/planningSessionStore.js";
import type { PlanningAgentRunner } from "./planning/planningRunner.js";
import { registerArtifactsRoutes } from "./routes/artifacts.js";
import { registerImportRoutes } from "./routes/importComposition.js";
import { registerJobsRoutes, type ProductUrlResolver } from "./routes/jobs.js";
import { registerPlanningSessionsRoutes } from "./routes/planningSessions.js";
import { createEditWorker, type RunEdit } from "./workers/editWorker.js";
import { createGenerationWorker, type GenerationRunner } from "./workers/generationWorker.js";
import { createRenderWorker, type RunRender } from "./workers/renderWorker.js";

export type JobQueue = ReturnType<typeof createJobQueue>;

export type BuildServerOptions = {
  config: ApiConfig;
  runner?: GenerationRunner;
  runEdit?: RunEdit;
  runRender?: RunRender;
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
  const editWorker = options.runEdit ? createEditWorker({ store, runEdit: options.runEdit, now }) : undefined;
  const renderWorker = options.runRender ? createRenderWorker({ store, runRender: options.runRender, now }) : undefined;
  const runJob = async (id: string) => {
    const record = store.getRecord(id);
    if (record?.pendingEdit && editWorker) return editWorker(id);
    if (record?.pendingRender && renderWorker) return renderWorker(id);
    return generationWorker(id);
  };
  const queue = createJobQueue({ maxPendingJobs: options.maxPendingJobs ?? 10, runJob });

  await server.register(cors, {
    origin: options.config.corsOrigins,
  });

  await server.register(multipart, {
    limits: { fileSize: 200 * 1024 * 1024, files: 200, parts: 250 },
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
  registerImportRoutes(server, {
    store,
    repoRoot: options.config.repoRoot,
    now,
    idGenerator,
  });

  return server;
}
