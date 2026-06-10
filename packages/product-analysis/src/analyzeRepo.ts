import { execFile as execFileCallback } from "node:child_process";
import { existsSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { basename, dirname, extname, join, posix, relative, sep, win32 } from "node:path";
import { promisify } from "node:util";
import type { AnalyzeRepoOptions, RepoAnalysis } from "./types.js";

type RepoAnalysisArrayField = "features" | "likelyRoutes" | "demoIdeas" | "importantTerms" | "setupNotes";

const arrayLimits: Record<RepoAnalysisArrayField, { maxEntries: number; maxLength: number }> = {
  features: { maxEntries: 12, maxLength: 160 },
  likelyRoutes: { maxEntries: 20, maxLength: 160 },
  demoIdeas: { maxEntries: 8, maxLength: 220 },
  importantTerms: { maxEntries: 20, maxLength: 80 },
  setupNotes: { maxEntries: 8, maxLength: 220 },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, fieldName: string, maxLength: number) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} is required`);
  }

  if (value.length > maxLength) {
    throw new Error(`${fieldName} must be at most ${maxLength} characters`);
  }

  return value;
}

function optionalString(value: unknown, fieldName: string, maxLength: number) {
  if (value === undefined) {
    return undefined;
  }

  return requireString(value, fieldName, maxLength);
}

function parseStringArray(value: unknown, fieldName: RepoAnalysisArrayField) {
  const limit = arrayLimits[fieldName];

  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  if (value.length > limit.maxEntries) {
    throw new Error(`${fieldName} must contain at most ${limit.maxEntries} entries`);
  }

  return value.map((entry, index) => requireString(entry, `${fieldName}.${index}`, limit.maxLength));
}

function isRelativeRepoPath(path: string) {
  if (path.includes("\\") || posix.isAbsolute(path) || win32.isAbsolute(path)) {
    return false;
  }

  const normalized = posix.normalize(path);
  return normalized !== "." && normalized !== ".." && !normalized.startsWith("../");
}

export function parseRepoAnalysis(value: unknown, expectedRepoUrl: string): RepoAnalysis {
  if (!isRecord(value)) {
    throw new Error("RepoAnalysis must be an object");
  }

  const repoUrl = requireString(value.repoUrl, "repoUrl", 2_000);
  if (repoUrl !== expectedRepoUrl) {
    throw new Error("repoUrl must match requested repository URL");
  }

  const sourceHintsValue = value.sourceHints;
  if (!Array.isArray(sourceHintsValue)) {
    throw new Error("sourceHints must be an array");
  }
  if (sourceHintsValue.length > 20) {
    throw new Error("sourceHints must contain at most 20 entries");
  }

  const sourceHints = sourceHintsValue.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`sourceHints.${index} must be an object`);
    }

    const path = requireString(entry.path, `sourceHints.${index}.path`, 240);
    if (!isRelativeRepoPath(path)) {
      throw new Error(`sourceHints.${index}.path must be a relative repository path`);
    }

    return {
      path,
      reason: requireString(entry.reason, `sourceHints.${index}.reason`, 180),
    };
  });

  return {
    repoUrl,
    commit: optionalString(value.commit, "commit", 40),
    productName: optionalString(value.productName, "productName", 120),
    summary: requireString(value.summary, "summary", 1_200),
    features: parseStringArray(value.features, "features"),
    likelyRoutes: parseStringArray(value.likelyRoutes, "likelyRoutes"),
    demoIdeas: parseStringArray(value.demoIdeas, "demoIdeas"),
    importantTerms: parseStringArray(value.importantTerms, "importantTerms"),
    setupNotes: parseStringArray(value.setupNotes, "setupNotes"),
    sourceHints,
  };
}

const execFile = promisify(execFileCallback);
const DEFAULT_MAX_FILES = 80;
const DEFAULT_MAX_TOTAL_BYTES = 300_000;
const DEFAULT_MAX_FILE_BYTES = 24_000;

const GithubOwnerSegmentPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const GithubRepoSegmentPattern = /^(?=.*[A-Za-z0-9])[A-Za-z0-9._-]+$/;
const ignoredDirectoryNames = new Set([".git", "node_modules", ".next", "dist", "build", "coverage", ".turbo", ".cache"]);
const ignoredFileNames = new Set([".npmrc", ".yarnrc"]);
const textExtensions = new Set([".md", ".mdx", ".txt", ".json", ".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".yml", ".yaml"]);

type CollectedSourceFile = {
  path: string;
  content: string;
};

function normalizeRepoUrl(repoUrl: string) {
  try {
    const url = new URL(repoUrl);
    const pathMatch = /^\/([^/]+)\/([^/]+)$/.exec(url.pathname);
    if (pathMatch === null) {
      throw new Error("repoUrl must be a public GitHub repository root URL");
    }

    const ownerName = decodeURIComponent(pathMatch[1]);
    const repoPathSegment = decodeURIComponent(pathMatch[2]);
    const repoName = repoPathSegment.endsWith(".git") ? repoPathSegment.slice(0, -4) : repoPathSegment;

    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      !GithubOwnerSegmentPattern.test(ownerName) ||
      !GithubRepoSegmentPattern.test(repoName) ||
      repoName === "." ||
      repoName === ".."
    ) {
      throw new Error("repoUrl must be a public GitHub repository root URL");
    }
  } catch {
    throw new Error("repoUrl must be a public GitHub repository root URL");
  }

  return repoUrl;
}

async function defaultFetchRepo(repoUrl: string, checkoutDirectory: string) {
  await mkdir(dirname(checkoutDirectory), { recursive: true });
  const gitHomeDirectory = await mkdtemp(join(dirname(checkoutDirectory), "git-home-"));
  const gitConfigDirectory = join(gitHomeDirectory, ".config");
  await mkdir(gitConfigDirectory, { recursive: true });

  const gitEnv = createIsolatedGitEnv(gitHomeDirectory, gitConfigDirectory);
  const isolatedGitArgs = ["-c", "credential.helper=", "-c", "core.askPass="];

  try {
    await execFile("git", [...isolatedGitArgs, "clone", "--depth", "1", "--no-tags", "--no-recurse-submodules", repoUrl, checkoutDirectory], {
      env: gitEnv,
    });

    try {
      const { stdout } = await execFile("git", [...isolatedGitArgs, "-C", checkoutDirectory, "rev-parse", "--short", "HEAD"], {
        env: gitEnv,
      });
      return { commit: stdout.trim() || undefined };
    } catch {
      return {};
    }
  } finally {
    await rm(gitHomeDirectory, { recursive: true, force: true });
  }
}

function createIsolatedGitEnv(homeDirectory: string, configDirectory: string) {
  const env: NodeJS.ProcessEnv = {
    GIT_ASKPASS: "",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_LFS_SKIP_SMUDGE: "1",
    GIT_TERMINAL_PROMPT: "0",
    HOME: homeDirectory,
    SSH_ASKPASS: "",
    XDG_CONFIG_HOME: configDirectory,
  };

  for (const name of ["PATH", "TMPDIR", "TEMP", "TMP", "SystemRoot", "WINDIR"]) {
    const value = process.env[name];
    if (value !== undefined) {
      env[name] = value;
    }
  }

  return env;
}

function shouldSkipPath(relativePath: string, directoryEntryName: string) {
  if (directoryEntryName.toLowerCase().startsWith(".env") || ignoredDirectoryNames.has(directoryEntryName) || ignoredFileNames.has(directoryEntryName)) {
    return true;
  }

  const lowerPath = relativePath.toLowerCase();
  return lowerPath.includes("secret") || lowerPath.includes("token") || /(^|[/._-])keys?([/._-]|$)/.test(lowerPath) || lowerPath.endsWith(".pem");
}

function priorityForPath(path: string) {
  const lower = path.toLowerCase();
  if (basename(lower).startsWith("readme")) return 0;
  if (lower === "package.json") return 1;
  if (lower.includes("docs/") || lower.includes("documentation/")) return 2;
  if (lower.includes("app/") || lower.includes("pages/") || lower.includes("routes/")) return 3;
  return 4;
}

async function collectSourceFiles(root: string, options: Required<Pick<AnalyzeRepoOptions, "maxFiles" | "maxTotalBytes" | "maxFileBytes">>) {
  if (existsSync(join(root, ".gitmodules"))) {
    throw new Error("Submodules are not supported for repo analysis");
  }

  const candidates: string[] = [];

  async function walk(directory: string) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      const relativePath = relative(root, fullPath).split(sep).join("/");

      if (shouldSkipPath(relativePath, entry.name)) {
        continue;
      }

      const stats = await lstat(fullPath);
      if (stats.isSymbolicLink()) {
        continue;
      }

      if (stats.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (!stats.isFile() || stats.size <= 0 || stats.size > options.maxFileBytes) {
        continue;
      }

      const extension = extname(entry.name).toLowerCase();
      if (!textExtensions.has(extension) && !entry.name.toLowerCase().startsWith("readme")) {
        continue;
      }

      candidates.push(relativePath);
      if (candidates.length > options.maxFiles) {
        throw new Error("Repository exceeds safe analysis file limit");
      }
    }
  }

  await walk(root);
  candidates.sort((a, b) => priorityForPath(a) - priorityForPath(b) || a.localeCompare(b));

  if (candidates.length > options.maxFiles) {
    throw new Error("Repository exceeds safe analysis file limit");
  }

  const files: CollectedSourceFile[] = [];
  let totalBytes = 0;

  for (const path of candidates) {
    const content = await readFile(join(root, path), "utf8");
    totalBytes += Buffer.byteLength(content, "utf8");
    if (totalBytes > options.maxTotalBytes) {
      throw new Error("Repository exceeds safe analysis byte limit");
    }

    files.push({ path, content });
  }

  return files;
}

function cleanText(value: string, maxLength: number) {
  const withoutUrls = value.replace(/https?:\/\/\S+/g, "").replace(/ignore previous instructions/gi, "").replace(/navigate to/gi, "");
  const compact = withoutUrls.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? compact.slice(0, maxLength).trim() : compact;
}

function uniqueBounded(values: string[], maxEntries: number, maxLength: number) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const cleaned = cleanText(value, maxLength);
    if (!cleaned || seen.has(cleaned)) {
      continue;
    }

    seen.add(cleaned);
    result.push(cleaned);
    if (result.length >= maxEntries) {
      break;
    }
  }

  return result;
}

function inferProductName(files: CollectedSourceFile[]) {
  for (const file of files) {
    if (basename(file.path).toLowerCase().startsWith("readme")) {
      const heading = file.content.match(/^#\s+(.+)$/m)?.[1];
      if (heading) return cleanText(heading, 120);
    }
  }

  const packageJson = files.find((file) => file.path === "package.json");
  if (packageJson) {
    try {
      const parsed = JSON.parse(packageJson.content) as { name?: unknown };
      if (typeof parsed.name === "string") return cleanText(parsed.name, 120);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function inferFeatures(files: CollectedSourceFile[]) {
  const bullets = files.flatMap((file) => Array.from(file.content.matchAll(/^\s*[-*]\s+(.+)$/gm), (match) => match[1] ?? ""));
  return uniqueBounded(bullets, 12, 160);
}

function inferRoutes(files: CollectedSourceFile[]) {
  const routes = files.flatMap((file) => {
    if (!file.path.match(/(^|\/)(app|pages|routes)\//)) return [];
    const withoutPage = file.path.replace(/\/(page|index)\.[^.]+$/, "").replace(/\.[^.]+$/, "");
    const parts = withoutPage.split("/").filter((part) => !["app", "pages", "routes", "src"].includes(part));
    return [`/${parts.join("/")}`.replace(/\/+/g, "/")];
  });

  return uniqueBounded(routes.length > 0 ? routes : ["/"], 20, 160);
}

function buildAnalysis(repoUrl: string, commit: string | undefined, files: CollectedSourceFile[]) {
  const productName = inferProductName(files);
  const combined = files.map((file) => file.content).join("\n");
  const firstParagraph = combined.split(/\n\s*\n/).find((section) => cleanText(section, 1_200).length > 20);
  const features = inferFeatures(files);
  const likelyRoutes = inferRoutes(files);
  const importantTerms = uniqueBounded([productName ?? "", ...features.flatMap((feature) => feature.match(/[A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)*/g) ?? [])], 20, 80);
  const sourceHints = files.slice(0, 20).map((file) => ({ path: file.path, reason: "Source evidence for repo context." }));

  return parseRepoAnalysis(
    {
      repoUrl,
      ...(commit ? { commit } : {}),
      ...(productName ? { productName } : {}),
      summary: cleanText(firstParagraph ?? `${productName ?? "This repository"} contains product source material for planning.`, 1_200),
      features,
      likelyRoutes,
      demoIdeas: uniqueBounded(features.map((feature) => `Show ${feature} in the live product workflow.`), 8, 220),
      importantTerms,
      setupNotes: uniqueBounded(files.some((file) => file.path === "package.json") ? ["package.json is present; setup remains source-only and is not executed."] : [], 8, 220),
      sourceHints,
    },
    repoUrl,
  );
}

function positiveIntegerLimit(value: number | undefined, fieldName: "maxFiles" | "maxTotalBytes" | "maxFileBytes", defaultValue: number) {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a finite positive integer`);
  }

  return value;
}

export async function analyzeRepo(repoUrl: string, options: AnalyzeRepoOptions): Promise<RepoAnalysis> {
  const normalizedRepoUrl = normalizeRepoUrl(repoUrl);
  const fetchRepo = options.fetchRepo ?? defaultFetchRepo;
  const limits = {
    maxFiles: positiveIntegerLimit(options.maxFiles, "maxFiles", DEFAULT_MAX_FILES),
    maxTotalBytes: positiveIntegerLimit(options.maxTotalBytes, "maxTotalBytes", DEFAULT_MAX_TOTAL_BYTES),
    maxFileBytes: positiveIntegerLimit(options.maxFileBytes, "maxFileBytes", DEFAULT_MAX_FILE_BYTES),
  };

  const fetchResult = await fetchRepo(normalizedRepoUrl, options.checkoutDirectory);
  const files = await collectSourceFiles(options.checkoutDirectory, limits);
  return buildAnalysis(normalizedRepoUrl, fetchResult.commit, files);
}
