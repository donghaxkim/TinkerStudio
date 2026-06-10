import { isAbsolute, normalize, sep } from "node:path";
import type { RepoAnalysis } from "./types.js";

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
  if (isAbsolute(path)) {
    return false;
  }

  const normalized = normalize(path);
  return normalized !== "." && normalized !== ".." && !normalized.startsWith(`..${sep}`);
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
