import { useEffect, useMemo, useState } from "react";
import {
  applyManualEditOperation,
  type EditorCommand,
  type ManualEditOperation,
  type ManualEditOperationsError,
  type SelectedRange,
} from "@tinker/editor";
import type { DemoProject } from "@tinker/project-schema";

type EditorManualControlsProps = {
  project: DemoProject;
  selectedRange?: SelectedRange;
  onApply: (project: DemoProject, command: EditorCommand) => void;
};

type ManualEditStatus =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; error: ManualEditOperationsError };

const fieldStyle = { display: "grid", gap: 5 };
const inputStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #334155",
  background: "#020617",
  color: "white",
};
const buttonStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #334155",
  background: "#111827",
  color: "white",
  fontWeight: 700,
};

function formatRange(range: SelectedRange | undefined) {
  if (!range) return "No selected range";
  return `${range.start.toFixed(1)}s to ${range.end.toFixed(1)}s`;
}

function rangeOrDefault(project: DemoProject, selectedRange: SelectedRange | undefined) {
  if (selectedRange && selectedRange.end > selectedRange.start) {
    return selectedRange;
  }

  return { start: 0, end: Math.min(project.duration, 3) };
}

function ErrorList({ error }: { error: ManualEditOperationsError }) {
  return (
    <div role="alert" style={{ padding: 10, borderRadius: 8, border: "1px solid #7f1d1d", background: "#450a0a" }}>
      <strong>{error.message}</strong>
      {error.issues ? (
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          {error.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function EditorManualControls({ project, selectedRange, onApply }: EditorManualControlsProps) {
  const range = rangeOrDefault(project, selectedRange);
  const [status, setStatus] = useState<ManualEditStatus>({ kind: "idle" });
  const [zoomId, setZoomId] = useState(project.zooms[0]?.id ?? "");
  const [clipId, setClipId] = useState(project.tracks.flatMap((track) => track.clips)[0]?.id ?? "");

  const clips = useMemo(() => project.tracks.flatMap((track) => track.clips.map((clip) => ({ ...clip, trackName: track.name }))), [project]);
  const selectedZoom = useMemo(() => project.zooms.find((zoom) => zoom.id === zoomId), [project.zooms, zoomId]);
  const defaultTarget = project.zooms[0]?.target ?? { x: 620, y: 260, width: 620, height: 380 };

  useEffect(() => {
    if (zoomId && !project.zooms.some((zoom) => zoom.id === zoomId)) {
      setZoomId("");
    }
  }, [project.zooms, zoomId]);

  useEffect(() => {
    if (clipId && !clips.some((clip) => clip.id === clipId)) {
      setClipId(clips[0]?.id ?? "");
    }
  }, [clipId, clips]);

  function apply(operation: ManualEditOperation) {
    const result = applyManualEditOperation(project, operation, { selectedRange: range });

    if (!result.ok) {
      setStatus({ kind: "error", error: result.error });
      return;
    }

    setStatus({ kind: "success", message: result.command.label });
    onApply(result.project, result.command);
  }

  return (
    <section aria-label="Manual edit controls" style={{ display: "grid", gap: 12, padding: 16, border: "1px solid #334155", borderRadius: 12, background: "#0f172a" }}>
      <div>
        <p style={{ margin: 0, color: "#60a5fa", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Manual edits</p>
        <h2 style={{ margin: "4px 0 0" }}>Edit selected range</h2>
        <p style={{ margin: "6px 0 0", color: "#94a3b8" }}>Target: {formatRange(range)}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        <label style={fieldStyle}>
          Zoom
          <select aria-label="Zoom" style={inputStyle} value={zoomId} onChange={(event) => setZoomId(event.target.value)}>
            <option value="">New zoom</option>
            {project.zooms.map((zoom) => (
              <option key={zoom.id} value={zoom.id}>{zoom.id}</option>
            ))}
          </select>
        </label>
        <button type="button" style={buttonStyle} onClick={() => apply({ type: "upsert_zoom", start: range.start, end: range.end, target: defaultTarget, easing: "easeInOut" })}>
          Add zoom
        </button>
        <button type="button" style={buttonStyle} disabled={!selectedZoom} onClick={() => selectedZoom ? apply({ type: "upsert_zoom", id: selectedZoom.id, start: range.start, end: range.end, target: selectedZoom.target, easing: selectedZoom.easing }) : undefined}>
          Update zoom
        </button>

        <label style={fieldStyle}>
          Clip
          <select aria-label="Clip" style={inputStyle} value={clipId} onChange={(event) => setClipId(event.target.value)}>
            {clips.map((clip) => (
              <option key={clip.id} value={clip.id}>{clip.trackName}: {clip.name ?? clip.id}</option>
            ))}
          </select>
        </label>
        <button type="button" style={buttonStyle} disabled={!clipId} onClick={() => apply({ type: "trim_clip", id: clipId, start: range.start, end: range.end })}>
          Trim clip to range
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={buttonStyle} disabled={!zoomId} onClick={() => apply({ type: "remove_entity", entityType: "zoom", id: zoomId })}>Delete zoom</button>
      </div>

      {status.kind === "success" ? <p role="status" style={{ margin: 0, color: "#bbf7d0" }}>{status.message}</p> : null}
      {status.kind === "error" ? <ErrorList error={status.error} /> : null}
    </section>
  );
}
