/**
 * Tiny settings-storage helper for local prototype controls.
 * Keys are clearly namespaced to avoid collisions with project storage.
 *
 * Sanitization rules for export directory:
 * - Must be a non-empty string.
 * - No leading `/` (no absolute paths).
 * - No `..` segments (no path traversal).
 * - Leading/trailing slashes trimmed.
 * - Falls back to `"generated"` when any rule is violated or value is empty.
 */

export const EXPORT_DIRECTORY_STORAGE_KEY = "tinker.settings.exportDirectory.v1";
export const DEFAULT_EXPORT_DIRECTORY = "generated";

/**
 * Sanitize a user-supplied export directory value.
 * Returns `DEFAULT_EXPORT_DIRECTORY` for any invalid input.
 */
export function sanitizeExportDirectory(raw: string): string {
  // Trim surrounding slashes and whitespace
  const trimmed = raw.trim().replace(/^\/+|\/+$/g, "");

  if (!trimmed) {
    return DEFAULT_EXPORT_DIRECTORY;
  }

  // Reject any segment that is `.` or `..` (path traversal)
  const segments = trimmed.split("/");
  for (const seg of segments) {
    if (seg === "." || seg === "..") {
      return DEFAULT_EXPORT_DIRECTORY;
    }
  }

  return trimmed;
}

function getDefaultStorage(): Storage {
  return window.localStorage;
}

export function getExportDirectory(storage: Storage = getDefaultStorage()): string {
  try {
    const raw = storage.getItem(EXPORT_DIRECTORY_STORAGE_KEY);
    if (raw === null) return DEFAULT_EXPORT_DIRECTORY;
    return sanitizeExportDirectory(raw);
  } catch {
    return DEFAULT_EXPORT_DIRECTORY;
  }
}

export function setExportDirectory(
  value: string,
  storage: Storage = getDefaultStorage(),
): void {
  const sanitized = sanitizeExportDirectory(value);
  try {
    storage.setItem(EXPORT_DIRECTORY_STORAGE_KEY, sanitized);
  } catch {
    // localStorage unavailable — silently no-op
  }
}
