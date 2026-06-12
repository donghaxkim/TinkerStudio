import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { DemoProject } from "@tinker/project-schema";
import { deserializeDemoProjectJson, MAX_DEMO_PROJECT_JSON_BYTES, type ProjectPersistenceError } from "@tinker/editor";
import {
  createProjectJsonDownload,
  loadProjectFromStorage,
  saveProjectToStorage,
} from "../../lib/projectStorage.js";
import type { PersistenceOrigin } from "./EditorScreen.js";

export type ProjectSaveLoadControlsProps = {
  project: DemoProject;
  /** True when the project has unsaved edits — triggers a confirm before replace. */
  dirty?: boolean;
  onProjectLoaded: (project: DemoProject, origin: PersistenceOrigin) => void;
  /** Called after a successful save to storage. */
  onSaved?: () => void;
  /** Called after a successful download. */
  onDownloaded?: () => void;
};

type ProjectPersistenceStatus =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; error: ProjectPersistenceError };

/**
 * A pending "replace" action that is waiting for the user to confirm when dirty=true.
 * Stores the project and origin so the action can proceed after confirmation.
 */
type PendingReplace =
  | { kind: "storage"; project: DemoProject; origin: PersistenceOrigin }
  | { kind: "file"; project: DemoProject; origin: PersistenceOrigin };

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

export function ProjectSaveLoadControls({ project, dirty = false, onProjectLoaded, onSaved, onDownloaded }: ProjectSaveLoadControlsProps) {
  const [status, setStatus] = useState<ProjectPersistenceStatus>({ kind: "idle" });
  const [pendingReplace, setPendingReplace] = useState<PendingReplace | undefined>();
  const download = useMemo(() => createProjectJsonDownload(project), [project]);
  const replaceButtonRef = useRef<HTMLButtonElement>(null);

  // Fix 2: move focus to the Replace button when the confirm dialog appears
  useEffect(() => {
    if (pendingReplace) {
      replaceButtonRef.current?.focus?.();
    }
  }, [pendingReplace]);

  function saveProject() {
    const result = saveProjectToStorage(project);

    if (!result.ok) {
      setStatus({ kind: "error", error: result.error });
      return;
    }

    onSaved?.();
    setStatus({ kind: "success", message: "Project saved to browser storage." });
  }

  /** Attempt to load from storage — if dirty, show the inline confirm first. */
  function loadSavedProject() {
    const result = loadProjectFromStorage();

    if (!result.ok) {
      setStatus({ kind: "error", error: result.error });
      return;
    }

    if (dirty) {
      setStatus({ kind: "idle" });
      setPendingReplace({ kind: "storage", project: result.project, origin: "saved" });
      return;
    }

    commitReplace(result.project, "saved", "Project loaded from browser storage.");
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

    if (dirty) {
      setStatus({ kind: "idle" });
      setPendingReplace({ kind: "file", project: result.project, origin: "imported" });
      return;
    }

    commitReplace(result.project, "imported", "Project loaded from JSON file.");
  }

  function commitReplace(loaded: DemoProject, origin: PersistenceOrigin, message: string) {
    onProjectLoaded(loaded, origin);
    setPendingReplace(undefined);
    setStatus({ kind: "success", message });
  }

  function handleConfirmReplace() {
    if (!pendingReplace) return;
    const message =
      pendingReplace.kind === "storage"
        ? "Project loaded from browser storage."
        : "Project loaded from JSON file.";
    commitReplace(pendingReplace.project, pendingReplace.origin, message);
  }

  function handleCancelReplace() {
    setPendingReplace(undefined);
    setStatus({ kind: "idle" });
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
            onClick={() => onDownloaded?.()}
          >
            Download JSON
          </a>
        ) : null}
        <label className="tk-btn" style={{ cursor: "pointer" }}>
          Load project JSON file
          <input type="file" accept="application/json,.json" onChange={loadProjectFile} style={{ display: "none" }} />
        </label>
      </div>

      {/* Inline warn-before-replace confirm — no window.confirm so it is testable */}
      {pendingReplace ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="replace-confirm-heading"
          style={{
            padding: 12,
            borderRadius: "var(--tk-radius-md)",
            border: "1px solid var(--tk-accent-line)",
            background: "var(--tk-accent-soft)",
            color: "var(--tk-text)",
            display: "grid",
            gap: 10,
          }}
        >
          <p id="replace-confirm-heading" style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>You have unsaved changes — replace anyway?</p>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--tk-text-sec)" }}>
            The current project will be replaced and all unsaved edits will be lost.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button ref={replaceButtonRef} type="button" className="tk-btn tk-btn-accent" onClick={handleConfirmReplace}>
              Replace
            </button>
            <button type="button" className="tk-btn" onClick={handleCancelReplace}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {status.kind === "success" ? <p style={{ margin: 0, color: "var(--tk-ok)", fontSize: 12.5 }}>{status.message}</p> : null}
      {status.kind === "error" ? <ErrorList error={status.error} /> : null}
      {!download.ok ? <ErrorList error={download.error} /> : null}
    </section>
  );
}
