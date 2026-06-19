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
  if (relativePath === "product-analysis.json") return "product-analysis";
  if (relativePath === "product-analysis.png") return "product-analysis-screenshot";
  if (relativePath === "repo-analysis.json") return "repo-analysis";
  if (relativePath === "playwright/demo-project.json") return "playwright-demo-project";
  if (relativePath === "playwright/storyboard.json") return "playwright-storyboard";
  if (relativePath === "playwright/capture-plan.json") return "playwright-capture-plan";
  if (relativePath === "playwright/capture-result.json") return "playwright-capture-result";
  if (relativePath === "playwright/final.mp4") return "playwright-video";
  if (relativePath.startsWith("playwright/capture/videos/")) return "playwright-video";
  if (relativePath.startsWith("playwright/capture/screenshots/")) return "playwright-screenshot";
  if (relativePath.startsWith("playwright/") && (relativePath.endsWith(".zip") || relativePath.endsWith(".trace"))) {
    return "playwright-trace";
  }
  return "other";
}

export function mediaTypeForPath(relativePath: string) {
  if (relativePath.endsWith(".mp4")) return "video/mp4";
  if (relativePath.endsWith(".webm")) return "video/webm";
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
