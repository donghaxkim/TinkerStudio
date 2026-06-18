import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

export function resolveWorkspaceEnvPath(importMetaUrl: string) {
  return fileURLToPath(new URL("../../../.env", importMetaUrl));
}

export function loadLocalEnvFile(path = ".env") {
  try {
    loadEnvFile(path);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}
