import { execFile as execFileCallback, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, posix, win32 } from "node:path";
import { promisify } from "node:util";
import type { AnalyzeRepoOpencodeRun, AnalyzeRepoOptions, RepoAnalysis, RepoAnalysisSourceHint } from "./types.js";

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
const DEFAULT_OPENCODE_TIMEOUT_MS = 300_000;
const TIMEOUT_KILL_GRACE_MS = 5_000;
const TIMEOUT_CLOSE_FALLBACK_MS = 5_000;
const LOG_STREAM_RETAIN_BYTES = 64 * 1024;

const GithubOwnerSegmentPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const GithubRepoSegmentPattern = /^(?=.*[A-Za-z0-9])[A-Za-z0-9._-]+$/;

type JsonRecord = Record<string, unknown>;

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

async function defaultFetchRepo(repoUrl: string, checkoutDirectory: string, options: { signal?: AbortSignal } = {}) {
  await mkdir(dirname(checkoutDirectory), { recursive: true });
  const gitHomeDirectory = await mkdtemp(join(dirname(checkoutDirectory), "git-home-"));
  const gitConfigDirectory = join(gitHomeDirectory, ".config");
  await mkdir(gitConfigDirectory, { recursive: true });

  const gitEnv = createIsolatedGitEnv(gitHomeDirectory, gitConfigDirectory);
  const isolatedGitArgs = ["-c", "credential.helper=", "-c", "core.askPass="];

  try {
    await execFile("git", [...isolatedGitArgs, "clone", "--depth", "1", "--no-tags", "--no-recurse-submodules", repoUrl, checkoutDirectory], {
      env: gitEnv,
      signal: options.signal,
    });

    try {
      const { stdout } = await execFile("git", [...isolatedGitArgs, "-C", checkoutDirectory, "rev-parse", "--short", "HEAD"], {
        env: gitEnv,
        signal: options.signal,
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

type RetainedOutput = {
  chunks: Buffer[];
  retainedBytes: number;
  omittedBytes: number;
};

function createRetainedOutput(): RetainedOutput {
  return { chunks: [], retainedBytes: 0, omittedBytes: 0 };
}

function appendRetainedOutput(output: RetainedOutput, chunk: Buffer) {
  output.chunks.push(chunk);
  output.retainedBytes += chunk.length;

  while (output.retainedBytes > LOG_STREAM_RETAIN_BYTES) {
    const excessBytes = output.retainedBytes - LOG_STREAM_RETAIN_BYTES;
    const firstChunk = output.chunks[0];
    if (firstChunk === undefined) {
      break;
    }

    if (firstChunk.length <= excessBytes) {
      output.chunks.shift();
      output.retainedBytes -= firstChunk.length;
      output.omittedBytes += firstChunk.length;
    } else {
      output.chunks[0] = firstChunk.subarray(excessBytes);
      output.retainedBytes -= excessBytes;
      output.omittedBytes += excessBytes;
    }
  }
}

function retainedOutputToLog(name: "stdout" | "stderr", output: RetainedOutput) {
  const text = Buffer.concat(output.chunks, output.retainedBytes).toString("utf8");

  if (output.omittedBytes === 0) {
    return text;
  }

  return `[${name} truncated: omitted ${output.omittedBytes} bytes; retained last ${output.retainedBytes} bytes]\n${text}`;
}

function sanitizedOpencodeEnv() {
  const allowedNames = new Set(["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR"]);
  const env: NodeJS.ProcessEnv = {};

  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && allowedNames.has(name)) {
      env[name] = value;
    }
  }

  return env;
}

async function writeOpencodeRepoAnalysisConfig(cwd: string) {
  await writeLocalOpencodeConfig(
    cwd,
    `${JSON.stringify(
      {
        $schema: "https://opencode.ai/config.json",
        permission: {
          edit: "deny",
          bash: "deny",
          webfetch: "deny",
          external_directory: "deny",
        },
      },
      null,
      2,
    )}\n`,
  );
}

async function writeLocalOpencodeConfig(cwd: string, contents: string) {
  const target = join(cwd, "opencode.json");

  try {
    await lstat(target);
    await rm(target, { recursive: true, force: true });
  } catch (error) {
    if (!isRecord(error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  await writeFile(target, contents, { flag: "wx" });
}

export async function defaultRunOpencode(prompt: string, options: { cwd: string; signal?: AbortSignal }) {
  const timeoutMs = Number(process.env.TINKER_REPO_ANALYSIS_OPENCODE_TIMEOUT_MS ?? DEFAULT_OPENCODE_TIMEOUT_MS);
  const effectiveTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_OPENCODE_TIMEOUT_MS;
  const stdoutPath = join(options.cwd, ".tinker-opencode-output.jsonl");
  const stderrPath = join(options.cwd, ".tinker-opencode-error.log");
  await writeOpencodeRepoAnalysisConfig(options.cwd);

  let result: { code: number | null; signal: NodeJS.Signals | null; timedOut: boolean };
  const stdout = createRetainedOutput();
  const stderr = createRetainedOutput();
  result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null; timedOut: boolean }>((resolve, reject) => {
    const detached = process.platform !== "win32";
    let timedOut = false;
    let aborted = options.signal?.aborted ?? false;
    let settled = false;
    let killTimeout: ReturnType<typeof setTimeout> | undefined;
    let closeFallbackTimeout: ReturnType<typeof setTimeout> | undefined;
    const child = spawn("opencode", ["run", "--pure", "--format", "json", "--dir", options.cwd, prompt], {
      cwd: options.cwd,
      detached,
      env: sanitizedOpencodeEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (aborted) {
      killChild("SIGTERM");
    }

    const onAbort = () => {
      aborted = true;
      killChild("SIGTERM");
      killTimeout = setTimeout(() => {
        killChild("SIGKILL");
        closeFallbackTimeout = setTimeout(() => {
          destroyStreams();
          rejectOnce(new DOMException("OpenCode repo analysis cancelled.", "AbortError"));
        }, TIMEOUT_CLOSE_FALLBACK_MS);
      }, TIMEOUT_KILL_GRACE_MS);
    };

    options.signal?.addEventListener("abort", onAbort, { once: true });

    const timeout = setTimeout(() => {
      timedOut = true;
      killChild("SIGTERM");
      killTimeout = setTimeout(() => {
        killChild("SIGKILL");
        closeFallbackTimeout = setTimeout(() => {
          destroyStreams();
          resolveOnce({ code: null, signal: null, timedOut });
        }, TIMEOUT_CLOSE_FALLBACK_MS);
      }, TIMEOUT_KILL_GRACE_MS);
    }, effectiveTimeoutMs);

    function killChild(signal: NodeJS.Signals) {
      if (detached && child.pid !== undefined) {
        try {
          process.kill(-child.pid, signal);
          return;
        } catch {
          // Fall back to the direct child when process-group kill is unavailable.
        }
      }

      try {
        child.kill(signal);
      } catch {
        // The child may already have exited between timeout callbacks.
      }
    }

    function clearTimers() {
      clearTimeout(timeout);
      if (killTimeout !== undefined) {
        clearTimeout(killTimeout);
      }
      if (closeFallbackTimeout !== undefined) {
        clearTimeout(closeFallbackTimeout);
      }
    }

    function cleanupListeners() {
      child.stdout.removeAllListeners("data");
      child.stderr.removeAllListeners("data");
      child.removeAllListeners("close");
      child.removeAllListeners("error");
      options.signal?.removeEventListener("abort", onAbort);
    }

    function destroyStreams() {
      child.stdout.destroy();
      child.stderr.destroy();
    }

    function resolveOnce(finalResult: { code: number | null; signal: NodeJS.Signals | null; timedOut: boolean }) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimers();
      cleanupListeners();
      resolve(finalResult);
    }

    function rejectOnce(error: Error) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimers();
      cleanupListeners();
      reject(error);
    }

    child.stdout.on("data", (chunk) => {
      appendRetainedOutput(stdout, Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8"));
    });

    child.stderr.on("data", (chunk) => {
      appendRetainedOutput(stderr, Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8"));
    });

    child.on("error", (error) => {
      rejectOnce(error);
    });
    child.on("close", (code, signal) => {
      if (aborted) {
        rejectOnce(new DOMException("OpenCode repo analysis cancelled.", "AbortError"));
        return;
      }
      resolveOnce({ code, signal, timedOut });
    });
  });

  const stdoutText = retainedOutputToLog("stdout", stdout);
  const stderrText = retainedOutputToLog("stderr", stderr);
  await Promise.all([writeFile(stdoutPath, stdoutText), writeFile(stderrPath, stderrText)]);

  if (result.timedOut) {
    throw new Error(`OpenCode repo analysis timed out after ${effectiveTimeoutMs}ms`);
  }

  if (result.code !== 0) {
    const suffix = stderrText.trim() ? `: ${cleanText(stderrText, 500)}` : "";
    throw new Error(`OpenCode repo analysis failed with exit code ${result.code ?? "unknown"}${suffix}`);
  }

  return stdoutText;
}

function assertSupportedRepoShape(root: string) {
  if (existsSync(join(root, ".gitmodules"))) {
    throw new Error("Submodules are not supported for repo analysis");
  }
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

function buildOpencodeRepoAnalysisPrompt(repoUrl: string) {
  return `You were dispatched as a subagent for read-only repository research. Skip process skills, planning workflows, implementation workflows, and code changes. Do not edit files. Inspect only README files, package.json, app/**/page.tsx, app/**/route.ts, and app/layout.tsx. Return one JSON object only for repoUrl ${repoUrl} with keys repoUrl, productName, summary, features, likelyRoutes, demoIdeas, importantTerms, setupNotes, sourceHints. sourceHints must be objects with path and reason fields.`;
}

function extractStringPayloads(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(extractStringPayloads);
  }

  if (!isRecord(value)) {
    return [];
  }

  const directPayloads = [value.text, value.content, value.delta].filter((entry): entry is string => typeof entry === "string");
  const nestedPayloads = [value.data, value.event, value.part, value.message].flatMap(extractStringPayloads);
  return [...directPayloads, ...nestedPayloads];
}

function collectOpencodeText(output: string) {
  const payloads: string[] = [];

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      payloads.push(...extractStringPayloads(JSON.parse(trimmed)));
    } catch {
      payloads.push(trimmed);
    }
  }

  return payloads.join("");
}

function findLastJsonObject(text: string) {
  let lastObject: unknown;
  let lastAnalysisObject: unknown;

  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") {
      continue;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1) {
      const char = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;

        if (depth === 0) {
          try {
            lastObject = JSON.parse(text.slice(start, index + 1));
            if (isRecord(lastObject) && typeof lastObject.repoUrl === "string") {
              lastAnalysisObject = lastObject;
            }
          } catch {
            // Continue scanning; earlier text may contain non-JSON braces.
          }
          break;
        }
      }
    }
  }

  if (isRecord(lastAnalysisObject)) {
    return lastAnalysisObject;
  }

  if (!isRecord(lastObject)) {
    throw new Error("OpenCode repo analysis did not return a JSON object");
  }

  return lastObject;
}

function parseOpencodeRepoAnalysis(output: string, repoUrl: string, commit: string | undefined) {
  const analysis = findLastJsonObject(collectOpencodeText(output));
  return parseRepoAnalysis(normalizeOpencodeRepoAnalysis(analysis, commit), repoUrl);
}

function normalizeOpencodeStringArray(value: unknown, fieldName: RepoAnalysisArrayField) {
  if (!Array.isArray(value)) {
    return [];
  }

  const limit = arrayLimits[fieldName];
  return uniqueBounded(
    value.flatMap((entry) => (typeof entry === "string" ? [entry] : [])),
    limit.maxEntries,
    limit.maxLength,
  );
}

function normalizeOpencodeSourceHints(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const hints: RepoAnalysis["sourceHints"] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.path !== "string" || typeof entry.reason !== "string" || !isRelativeRepoPath(entry.path)) {
      continue;
    }

    const path = entry.path.trim();
    if (seen.has(path)) {
      continue;
    }

    seen.add(path);
    hints.push({ path, reason: cleanText(entry.reason, 180) });
    if (hints.length >= 20) {
      break;
    }
  }

  return hints;
}

function normalizeOpencodeRepoAnalysis(analysis: JsonRecord, commit: string | undefined) {
  return {
    ...analysis,
    ...(typeof analysis.productName === "string" ? { productName: cleanText(analysis.productName, 120) } : {}),
    ...(typeof analysis.summary === "string" ? { summary: cleanText(analysis.summary, 1_200) } : {}),
    ...(commit ? { commit } : {}),
    features: normalizeOpencodeStringArray(analysis.features, "features"),
    likelyRoutes: normalizeOpencodeStringArray(analysis.likelyRoutes, "likelyRoutes"),
    demoIdeas: normalizeOpencodeStringArray(analysis.demoIdeas, "demoIdeas"),
    importantTerms: normalizeOpencodeStringArray(analysis.importantTerms, "importantTerms"),
    setupNotes: normalizeOpencodeStringArray(analysis.setupNotes, "setupNotes"),
    sourceHints: normalizeOpencodeSourceHints(analysis.sourceHints),
  };
}

async function analyzeRepoWithOpencode(repoUrl: string, commit: string | undefined, checkoutDirectory: string, runOpencode: AnalyzeRepoOpencodeRun) {
  const output = await runOpencode(buildOpencodeRepoAnalysisPrompt(repoUrl), { cwd: checkoutDirectory });
  return parseOpencodeRepoAnalysis(output, repoUrl, commit);
}

// --- Deterministic, dependency-free repo analysis ------------------------------------------------
// Reads only the cloned README + package.json (never .env/secrets) and grounds the demo without an
// external agent CLI. Used by default so generation works without `opencode`; the agentic path is
// still reachable by injecting `runOpencode` (tests) or setting TINKER_REPO_ANALYSIS_AGENT=opencode.

const README_CANDIDATES = ["README.md", "README.MD", "Readme.md", "readme.md", "README", "README.txt", "README.rst"];

async function readMaybe(filePath: string, maxBytes = 64 * 1024): Promise<string | undefined> {
  try {
    const content = await readFile(filePath, "utf8");
    return content.length > maxBytes ? content.slice(0, maxBytes) : content;
  } catch {
    return undefined;
  }
}

function repoNameFromUrl(repoUrl: string): string {
  try {
    const segments = new URL(repoUrl).pathname.split("/").filter((s) => s.length > 0);
    const last = segments[segments.length - 1] ?? "project";
    return last.endsWith(".git") ? last.slice(0, -4) : last;
  } catch {
    return "project";
  }
}

async function readReadme(checkoutDirectory: string): Promise<{ path: string; headings: string[]; firstParagraph: string } | undefined> {
  for (const name of README_CANDIDATES) {
    const content = await readMaybe(join(checkoutDirectory, name));
    if (content === undefined) continue;
    const lines = content.split(/\r?\n/);
    const headings: string[] = [];
    for (const line of lines) {
      const match = /^#{1,3}\s+(.+?)\s*#*$/.exec(line.trim());
      if (match?.[1]) headings.push(match[1]);
    }
    let firstParagraph = "";
    let block: string[] = [];
    const flush = (): boolean => {
      const text = block.join(" ").trim();
      block = [];
      if (text === "") return false;
      // Skip headings, HTML, badges/images, and tables when choosing the summary paragraph.
      if (/^(#|<|!\[|\[!\[|\|)/.test(text)) return false;
      firstParagraph = text;
      return true;
    };
    for (const line of lines) {
      if (line.trim() === "") { if (flush()) break; } else { block.push(line.trim()); }
    }
    if (firstParagraph === "" && block.length > 0) flush();
    return { path: name, headings, firstParagraph };
  }
  return undefined;
}

async function readPackageJson(checkoutDirectory: string): Promise<Record<string, unknown> | undefined> {
  const content = await readMaybe(join(checkoutDirectory, "package.json"));
  if (content === undefined) return undefined;
  try {
    const parsed = JSON.parse(content);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function cleanNonEmptyArray(values: string[], field: RepoAnalysisArrayField): string[] {
  const limit = arrayLimits[field];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const cleaned = cleanText(value, limit.maxLength);
    if (cleaned === "" || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
    if (out.length >= limit.maxEntries) break;
  }
  return out;
}

const SKIPPED_README_HEADINGS = /^(table of contents|contents|license|installation|install|getting started|contributing|acknowledg(e?)ments|changelog)$/i;

async function analyzeRepoDeterministic(repoUrl: string, commit: string | undefined, checkoutDirectory: string): Promise<RepoAnalysis> {
  const pkg = await readPackageJson(checkoutDirectory);
  const readme = await readReadme(checkoutDirectory);

  const rawName = typeof pkg?.name === "string" && pkg.name.trim() !== "" ? pkg.name : repoNameFromUrl(repoUrl);
  const productName = cleanText(rawName, 120) || repoNameFromUrl(repoUrl);

  const pkgDescription = typeof pkg?.description === "string" ? pkg.description : "";
  const summarySeed =
    [pkgDescription, readme?.firstParagraph ?? "", `${productName} is the product in the repository at ${repoUrl}.`]
      .map((seed) => seed.trim())
      .find((seed) => cleanText(seed, 1_200) !== "") ?? `${productName} product demo.`;
  const summary = cleanText(summarySeed, 1_200) || `${productName} product demo.`;

  const features = cleanNonEmptyArray((readme?.headings ?? []).filter((heading) => !SKIPPED_README_HEADINGS.test(heading.trim())), "features");
  const keywords = Array.isArray(pkg?.keywords) ? (pkg.keywords as unknown[]).filter((keyword): keyword is string => typeof keyword === "string") : [];
  const importantTerms = cleanNonEmptyArray([productName, ...keywords], "importantTerms");

  const scripts = isRecord(pkg?.scripts) ? (pkg.scripts as Record<string, unknown>) : {};
  const setupNotes = cleanNonEmptyArray(
    ["dev", "start", "build", "preview"].filter((key) => typeof scripts[key] === "string").map((key) => `Has an npm "${key}" script.`),
    "setupNotes",
  );

  const demoIdeas = cleanNonEmptyArray(
    [features.length > 0 ? `Walk through ${productName}, highlighting ${features[0]}.` : `Walk through the core flow of ${productName}.`],
    "demoIdeas",
  );

  const sourceHints: RepoAnalysisSourceHint[] = [];
  if (readme?.path !== undefined) sourceHints.push({ path: readme.path, reason: cleanText("Product overview and feature headings.", 180) });
  if (pkg !== undefined) sourceHints.push({ path: "package.json", reason: cleanText("Package name, description, keywords, and scripts.", 180) });

  return {
    repoUrl,
    ...(commit ? { commit } : {}),
    productName,
    summary,
    features,
    likelyRoutes: ["/"],
    demoIdeas,
    importantTerms,
    setupNotes,
    sourceHints,
  };
}

export async function analyzeRepo(repoUrl: string, options: AnalyzeRepoOptions): Promise<RepoAnalysis> {
  const normalizedRepoUrl = normalizeRepoUrl(repoUrl);
  const fetchRepo = options.fetchRepo ?? defaultFetchRepo;

  function throwIfAborted() {
    if (options.signal?.aborted) {
      throw new DOMException("Repo analysis cancelled.", "AbortError");
    }
  }

  throwIfAborted();
  const fetchResult = await fetchRepo(normalizedRepoUrl, options.checkoutDirectory, { signal: options.signal });
  throwIfAborted();
  assertSupportedRepoShape(options.checkoutDirectory);
  throwIfAborted();

  // Use the agentic OpenCode analysis when a runner is injected (tests) or explicitly opted in via
  // env. Otherwise default to the deterministic analysis so generation works without `opencode`.
  const useOpencode = options.runOpencode !== undefined || process.env.TINKER_REPO_ANALYSIS_AGENT === "opencode";
  if (useOpencode) {
    const runOpencode = options.runOpencode ?? defaultRunOpencode;
    return analyzeRepoWithOpencode(normalizedRepoUrl, fetchResult.commit, options.checkoutDirectory, (prompt, runOptions) =>
      runOpencode(prompt, { ...runOptions, signal: options.signal }),
    );
  }

  throwIfAborted();
  return analyzeRepoDeterministic(normalizedRepoUrl, fetchResult.commit, options.checkoutDirectory);
}
