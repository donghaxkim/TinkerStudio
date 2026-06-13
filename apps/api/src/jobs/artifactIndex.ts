import { isAbsolute, relative, sep } from "node:path";
import type { ApiArtifact, ApiArtifactKind } from "@tinker/generation-contract";

export type IndexArtifactsInput = {
  jobId: string;
  outputRoot: string;
  artifactPaths: string[];
};

function toPosixPath(value: string) {
  return value.split(sep).join("/");
}

function classifyArtifact(relativePath: string): ApiArtifactKind {
  if (relativePath === "hyperframes/output.mp4") return "output-video";
  if (relativePath === "hyperframes/index.html") return "composition-index";
  if (relativePath === "hyperframes/asset-manifest.json") return "asset-manifest";
  if (relativePath === "hyperframes/generation-manifest.json") return "generation-manifest";
  if (relativePath === "hyperframes/lint.log") return "lint-log";
  if (relativePath === "hyperframes/render.log") return "render-log";
  if (relativePath === "product-analysis.json") return "product-analysis";
  if (relativePath === "product-analysis.png") return "product-analysis-screenshot";
  if (relativePath === "repo-analysis.json") return "repo-analysis";
  if (relativePath.startsWith("hyperframes/assets/")) return "asset";
  return "other";
}

export function mediaTypeForPath(relativePath: string) {
  if (relativePath.endsWith(".mp4")) return "video/mp4";
  if (relativePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (relativePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (relativePath.endsWith(".png")) return "image/png";
  if (relativePath.endsWith(".jpg") || relativePath.endsWith(".jpeg")) return "image/jpeg";
  if (relativePath.endsWith(".svg")) return "image/svg+xml";
  if (relativePath.endsWith(".webp")) return "image/webp";
  if (relativePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (relativePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (relativePath.endsWith(".log") || relativePath.endsWith(".txt")) return "text/plain; charset=utf-8";
  return undefined;
}

export function indexArtifacts(input: IndexArtifactsInput): ApiArtifact[] {
  return input.artifactPaths.flatMap((artifactPath) => {
    const relativePath = toPosixPath(relative(input.outputRoot, artifactPath));
    if (relativePath === "" || relativePath.startsWith("../") || relativePath === ".." || isAbsolute(relativePath)) {
      return [];
    }

    const encodedPath = relativePath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    return [
      {
        kind: classifyArtifact(relativePath),
        relativePath,
        url: `/api/jobs/${encodeURIComponent(input.jobId)}/artifacts/${encodedPath}`,
        ...(mediaTypeForPath(relativePath) === undefined ? {} : { mediaType: mediaTypeForPath(relativePath) }),
      },
    ];
  });
}
