import type { DemoProject } from "@tinker/project-schema";
import {
  deserializeDemoProjectJson,
  serializeDemoProject,
  type DeserializeDemoProjectJsonResult,
  type ProjectPersistenceError,
} from "@tinker/editor";

export const LOCAL_PROJECT_STORAGE_KEY = "tinker.currentProject.v1";

export type SaveProjectToStorageResult =
  | { ok: true }
  | { ok: false; error: ProjectPersistenceError };

export type ProjectJsonDownload = {
  filename: string;
  contents: string;
  mimeType: "application/json";
};

export type ProjectJsonDownloadResult =
  | ({ ok: true } & ProjectJsonDownload)
  | { ok: false; error: ProjectPersistenceError };

function getDefaultStorage(): Storage {
  return window.localStorage;
}

function storageError(error: unknown): ProjectPersistenceError {
  return {
    message: "Project storage failed",
    issues: [error instanceof Error ? error.message : "Unknown storage error"],
  };
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "demo-project";
}

export function saveProjectToStorage(
  project: DemoProject,
  storage: Storage = getDefaultStorage(),
): SaveProjectToStorageResult {
  const serialized = serializeDemoProject(project);

  if (!serialized.ok) {
    return serialized;
  }

  try {
    storage.setItem(LOCAL_PROJECT_STORAGE_KEY, serialized.json);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: storageError(error) };
  }
}

export function loadProjectFromStorage(
  storage: Storage = getDefaultStorage(),
): DeserializeDemoProjectJsonResult {
  let json: string | null;

  try {
    json = storage.getItem(LOCAL_PROJECT_STORAGE_KEY);
  } catch (error) {
    return { ok: false, error: storageError(error) };
  }

  if (json === null) {
    return {
      ok: false,
      error: {
        message: "No saved DemoProject",
        issues: ["No project snapshot exists in browser storage"],
      },
    };
  }

  return deserializeDemoProjectJson(json);
}

export function createProjectJsonDownload(project: DemoProject): ProjectJsonDownloadResult {
  const serialized = serializeDemoProject(project);

  if (!serialized.ok) {
    return serialized;
  }

  return {
    ok: true,
    filename: `${slugify(project.title)}-${slugify(project.id)}.json`,
    contents: serialized.json,
    mimeType: "application/json",
  };
}
