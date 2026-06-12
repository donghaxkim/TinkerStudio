import { useMemo, useState, type ChangeEvent } from "react";
import type { DemoProject } from "@tinker/project-schema";
import { deserializeDemoProjectJson, MAX_DEMO_PROJECT_JSON_BYTES, type ProjectPersistenceError } from "@tinker/editor";
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
    <div role="alert" style={{ padding: 12, borderRadius: "var(--tk-radius-md)", border: "1px solid var(--tk-accent-line)", background: "var(--tk-accent-soft)", color: "var(--tk-text)" }}>
      <strong style={{ fontSize: 12.5 }}>{error.message}</strong>
      <ul style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 12, color: "var(--tk-text-sec)" }}>
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

function projectFileTooLargeError(): ProjectPersistenceError {
  return {
    message: "Project JSON is too large",
    issues: [`DemoProject JSON must be ${MAX_DEMO_PROJECT_JSON_BYTES} bytes or less`],
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

    if (file.size > MAX_DEMO_PROJECT_JSON_BYTES) {
      setStatus({ kind: "error", error: projectFileTooLargeError() });
      return;
    }

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
    <section
      aria-label="Project persistence"
      style={{
        display: "grid",
        gap: 12,
        padding: 14,
        border: "1px solid var(--tk-border)",
        borderRadius: "var(--tk-radius-lg)",
        background: "var(--tk-card)",
        color: "var(--tk-text)",
      }}
    >
      <div>
        <h2 style={{ margin: 0, fontSize: 14 }}>Project save / load</h2>
        <p style={{ margin: "6px 0 0", color: "var(--tk-text-sec)", fontSize: 12.5 }}>Persists the full validated DemoProject JSON. Asset references stay by asset.id.</p>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="tk-btn" onClick={saveProject}>
          Save project
        </button>
        <button type="button" className="tk-btn" onClick={loadSavedProject}>
          Load saved project
        </button>
        {download.ok ? (
          <a
            className="tk-btn"
            download={download.filename}
            href={`data:${download.mimeType};charset=utf-8,${encodeURIComponent(download.contents)}`}
            style={{ textDecoration: "none" }}
          >
            Download JSON
          </a>
        ) : null}
        <label className="tk-btn" style={{ cursor: "pointer" }}>
          Load project JSON file
          <input type="file" accept="application/json,.json" onChange={loadProjectFile} style={{ display: "none" }} />
        </label>
      </div>

      {status.kind === "success" ? <p style={{ margin: 0, color: "var(--tk-ok)", fontSize: 12.5 }}>{status.message}</p> : null}
      {status.kind === "error" ? <ErrorList error={status.error} /> : null}
      {!download.ok ? <ErrorList error={download.error} /> : null}
    </section>
  );
}
