import type { DemoProject } from "@tinker/project-schema";
import { DemoProjectSchema } from "@tinker/project-schema";

export type ProjectPersistenceError = {
  message: string;
  issues: string[];
};

export type SerializeDemoProjectResult =
  | { ok: true; json: string }
  | { ok: false; error: ProjectPersistenceError };

export type DeserializeDemoProjectJsonResult =
  | { ok: true; project: DemoProject }
  | { ok: false; error: ProjectPersistenceError };

export type ProjectValidationIssue = {
  path: PropertyKey[];
  message: string;
};

export function formatProjectValidationIssues(issues: ProjectValidationIssue[]): string[] {
  return issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "project";
    return `${path}: ${issue.message}`;
  });
}

export function serializeDemoProject(project: DemoProject): SerializeDemoProjectResult {
  const result = DemoProjectSchema.safeParse(project);

  if (!result.success) {
    return {
      ok: false,
      error: {
        message: "DemoProject validation failed",
        issues: formatProjectValidationIssues(result.error.issues),
      },
    };
  }

  return { ok: true, json: `${JSON.stringify(result.data, null, 2)}\n` };
}

export function deserializeDemoProjectJson(json: string): DeserializeDemoProjectJsonResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json) as unknown;
  } catch (error) {
    return {
      ok: false,
      error: {
        message: "Project JSON could not be parsed",
        issues: [error instanceof Error ? error.message : "Unknown JSON parse error"],
      },
    };
  }

  const result = DemoProjectSchema.safeParse(parsed);

  if (!result.success) {
    return {
      ok: false,
      error: {
        message: "DemoProject validation failed",
        issues: formatProjectValidationIssues(result.error.issues),
      },
    };
  }

  return { ok: true, project: result.data };
}
