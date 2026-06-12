import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { mediaTypeForPath } from "../jobs/artifactIndex.js";
import type { JobStore } from "../jobs/jobStore.js";

export type ArtifactsRoutesOptions = { store: JobStore };

function containsEncodedPathSeparator(rawPath: string) {
  const lower = rawPath.toLowerCase();
  return lower.includes("%2f") || lower.includes("%5c");
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

function rawArtifactPath(rawUrl: string | undefined) {
  const marker = "/artifacts/";
  const pathOnly = rawUrl?.split("?")[0] ?? "";
  const markerIndex = pathOnly.indexOf(marker);
  return markerIndex === -1 ? "" : pathOnly.slice(markerIndex + marker.length);
}

function safeArtifactPath(outputRoot: string, rawPath: string, decodedPath: string) {
  if (
    rawPath.length === 0 ||
    decodedPath.length === 0 ||
    decodedPath.includes("\0") ||
    containsEncodedPathSeparator(rawPath) ||
    isAbsolute(decodedPath) ||
    hasDriveLetterPrefix(decodedPath) ||
    hasParentSegment(decodedPath)
  ) {
    return undefined;
  }

  const artifactPath = resolve(outputRoot, decodedPath);
  return isInsideDirectory(outputRoot, artifactPath) ? artifactPath : undefined;
}

export function registerArtifactsRoutes(server: FastifyInstance, options: ArtifactsRoutesOptions) {
  server.get<{ Params: { id: string; "*": string } }>("/api/jobs/:id/artifacts/*", async (request, reply) => {
    const record = options.store.getRecord(request.params.id);
    if (record === undefined) {
      return reply.status(404).send({ message: "Artifact not found" });
    }

    const decodedPath = request.params["*"];
    const artifactPath = safeArtifactPath(record.outputRoot, rawArtifactPath(request.raw.url), decodedPath);
    if (artifactPath === undefined) {
      return reply.status(404).send({ message: "Artifact not found" });
    }

    const fileStat = await stat(artifactPath).catch(() => undefined);
    if (fileStat === undefined || !fileStat.isFile()) {
      return reply.status(404).send({ message: "Artifact not found" });
    }

    const relativePath = relative(record.outputRoot, artifactPath).split("\\").join("/");
    const mediaType = mediaTypeForPath(relativePath);
    reply.header("X-Content-Type-Options", "nosniff");
    if (mediaType !== undefined) {
      reply.type(mediaType);
    }

    return reply.send(createReadStream(artifactPath));
  });
}
