import type { DemoProject } from "@tinker/project-schema";

export function freezeExportProjectSnapshot(project: DemoProject): DemoProject {
  const snapshot = structuredClone(project);
  return deepFreeze(snapshot);
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return value;
}
