import { useEffect, useMemo, useState } from "react";
import {
  applyManualEditOperation,
  type EditorCommand,
  type ManualEditOperation,
  type ManualEditOperationsError,
  type SelectedEntity,
  type SelectedRange,
} from "@tinker/editor";
import type { Clip, DemoProject, ZoomKeyframe } from "@tinker/project-schema";

type EditorManualControlsProps = {
  project: DemoProject;
  selectedEntity?: SelectedEntity;
  selectedRange?: SelectedRange;
  onSelectEntity: (entity: SelectedEntity | undefined) => void;
  onApply: (project: DemoProject, command: EditorCommand) => void;
};

type ManualEditStatus =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; error: ManualEditOperationsError };

const ZOOM_EASINGS = ["linear", "easeIn", "easeOut", "easeInOut"] as const;
type ZoomEasing = (typeof ZOOM_EASINGS)[number];

const fieldStyle = { display: "grid", gap: 5, fontSize: 12, color: "var(--tk-text-sec)" } as const;
const inputStyle = {
  padding: "8px 10px",
  borderRadius: "var(--tk-radius-sm)",
  border: "1px solid var(--tk-border)",
  background: "var(--tk-card)",
  color: "var(--tk-text)",
  font: "inherit",
} as const;

/** Format seconds as `m:ss.s` (e.g. 8 → "0:08.0", 12.4 → "0:12.4"). */
function formatTimecode(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  const rounded = remainder.toFixed(1);
  const padded = parseFloat(rounded) < 10 ? `0${rounded}` : rounded;
  return `${minutes}:${padded}`;
}

/** Parse a text input as a finite number, or undefined when blank/invalid. */
function parseNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function defaultZoomRange(project: DemoProject, selectedRange: SelectedRange | undefined) {
  if (selectedRange && selectedRange.end > selectedRange.start) {
    return { start: selectedRange.start, end: Math.min(selectedRange.end, project.duration) };
  }
  return { start: 0, end: Math.min(project.duration, 3) };
}

function ErrorList({ error }: { error: ManualEditOperationsError }) {
  return (
    <div
      role="alert"
      style={{
        padding: 10,
        borderRadius: "var(--tk-radius-md)",
        border: "1px solid var(--tk-accent-line)",
        background: "var(--tk-accent-soft)",
        color: "var(--tk-text)",
      }}
    >
      <strong style={{ fontSize: 12.5 }}>{error.message}</strong>
      {error.issues ? (
        <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--tk-text-sec)" }}>
          {error.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  ariaLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <label style={fieldStyle}>
      {label}
      <input
        type="number"
        aria-label={ariaLabel}
        style={inputStyle}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

// ─── Zoom editor ──────────────────────────────────────────────────────────────

function ZoomEditor({
  zoom,
  project,
  onApply,
  onSelectEntity,
}: {
  zoom: ZoomKeyframe;
  project: DemoProject;
  onApply: (operation: ManualEditOperation) => void;
  onSelectEntity: (entity: SelectedEntity | undefined) => void;
}) {
  const [start, setStart] = useState(String(zoom.start));
  const [end, setEnd] = useState(String(zoom.end));
  const [x, setX] = useState(String(zoom.target.x));
  const [y, setY] = useState(String(zoom.target.y));
  const [width, setWidth] = useState(String(zoom.target.width));
  const [height, setHeight] = useState(String(zoom.target.height));
  const [easing, setEasing] = useState<ZoomEasing>(zoom.easing);
  const [localError, setLocalError] = useState<string | undefined>();

  // Re-prefill when the selected zoom changes (different id or refreshed project).
  useEffect(() => {
    setStart(String(zoom.start));
    setEnd(String(zoom.end));
    setX(String(zoom.target.x));
    setY(String(zoom.target.y));
    setWidth(String(zoom.target.width));
    setHeight(String(zoom.target.height));
    setEasing(zoom.easing);
    setLocalError(undefined);
  }, [zoom.id, zoom.start, zoom.end, zoom.target.x, zoom.target.y, zoom.target.width, zoom.target.height, zoom.easing]);

  function handleUpdate() {
    const startValue = parseNumber(start);
    const endValue = parseNumber(end);
    const xValue = parseNumber(x);
    const yValue = parseNumber(y);
    const widthValue = parseNumber(width);
    const heightValue = parseNumber(height);

    if (
      startValue === undefined ||
      endValue === undefined ||
      xValue === undefined ||
      yValue === undefined ||
      widthValue === undefined ||
      heightValue === undefined
    ) {
      setLocalError("Every zoom field needs a number.");
      return;
    }
    if (widthValue <= 0 || heightValue <= 0) {
      setLocalError("Zoom width and height must be positive.");
      return;
    }
    setLocalError(undefined);
    onApply({
      type: "upsert_zoom",
      id: zoom.id,
      start: startValue,
      end: endValue,
      target: { x: xValue, y: yValue, width: widthValue, height: heightValue },
      easing,
    });
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: "var(--tk-text-sec)" }}>
        Editing <strong style={{ color: "var(--tk-text)" }}>this zoom</strong>
        {zoom.scale !== undefined ? ` (×${zoom.scale})` : ""}.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        <NumberField label="Start (s)" ariaLabel="Zoom start" value={start} onChange={setStart} />
        <NumberField label="End (s)" ariaLabel="Zoom end" value={end} onChange={setEnd} />
        <NumberField label="Target x" ariaLabel="Zoom target x" value={x} onChange={setX} />
        <NumberField label="Target y" ariaLabel="Zoom target y" value={y} onChange={setY} />
        <NumberField label="Target width" ariaLabel="Zoom target width" value={width} onChange={setWidth} />
        <NumberField label="Target height" ariaLabel="Zoom target height" value={height} onChange={setHeight} />
        <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
          Easing
          <select
            aria-label="Zoom easing"
            style={inputStyle}
            value={easing}
            onChange={(event) => setEasing(event.target.value as ZoomEasing)}
          >
            {ZOOM_EASINGS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      {localError ? (
        <div
          role="alert"
          style={{
            padding: 10,
            borderRadius: "var(--tk-radius-md)",
            border: "1px solid var(--tk-accent-line)",
            background: "var(--tk-accent-soft)",
            color: "var(--tk-text)",
            fontSize: 12.5,
          }}
        >
          {localError}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="tk-btn tk-btn-accent" onClick={handleUpdate}>
          Update zoom
        </button>
        <button
          type="button"
          className="tk-btn"
          onClick={() => {
            onApply({ type: "remove_entity", entityType: "zoom", id: zoom.id });
            onSelectEntity(undefined);
          }}
        >
          Delete zoom
        </button>
      </div>
    </div>
  );
}

// ─── Clip editor ──────────────────────────────────────────────────────────────

function ClipEditor({ clip, onApply }: { clip: Clip; onApply: (operation: ManualEditOperation) => void }) {
  const [start, setStart] = useState(String(clip.start));
  const [end, setEnd] = useState(String(clip.end));
  const [sourceStart, setSourceStart] = useState(clip.sourceStart === undefined ? "" : String(clip.sourceStart));
  const [sourceEnd, setSourceEnd] = useState(clip.sourceEnd === undefined ? "" : String(clip.sourceEnd));
  const [localError, setLocalError] = useState<string | undefined>();

  useEffect(() => {
    setStart(String(clip.start));
    setEnd(String(clip.end));
    setSourceStart(clip.sourceStart === undefined ? "" : String(clip.sourceStart));
    setSourceEnd(clip.sourceEnd === undefined ? "" : String(clip.sourceEnd));
    setLocalError(undefined);
  }, [clip.id, clip.start, clip.end, clip.sourceStart, clip.sourceEnd]);

  function handleTrim() {
    const startValue = parseNumber(start);
    const endValue = parseNumber(end);

    if (startValue === undefined || endValue === undefined) {
      setLocalError("Clip start and end both need a number.");
      return;
    }
    setLocalError(undefined);
    onApply({
      type: "trim_clip",
      id: clip.id,
      start: startValue,
      end: endValue,
      sourceStart: parseNumber(sourceStart),
      sourceEnd: parseNumber(sourceEnd),
    });
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: "var(--tk-text-sec)" }}>
        Trimming <strong style={{ color: "var(--tk-text)" }}>{clip.name ?? clip.id}</strong>.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        <NumberField label="Start (s)" ariaLabel="Clip start" value={start} onChange={setStart} />
        <NumberField label="End (s)" ariaLabel="Clip end" value={end} onChange={setEnd} />
        <NumberField label="Source start (s)" ariaLabel="Clip source start" value={sourceStart} onChange={setSourceStart} />
        <NumberField label="Source end (s)" ariaLabel="Clip source end" value={sourceEnd} onChange={setSourceEnd} />
      </div>

      {localError ? (
        <div
          role="alert"
          style={{
            padding: 10,
            borderRadius: "var(--tk-radius-md)",
            border: "1px solid var(--tk-accent-line)",
            background: "var(--tk-accent-soft)",
            color: "var(--tk-text)",
            fontSize: 12.5,
          }}
        >
          {localError}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="tk-btn tk-btn-accent" onClick={handleTrim}>
          Trim clip
        </button>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EditorManualControls({
  project,
  selectedEntity,
  selectedRange,
  onSelectEntity,
  onApply,
}: EditorManualControlsProps) {
  const [status, setStatus] = useState<ManualEditStatus>({ kind: "idle" });

  const clips = useMemo(
    () => project.tracks.flatMap((track) => track.clips),
    [project.tracks],
  );

  const selectedZoom = useMemo(
    () => (selectedEntity?.type === "zoom" ? project.zooms.find((zoom) => zoom.id === selectedEntity.id) : undefined),
    [project.zooms, selectedEntity],
  );
  const selectedClip = useMemo(
    () => (selectedEntity?.type === "clip" ? clips.find((clip) => clip.id === selectedEntity.id) : undefined),
    [clips, selectedEntity],
  );

  // Clear a stale selection when the referenced entity is no longer in the project.
  useEffect(() => {
    if (!selectedEntity) return;
    const exists =
      selectedEntity.type === "zoom"
        ? project.zooms.some((zoom) => zoom.id === selectedEntity.id)
        : clips.some((clip) => clip.id === selectedEntity.id);
    if (!exists) onSelectEntity(undefined);
  }, [selectedEntity, project.zooms, clips, onSelectEntity]);

  function apply(operation: ManualEditOperation) {
    const result = applyManualEditOperation(project, operation);

    if (!result.ok) {
      setStatus({ kind: "error", error: result.error });
      return;
    }

    setStatus({ kind: "success", message: result.command.label });
    onApply(result.project, result.command);
  }

  function handleAddZoom() {
    const range = defaultZoomRange(project, selectedRange);
    const target = project.zooms[0]?.target ?? { x: 620, y: 260, width: 620, height: 380 };
    apply({ type: "upsert_zoom", start: range.start, end: range.end, target, easing: "easeInOut" });
  }

  return (
    <section
      aria-label="Manual edit controls"
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
      {/* ── Zoom moves rowcard list ─────────────────────────────────────────── */}
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <p
            style={{
              margin: 0,
              color: "var(--tk-text-ter)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Zoom moves · {project.zooms.length}
          </p>
          <button type="button" className="tk-btn" onClick={handleAddZoom}>
            Add zoom
          </button>
        </div>

        {project.zooms.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--tk-text-sec)" }}>
            No zoom moves yet. Add one to push in on a moment.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
            {project.zooms.map((zoom, index) => {
              const isSelected = selectedEntity?.type === "zoom" && selectedEntity.id === zoom.id;
              return (
                <li key={zoom.id}>
                  <button
                    type="button"
                    className="tk-rowcard"
                    aria-label={`Zoom ${index + 1}`}
                    aria-pressed={isSelected}
                    onClick={() => onSelectEntity({ type: "zoom", id: zoom.id })}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      background: isSelected ? "var(--tk-accent-soft)" : "var(--tk-card)",
                      borderColor: isSelected ? "var(--tk-accent)" : "var(--tk-border)",
                      color: "var(--tk-text)",
                    }}
                  >
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>Zoom {index + 1}</span>
                    <span
                      style={{
                        marginLeft: "auto",
                        fontFamily: "var(--tk-mono)",
                        fontSize: 11.5,
                        color: "var(--tk-text-sec)",
                      }}
                    >
                      {formatTimecode(zoom.start)} → {formatTimecode(zoom.end)}
                      {zoom.scale !== undefined ? `  ×${zoom.scale}` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p style={{ margin: 0, fontSize: 11, color: "var(--tk-text-ter)" }}>
          Select a move to jump there. Delete removes it from the timeline.
        </p>
      </div>

      {/* ── Selected-item editor ────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gap: 10,
          paddingTop: 12,
          borderTop: "1px solid var(--tk-border)",
        }}
      >
        {selectedZoom ? (
          <ZoomEditor zoom={selectedZoom} project={project} onApply={apply} onSelectEntity={onSelectEntity} />
        ) : selectedClip ? (
          <ClipEditor clip={selectedClip} onApply={apply} />
        ) : (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--tk-text-sec)", lineHeight: 1.5 }}>
            Select a clip or zoom from the timeline — or a move above — to edit just that item.
          </p>
        )}
      </div>

      {status.kind === "success" ? (
        <p role="status" style={{ margin: 0, color: "var(--tk-ok)", fontSize: 12.5 }}>
          {status.message}
        </p>
      ) : null}
      {status.kind === "error" ? <ErrorList error={status.error} /> : null}
    </section>
  );
}
