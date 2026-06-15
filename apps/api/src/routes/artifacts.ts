import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
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

async function realArtifactPathInsideOutputRoot(outputRoot: string, artifactPath: string) {
  const paths = await Promise.all([realpath(outputRoot), realpath(artifactPath)]).catch(() => undefined);
  if (paths === undefined) return undefined;

  const [realOutputRoot, realArtifactPath] = paths;
  return isInsideDirectory(realOutputRoot, realArtifactPath) ? realArtifactPath : undefined;
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

    const relativePath = relative(record.outputRoot, artifactPath).split("\\").join("/");
    const inBase = record.result?.artifacts.some((artifact) => artifact.relativePath === relativePath) === true;
    const inRevision =
      record.revisions?.some((rev) => rev.result?.artifacts.some((artifact) => artifact.relativePath === relativePath)) === true;
    if (record.status !== "completed" || (!inBase && !inRevision)) {
      return reply.status(404).send({ message: "Artifact not found" });
    }

    const realArtifactPath = await realArtifactPathInsideOutputRoot(record.outputRoot, artifactPath);
    if (realArtifactPath === undefined) {
      return reply.status(404).send({ message: "Artifact not found" });
    }

    const fileStat = await stat(realArtifactPath).catch(() => undefined);
    if (fileStat === undefined || !fileStat.isFile()) {
      return reply.status(404).send({ message: "Artifact not found" });
    }

    const mediaType = mediaTypeForPath(relativePath) ?? "application/octet-stream";
    reply.header("X-Content-Type-Options", "nosniff");
    reply.type(mediaType);

    return reply.send(createReadStream(realArtifactPath));
  });
}
