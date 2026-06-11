import cors from "@fastify/cors";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import type { ApiConfig } from "./config.js";

export type BuildServerOptions = {
  config: ApiConfig;
};

export async function buildServer(options: BuildServerOptions): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });

  await server.register(cors, {
    origin: options.config.corsOrigins,
  });

  server.get("/health", async () => ({ ok: true }));

  server.setErrorHandler((error: FastifyError, _request, reply) => {
    const statusCode = error.statusCode === 400 ? 400 : 500;
    void reply.status(statusCode).send({ message: statusCode === 400 ? "Malformed JSON body" : "Internal server error" });
  });

  return server;
}
