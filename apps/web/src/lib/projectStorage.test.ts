import { describe, expect, it } from "vitest";
import { loadSampleProject } from "../fixtures/loadSampleProject.js";
import {
  LOCAL_PROJECT_STORAGE_KEY,
  clearProjectStorage,
  createProjectJsonDownload,
  loadProjectFromStorage,
  saveProjectToStorage,
} from "./projectStorage.js";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const loadedSample = loadSampleProject();
if (!loadedSample.ok) throw new Error("sample project fixture must be valid");
const sampleProject = loadedSample.project;

describe("projectStorage", () => {
  it("saves and loads a full DemoProject JSON snapshot", () => {
    const storage = new MemoryStorage();

    const saved = saveProjectToStorage(sampleProject, storage);
    expect(saved.ok).toBe(true);
    expect(storage.getItem(LOCAL_PROJECT_STORAGE_KEY)).toContain('"aiEditHistory"');

    const loaded = loadProjectFromStorage(storage);
    expect(loaded).toEqual({ ok: true, project: sampleProject });
  });

  it("rejects invalid stored JSON before opening a project", () => {
    const storage = new MemoryStorage();
    storage.setItem(LOCAL_PROJECT_STORAGE_KEY, "{bad json");

    const loaded = loadProjectFromStorage(storage);

    expect(loaded.ok).toBe(false);
    if (loaded.ok) throw new Error("expected load failure");
    expect(loaded.error.message).toBe("Project JSON could not be parsed");
  });

  it("rejects stored JSON that fails DemoProject validation", () => {
    const storage = new MemoryStorage();
    storage.setItem(LOCAL_PROJECT_STORAGE_KEY, JSON.stringify({ ...sampleProject, duration: -1 }));

    const loaded = loadProjectFromStorage(storage);

    expect(loaded.ok).toBe(false);
    if (loaded.ok) throw new Error("expected load failure");
    expect(loaded.error.message).toBe("DemoProject validation failed");
  });

  it("creates a deterministic JSON download payload", () => {
    const download = createProjectJsonDownload(sampleProject);

    expect(download.ok).toBe(true);
    if (!download.ok) throw new Error("expected download success");
    expect(download.filename).toBe("sample-product-demo-demo-project-sample.json");
    expect(download.mimeType).toBe("application/json");
    expect(JSON.parse(download.contents)).toEqual(sampleProject);
  });

  it("clears the saved project snapshot", () => {
    const storage = new MemoryStorage();
    storage.setItem(LOCAL_PROJECT_STORAGE_KEY, "{}");

    expect(clearProjectStorage(storage)).toEqual({ ok: true });
    expect(storage.getItem(LOCAL_PROJECT_STORAGE_KEY)).toBeNull();
  });
});
