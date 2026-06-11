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
    const isMalformedJsonBody = error.code === "FST_ERR_CTP_INVALID_JSON_BODY";
    const statusCode = isMalformedJsonBody ? 400 : 500;
    void reply.status(statusCode).send({ message: isMalformedJsonBody ? "Malformed JSON body" : "Internal server error" });
  });

  return server;
}
