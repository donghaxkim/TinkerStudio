import { useEffect, useState } from "react";
import {
  acceptAutoZoomSuggestions,
  buildAutoZoomSuggestionState,
  type AutoZoomSuggestionState,
  type EditorCommand,
} from "@tinker/editor";
import type { DemoProject } from "@tinker/project-schema";

type EditorAutoZoomPanelProps = {
  project: DemoProject;
  previewSource?: PreviewSource;
  onPreviewProjectChange: (project: DemoProject | undefined) => void;
  onAccept: (project: DemoProject, command: EditorCommand) => void;
};

export type PreviewSource = "none" | "auto-zoom" | "ai";

type AutoZoomStatus =
  | { kind: "idle" }
  | { kind: "empty"; message: string }
  | { kind: "preview"; state: AutoZoomSuggestionState }
  | { kind: "error"; message: string };

function formatZoomRange(start: number, end: number) {
  return `${start.toFixed(1)}s to ${end.toFixed(1)}s`;
}

export function EditorAutoZoomPanel({ project, previewSource, onPreviewProjectChange, onAccept }: EditorAutoZoomPanelProps) {
  const [status, setStatus] = useState<AutoZoomStatus>({ kind: "idle" });

  useEffect(() => {
    setStatus({ kind: "idle" });
  }, [project]);

  useEffect(() => {
    if (status.kind === "preview" && previewSource !== undefined && previewSource !== "auto-zoom") {
      setStatus({ kind: "idle" });
    }
  }, [previewSource, status.kind]);

  function suggest() {
    const state = buildAutoZoomSuggestionState(project);

    if (state.suggestions.length === 0) {
      setStatus({ kind: "empty", message: "No useful cursor dwell found for new zooms." });
      onPreviewProjectChange(undefined);
      return;
    }

    setStatus({ kind: "preview", state });
    onPreviewProjectChange(state.previewProject);
  }

  function reject() {
    setStatus({ kind: "idle" });
    onPreviewProjectChange(undefined);
  }

  function accept() {
    if (status.kind !== "preview") {
      return;
    }

    const result = acceptAutoZoomSuggestions(project, status.state.suggestions);
    if (!result.ok) {
      setStatus({ kind: "error", message: result.error.message });
      return;
    }

    setStatus({ kind: "idle" });
    onAccept(result.project, result.command);
  }

  const suggestions = status.kind === "preview" ? status.state.suggestions : [];

  return (
    <section
      aria-label="Auto zoom suggestions"
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
        <p style={{ margin: 0, color: "var(--tk-text-ter)", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Auto zoom</p>
        <h2 style={{ margin: "4px 0 0", fontSize: 14 }}>Zoom on cursor dwell</h2>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="tk-btn tk-btn-accent" onClick={suggest}>Suggest zooms</button>
        <button type="button" className="tk-btn" disabled={status.kind !== "preview"} onClick={accept}>Accept all suggestions</button>
        <button type="button" className="tk-btn" disabled={status.kind !== "preview"} onClick={reject}>Reject suggestions</button>
      </div>

      {status.kind === "empty" ? <p role="status" style={{ margin: 0, color: "var(--tk-text-sec)", fontSize: 12.5 }}>{status.message}</p> : null}
      {status.kind === "error" ? <p role="alert" style={{ margin: 0, color: "var(--tk-accent)", fontSize: 12.5 }}>{status.message}</p> : null}

      {suggestions.length > 0 ? (
        <div role="status" style={{ display: "grid", gap: 8 }}>
          <strong style={{ fontSize: 12.5 }}>{suggestions.length} proposed zoom{suggestions.length === 1 ? "" : "s"}</strong>
          <ul style={{ display: "grid", gap: 6, margin: 0, paddingLeft: 18, color: "var(--tk-text-sec)", fontSize: 12.5 }}>
            {suggestions.map((zoom) => (
              <li key={zoom.id}>
                {zoom.id}: {formatZoomRange(zoom.start, zoom.end)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
