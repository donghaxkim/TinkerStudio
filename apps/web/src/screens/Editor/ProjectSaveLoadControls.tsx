import { useMemo, useState, type ChangeEvent } from "react";
import type { DemoProject } from "@tinker/project-schema";
import { deserializeDemoProjectJson, type ProjectPersistenceError } from "@tinker/editor";
import {
  createProjectJsonDownload,
  loadProjectFromStorage,
  saveProjectToStorage,
} from "../../lib/projectStorage.js";

export type ProjectSaveLoadControlsProps = {
  project: DemoProject;
  onProjectLoaded: (project: DemoProject) => void;
};

type ProjectPersistenceStatus =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; error: ProjectPersistenceError };

function ErrorList({ error }: { error: ProjectPersistenceError }) {
  return (
    <div role="alert" style={{ padding: 12, borderRadius: 10, border: "1px solid #7f1d1d", background: "#450a0a" }}>
      <strong>{error.message}</strong>
      <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
        {error.issues.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
    </div>
  );
}

function readFileAsText(file: File): Promise<string> {
  if ("text" in file && typeof file.text === "function") {
    return file.text();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Could not read project file")));
    reader.readAsText(file);
  });
}

function fileReadError(error: unknown): ProjectPersistenceError {
  return {
    message: "Project file could not be read",
    issues: [error instanceof Error ? error.message : "Unknown file read error"],
  };
}

export function ProjectSaveLoadControls({ project, onProjectLoaded }: ProjectSaveLoadControlsProps) {
  const [status, setStatus] = useState<ProjectPersistenceStatus>({ kind: "idle" });
  const download = useMemo(() => createProjectJsonDownload(project), [project]);

  function saveProject() {
    const result = saveProjectToStorage(project);

    if (!result.ok) {
      setStatus({ kind: "error", error: result.error });
      return;
    }

    setStatus({ kind: "success", message: "Project saved to browser storage." });
  }

  function loadSavedProject() {
    const result = loadProjectFromStorage();

    if (!result.ok) {
      setStatus({ kind: "error", error: result.error });
      return;
    }

    onProjectLoaded(result.project);
    setStatus({ kind: "success", message: "Project loaded from browser storage." });
  }

  async function loadProjectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file) return;

    let contents: string;

    try {
      contents = await readFileAsText(file);
    } catch (error) {
      setStatus({ kind: "error", error: fileReadError(error) });
      return;
    }

    const result = deserializeDemoProjectJson(contents);

    if (!result.ok) {
      setStatus({ kind: "error", error: result.error });
      return;
    }

    onProjectLoaded(result.project);
    setStatus({ kind: "success", message: "Project loaded from JSON file." });
  }

  return (
    <section aria-label="Project persistence" style={{ display: "grid", gap: 12, padding: 16, border: "1px solid #334155", borderRadius: 12, background: "#0f172a" }}>
      <div>
        <h2 style={{ margin: 0 }}>Project save/load</h2>
        <p style={{ margin: "6px 0 0", color: "#94a3b8" }}>Persists the full validated DemoProject JSON. Asset references stay by asset.id.</p>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" onClick={saveProject} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #334155", background: "#111827", color: "white" }}>
          Save project
        </button>
        <button type="button" onClick={loadSavedProject} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #334155", background: "#111827", color: "white" }}>
          Load saved project
        </button>
        {download.ok ? (
          <a
            download={download.filename}
            href={`data:${download.mimeType};charset=utf-8,${encodeURIComponent(download.contents)}`}
            style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #334155", background: "#111827", color: "white", textDecoration: "none" }}
          >
            Download JSON
          </a>
        ) : null}
        <label style={{ display: "inline-flex", gap: 8, alignItems: "center", padding: "8px 12px", borderRadius: 10, border: "1px solid #334155", background: "#111827", color: "white", cursor: "pointer" }}>
          Load project JSON file
          <input type="file" accept="application/json,.json" onChange={loadProjectFile} style={{ display: "none" }} />
        </label>
      </div>

      {status.kind === "success" ? <p style={{ margin: 0, color: "#bbf7d0" }}>{status.message}</p> : null}
      {status.kind === "error" ? <ErrorList error={status.error} /> : null}
      {!download.ok ? <ErrorList error={download.error} /> : null}
    </section>
  );
}
