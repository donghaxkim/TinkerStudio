import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { GenerationErrorSchema } from "@tinker/generation-contract";
import type { JobStore } from "../jobs/jobStore.js";
import {
  ImportValidationError,
  buildImportedHyperframesResult,
  prepareImportedBundle,
  synthesizeImportRequest,
  writeImportedBundle,
  type ImportFile,
} from "../jobs/importComposition.js";

export type ImportRoutesOptions = {
  store: JobStore;
  repoRoot: string;
  now: () => string;
  idGenerator: () => string;
};

function validationError(message: string) {
  return GenerationErrorSchema.parse({ status: "failed", stage: "validation", message });
}

export function registerImportRoutes(server: FastifyInstance, options: ImportRoutesOptions) {
  server.post("/api/jobs/import", async (request, reply) => {
    if (!request.isMultipart()) {
      return reply.status(415).send({ message: "Expected multipart/form-data" });
    }

    const files: ImportFile[] = [];
    try {
      for await (const part of request.parts()) {
        if (part.type === "file") {
          files.push({ relativePath: part.fieldname, content: await part.toBuffer() });
        }
      }
    } catch {
      return reply.status(400).send({ message: "Failed to read uploaded files" });
    }

    try {
      const bundle = prepareImportedBundle(files);
      const id = options.idGenerator();
      const outputRoot = resolve(options.repoRoot, "generated", "local-job", id);
      const importedRequest = synthesizeImportRequest(bundle.manifestJson, id);
      const artifactPaths = await writeImportedBundle(outputRoot, bundle);
      const result = buildImportedHyperframesResult({ jobId: id, outputRoot, artifactPaths });
      options.store.create({ id, request: importedRequest, outputRoot, now: options.now() });
      options.store.complete(id, result, options.now());
      return reply.status(200).send(options.store.getSnapshot(id));
    } catch (error) {
      if (error instanceof ImportValidationError) {
        return reply.status(422).send(validationError(error.message));
      }
      throw error;
    }
  });
}
