import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_EXPORT_DIRECTORY,
  EXPORT_DIRECTORY_STORAGE_KEY,
  getExportDirectory,
  sanitizeExportDirectory,
  setExportDirectory,
} from "./appSettings.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeStorage(): Storage {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
}

afterEach(() => {
  window.localStorage.removeItem(EXPORT_DIRECTORY_STORAGE_KEY);
});

// ─── sanitizeExportDirectory ──────────────────────────────────────────────────

describe("sanitizeExportDirectory", () => {
  it("returns the value as-is for a clean relative dir", () => {
    expect(sanitizeExportDirectory("output")).toBe("output");
    expect(sanitizeExportDirectory("my/export/dir")).toBe("my/export/dir");
  });

  it("trims leading and trailing slashes", () => {
    expect(sanitizeExportDirectory("/output/")).toBe("output");
    expect(sanitizeExportDirectory("//output//")).toBe("output");
  });

  it("preserves empty segments from a double-slash in the middle (a//b behaviour)", () => {
    // sanitize trims outer slashes but does not collapse inner '//' —
    // the empty segment produced by "a//b" is kept as-is.
    expect(sanitizeExportDirectory("a//b")).toBe("a//b");
  });

  it("trims whitespace", () => {
    expect(sanitizeExportDirectory("  output  ")).toBe("output");
  });

  it("rejects '..' segments — falls back to default", () => {
    expect(sanitizeExportDirectory("../escape")).toBe(DEFAULT_EXPORT_DIRECTORY);
    expect(sanitizeExportDirectory("foo/../bar")).toBe(DEFAULT_EXPORT_DIRECTORY);
    expect(sanitizeExportDirectory("..")).toBe(DEFAULT_EXPORT_DIRECTORY);
  });

  it("strips a leading slash and normalizes to a relative path", () => {
    // After trimming leading slashes the absolute check is implicit through the `/` trim,
    // but verify the path-traversal guard catches "." segments too.
    expect(sanitizeExportDirectory("/absolute/path")).toBe("absolute/path");
  });

  it("returns default for empty string", () => {
    expect(sanitizeExportDirectory("")).toBe(DEFAULT_EXPORT_DIRECTORY);
  });

  it("returns default for whitespace-only string", () => {
    expect(sanitizeExportDirectory("   ")).toBe(DEFAULT_EXPORT_DIRECTORY);
  });
});

// ─── get/set round-trip ───────────────────────────────────────────────────────

describe("getExportDirectory / setExportDirectory", () => {
  it("returns the default when nothing is stored", () => {
    const storage = makeStorage();
    expect(getExportDirectory(storage)).toBe(DEFAULT_EXPORT_DIRECTORY);
  });

  it("round-trips a clean value", () => {
    const storage = makeStorage();
    setExportDirectory("rendered", storage);
    expect(getExportDirectory(storage)).toBe("rendered");
  });

  it("stores the sanitized value — not the raw one", () => {
    const storage = makeStorage();
    setExportDirectory("  /output/  ", storage);
    expect(storage.getItem(EXPORT_DIRECTORY_STORAGE_KEY)).toBe("output");
    expect(getExportDirectory(storage)).toBe("output");
  });

  it("persists under the expected key", () => {
    const storage = makeStorage();
    setExportDirectory("videos", storage);
    expect(storage.getItem(EXPORT_DIRECTORY_STORAGE_KEY)).toBe("videos");
  });

  it("falls back to default after a '..' traversal attempt", () => {
    const storage = makeStorage();
    setExportDirectory("../dangerous", storage);
    expect(getExportDirectory(storage)).toBe(DEFAULT_EXPORT_DIRECTORY);
  });
});
