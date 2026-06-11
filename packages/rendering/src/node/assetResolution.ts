import { realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Asset, DemoProject } from "@tinker/project-schema";

export type AssetResolutionIssueCode =
  | "missing_asset"
  | "unsupported_scheme"
  | "path_traversal"
  | "missing_file"
  | "not_file"
  | "type_mismatch"
  | "mime_mismatch";

export type AssetResolutionIssue = {
  code: AssetResolutionIssueCode;
  assetId?: string;
  assetUri?: string;
  consumer: string;
  message: string;
};

export type NodeAssetResolutionOptions = {
  projectRoot: string;
  allowedRoots?: string[];
  consumer: string;
};

export type NodeAssetFileResolution =
  | { ok: true; assetId: string; assetUri: string; consumer: string; path: string }
  | { ok: false; error: AssetResolutionIssue };

export class AssetResolutionError extends Error {
  readonly issues: AssetResolutionIssue[];

  constructor(issues: AssetResolutionIssue[]) {
    super(formatAssetResolutionIssues(issues));
    this.name = "AssetResolutionError";
    this.issues = issues;
  }
}

const VIDEO_EXTENSIONS = new Set([".avi", ".m4v", ".mkv", ".mov", ".mp4", ".webm"]);

export async function resolveNodeAssetFilePath(
  asset: Asset,
  options: NodeAssetResolutionOptions,
): Promise<NodeAssetFileResolution> {
  const consumer = options.consumer;

  if (asset.type !== "video") {
    return failure("type_mismatch", asset, consumer, `Asset '${asset.id}' is type '${asset.type}', but ${consumer} requires a video asset`);
  }

  if (asset.mimeType && !asset.mimeType.toLowerCase().startsWith("video/")) {
    return failure("mime_mismatch", asset, consumer, `Asset '${asset.id}' has MIME type '${asset.mimeType}', but ${consumer} requires video media`);
  }

  const resolvedPath = resolveAssetPath(asset, options);
  if (!resolvedPath.ok) {
    return resolvedPath;
  }

  const extension = extname(resolvedPath.path).toLowerCase();
  if (extension && !VIDEO_EXTENSIONS.has(extension)) {
    return failure("mime_mismatch", asset, consumer, `Asset '${asset.id}' has unsupported video file extension '${extension}'`);
  }

  try {
    const fileStat = await stat(resolvedPath.path);
    if (!fileStat.isFile()) {
      return failure("not_file", asset, consumer, `Asset '${asset.id}' resolved to '${resolvedPath.path}', which is not a file`);
    }
  } catch {
    return failure("missing_file", asset, consumer, `Asset '${asset.id}' resolved to '${resolvedPath.path}', but the file does not exist`);
  }

  const realPathResolution = await resolveRealAssetPath(resolvedPath.path, normalizeAllowedRoots(options));
  if (!realPathResolution.ok) {
    return failure(realPathResolution.code, asset, consumer, realPathResolution.message(asset, consumer, resolvedPath.path));
  }

  return {
    ok: true,
    assetId: asset.id,
    assetUri: asset.uri,
    consumer,
    path: resolvedPath.path,
  };
}

export async function preflightExportAssets(
  project: DemoProject,
  options: NodeAssetResolutionOptions,
): Promise<NodeAssetFileResolution[]> {
  const issues: AssetResolutionIssue[] = [];
  const resolutions: NodeAssetFileResolution[] = [];
  const assetsById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const requiredAssetIds = new Set(
    project.tracks
      .filter((track) => track.type === "video")
      .flatMap((track) => track.clips.map((clip) => clip.assetId)),
  );

  for (const assetId of requiredAssetIds) {
    const asset = assetsById.get(assetId);
    if (!asset) {
      issues.push({
        code: "missing_asset",
        assetId,
        consumer: options.consumer,
        message: `Project clip references missing asset '${assetId}'`,
      });
      continue;
    }

    const resolution = await resolveNodeAssetFilePath(asset, options);
    resolutions.push(resolution);
    if (!resolution.ok) {
      issues.push(resolution.error);
    }
  }

  if (issues.length > 0) {
    throw new AssetResolutionError(issues);
  }

  return resolutions;
}

function resolveAssetPath(asset: Asset, options: NodeAssetResolutionOptions): NodeAssetFileResolution {
  const consumer = options.consumer;
  const allowedRoots = normalizeAllowedRoots(options);
  const scheme = getUriScheme(asset.uri);
  let candidatePath: string;

  if (scheme && scheme !== "file") {
    return failure("unsupported_scheme", asset, consumer, `Asset '${asset.id}' uses unsupported URI scheme '${scheme}:' for ${consumer}`);
  }

  if (scheme === "file") {
    try {
      candidatePath = fileURLToPath(asset.uri);
    } catch {
      return failure("unsupported_scheme", asset, consumer, `Asset '${asset.id}' has an invalid file URL`);
    }
  } else if (isAbsolute(asset.uri)) {
    candidatePath = asset.uri;
  } else {
    candidatePath = resolve(options.projectRoot, asset.uri);
  }

  const normalizedPath = resolve(candidatePath);
  if (!isInsideAnyRoot(normalizedPath, allowedRoots)) {
    return failure("path_traversal", asset, consumer, `Asset '${asset.id}' resolves outside approved roots`);
  }

  return {
    ok: true,
    assetId: asset.id,
    assetUri: asset.uri,
    consumer,
    path: normalizedPath,
  };
}

function normalizeAllowedRoots(options: NodeAssetResolutionOptions) {
  return Array.from(new Set([options.projectRoot, ...(options.allowedRoots ?? [])].map((root) => resolve(root))));
}

function isInsideAnyRoot(path: string, roots: string[]) {
  return roots.some((root) => {
    const pathFromRoot = relative(root, path);
    return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot));
  });
}

async function resolveRealAssetPath(
  path: string,
  allowedRoots: string[],
): Promise<
  | { ok: true; path: string }
  | {
      ok: false;
      code: "missing_file" | "path_traversal";
      message: (asset: Asset, consumer: string, resolvedPath: string) => string;
    }
> {
  let realCandidatePath: string;

  try {
    realCandidatePath = await realpath(path);
  } catch {
    return {
      ok: false,
      code: "missing_file",
      message: (asset, _consumer, resolvedPath) => `Asset '${asset.id}' resolved to '${resolvedPath}', but the file does not exist`,
    };
  }

  const realAllowedRoots = (
    await Promise.all(
      allowedRoots.map(async (root) => {
        try {
          return await realpath(root);
        } catch {
          return undefined;
        }
      }),
    )
  ).filter((root): root is string => root !== undefined);

  if (!isInsideAnyRoot(realCandidatePath, realAllowedRoots)) {
    return {
      ok: false,
      code: "path_traversal",
      message: (asset, _consumer, _resolvedPath) => `Asset '${asset.id}' resolves outside approved roots`,
    };
  }

  return { ok: true, path: realCandidatePath };
}

function getUriScheme(uri: string) {
  const match = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(uri);
  return match?.[1].toLowerCase();
}

function failure(code: AssetResolutionIssueCode, asset: Asset, consumer: string, message: string): NodeAssetFileResolution {
  return {
    ok: false,
    error: {
      code,
      assetId: asset.id,
      assetUri: asset.uri,
      consumer,
      message,
    },
  };
}

function formatAssetResolutionIssues(issues: AssetResolutionIssue[]) {
  return issues.map((issue) => `${issue.consumer}:${issue.assetId ?? "project"}:${issue.code}: ${issue.message}`).join("; ");
}
