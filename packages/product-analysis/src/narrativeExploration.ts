import type { NarrativeExploration, NarrativeWorkflowCandidate } from "./types.js";

type NarrativeArrayField = "strongestCopy" | "avoidNarratives" | "explorationNotes";

const rootStringLimits = {
  productSummary: 500,
  bestDemoAngle: 500,
  userProblem: 500,
  promisedOutcome: 500,
} as const;

const narrativeArrayLimits: Record<NarrativeArrayField, { maxEntries: number; maxLength: number }> = {
  strongestCopy: { maxEntries: 10, maxLength: 180 },
  avoidNarratives: { maxEntries: 10, maxLength: 180 },
  explorationNotes: { maxEntries: 10, maxLength: 180 },
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

function parseStringArray(value: unknown, fieldName: NarrativeArrayField) {
  const limit = narrativeArrayLimits[fieldName];
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  if (value.length > limit.maxEntries) {
    throw new Error(`${fieldName} must contain at most ${limit.maxEntries} entries`);
  }

  return value.map((entry, index) => requireString(entry, `${fieldName}.${index}`, limit.maxLength));
}

function isSameOriginPathOrShortRouteLabel(value: string, productUrl: string) {
  if (value.length > 120 || value.includes("\n") || value.includes("\r")) {
    return false;
  }

  if (value.startsWith("/")) {
    return !value.startsWith("//");
  }

  try {
    const routeUrl = new URL(value);
    const baseUrl = new URL(productUrl);
    return routeUrl.origin === baseUrl.origin;
  } catch {
    return !value.includes("://") && !value.startsWith("javascript:") && value.trim().length > 0;
  }
}

function parseRouteHints(value: unknown, fieldName: string, productUrl: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  if (value.length > 8) {
    throw new Error(`${fieldName} must contain at most 8 entries`);
  }

  return value.map((entry, index) => {
    const hint = requireString(entry, `${fieldName}.${index}`, 120);
    if (!isSameOriginPathOrShortRouteLabel(hint, productUrl)) {
      throw new Error(`${fieldName}.${index} must be a same-origin path or short route label`);
    }
    return hint;
  });
}

function parseVisibleEvidence(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  if (value.length > 8) {
    throw new Error(`${fieldName} must contain at most 8 entries`);
  }

  return value.map((entry, index) => requireString(entry, `${fieldName}.${index}`, 180));
}

function parseStoryboardUse(value: unknown, fieldName: string): NarrativeWorkflowCandidate["storyboardUse"] {
  if (value === "hook" || value === "main-demo" || value === "proof" || value === "cta") {
    return value;
  }

  throw new Error(`${fieldName} must be hook, main-demo, proof, or cta`);
}

function parseWorkflowCandidates(value: unknown, productUrl: string) {
  if (!Array.isArray(value)) {
    throw new Error("workflowCandidates must be an array");
  }

  if (value.length > 6) {
    throw new Error("workflowCandidates must contain at most 6 entries");
  }

  return value.map((entry, index): NarrativeWorkflowCandidate => {
    if (!isRecord(entry)) {
      throw new Error(`workflowCandidates.${index} must be an object`);
    }

    return {
      name: requireString(entry.name, `workflowCandidates.${index}.name`, 120),
      whyItMatters: requireString(entry.whyItMatters, `workflowCandidates.${index}.whyItMatters`, 240),
      routeHints: parseRouteHints(entry.routeHints, `workflowCandidates.${index}.routeHints`, productUrl),
      visibleEvidence: parseVisibleEvidence(entry.visibleEvidence, `workflowCandidates.${index}.visibleEvidence`),
      storyboardUse: parseStoryboardUse(entry.storyboardUse, `workflowCandidates.${index}.storyboardUse`),
    };
  });
}

export function parseNarrativeExploration(value: unknown, productUrl: string): NarrativeExploration {
  if (!isRecord(value)) {
    throw new Error("NarrativeExploration must be an object");
  }

  return {
    productSummary: requireString(value.productSummary, "productSummary", rootStringLimits.productSummary),
    bestDemoAngle: requireString(value.bestDemoAngle, "bestDemoAngle", rootStringLimits.bestDemoAngle),
    userProblem: requireString(value.userProblem, "userProblem", rootStringLimits.userProblem),
    promisedOutcome: requireString(value.promisedOutcome, "promisedOutcome", rootStringLimits.promisedOutcome),
    workflowCandidates: parseWorkflowCandidates(value.workflowCandidates, productUrl),
    strongestCopy: parseStringArray(value.strongestCopy, "strongestCopy"),
    avoidNarratives: parseStringArray(value.avoidNarratives, "avoidNarratives"),
    explorationNotes: parseStringArray(value.explorationNotes, "explorationNotes"),
  };
}
