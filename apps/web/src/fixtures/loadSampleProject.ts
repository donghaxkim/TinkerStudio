import type { DemoProject } from "@tinker/project-schema";
import { DemoProjectSchema } from "@tinker/project-schema";
import sampleProjectInput from "../../../../packages/project-schema/fixtures/demo-project.sample.json";

export type ProjectLoadResult =
  | { ok: true; project: DemoProject }
  | { ok: false; error: { message: string; issues: string[] } };

export function formatValidationIssues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "project";
    return `${path}: ${issue.message}`;
  });
}

export function loadDemoProject(input: unknown): ProjectLoadResult {
  const result = DemoProjectSchema.safeParse(input);

  if (!result.success) {
    return {
      ok: false,
      error: {
        message: "DemoProject validation failed",
        issues: formatValidationIssues(result.error),
      },
    };
  }

  return { ok: true, project: result.data };
}

export function loadSampleProject(): ProjectLoadResult {
  return loadDemoProject(sampleProjectInput);
}
