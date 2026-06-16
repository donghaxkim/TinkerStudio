import { useState, type CSSProperties } from "react";
import {
  MAX_ZOOM_SCALE,
  MIN_ZOOM_SCALE,
  zoomEasing,
  zoomScale,
  type ZoomEasing,
  type ZoomUnit,
} from "./compositionTimelineModel.js";

export type ZoomPropertiesProps = {
  unit: ZoomUnit;
  /** Composition length, so timing inputs can bound themselves. */
  durationSeconds: number;
  /** Commit a new scale (slider releases as one edit). */
  onScale: (scale: number) => void;
  onEasing: (easing: ZoomEasing) => void;
  /** Move the start edge to `start` (the end stays put). */
  onStart: (start: number) => void;
  /** Move the end edge to `end`. */
  onEnd: (end: number) => void;
  /** Set the window length (moves the end edge to start + duration). */
  onDuration: (duration: number) => void;
  /** Restore scale / easing / target to their defaults. */
  onReset: () => void;
  onRemove: () => void;
  /** Leave the properties view (back to chat). */
  onClose?: () => void;
};

const EASINGS: { value: ZoomEasing; label: string }[] = [
  { value: "linear", label: "Linear" },
  { value: "ease-in", label: "Ease in" },
  { value: "ease-out", label: "Ease out" },
  { value: "ease-in-out", label: "Ease in-out" },
];

const rootStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  padding: "14px 4px 4px",
  fontFamily: "var(--tk-font)",
  color: "var(--tk-text, #1B1A17)",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const titleStyle: CSSProperties = { fontSize: 13, fontWeight: 600 };

const fieldStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };

const labelStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  fontFamily: "var(--tk-mono)",
  fontSize: 9.5,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--tk-text-ter, #9D9B94)",
};

const readoutStyle: CSSProperties = {
  fontFamily: "var(--tk-mono)",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--tk-text, #1B1A17)",
  textTransform: "none",
  letterSpacing: 0,
};

const sliderStyle: CSSProperties = { width: "100%", accentColor: "var(--tk-accent, #6C8CFF)", cursor: "pointer" };

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 8px",
  borderRadius: 7,
  border: "1px solid var(--tk-border, rgba(20,20,15,0.16))",
  background: "var(--tk-card, #FFFFFF)",
  fontFamily: "var(--tk-mono)",
  fontSize: 11.5,
  color: "var(--tk-text, #1B1A17)",
};

const selectStyle: CSSProperties = { ...inputStyle, cursor: "pointer", fontFamily: "var(--tk-font)" };

const timingRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 };

const actionsRowStyle: CSSProperties = { display: "flex", gap: 8, marginTop: 2 };

const ghostButtonStyle: CSSProperties = {
  flex: 1,
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid var(--tk-border, rgba(20,20,15,0.16))",
  background: "transparent",
  color: "var(--tk-text, #1B1A17)",
  fontFamily: "var(--tk-font)",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
};

const dangerButtonStyle: CSSProperties = {
  ...ghostButtonStyle,
  color: "var(--tk-danger, #C0392B)",
  borderColor: "var(--tk-danger-border, rgba(192,57,43,0.4))",
};

const doneButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--tk-accent, #6C8CFF)",
  fontFamily: "var(--tk-font)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  padding: "2px 4px",
};

/** Parse a number input; returns undefined for blank/non-numeric so callers can ignore it. */
function parseNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Contextual zoom property editor, rendered inside the right (chat) panel when a zoom unit is
 * selected — not a separate inspector. Scale is a slider that previews live and commits a single
 * edit on release; easing and the timing inputs commit on change. Reset/Remove/Done sit at the
 * bottom. All callbacks are routed by the screen through the undo/redo history.
 */
export function ZoomProperties({
  unit,
  durationSeconds,
  onScale,
  onEasing,
  onStart,
  onEnd,
  onDuration,
  onReset,
  onRemove,
  onClose,
}: ZoomPropertiesProps) {
  // Live slider preview: `draft` holds the in-flight value until the user releases the slider,
  // so a drag is one undoable edit (and the readout updates without committing every step).
  const [draft, setDraft] = useState<number | null>(null);
  const scale = draft ?? zoomScale(unit);
  const duration = Math.max(0, unit.end - unit.start);

  function commitScale() {
    if (draft === null) return;
    onScale(draft);
    setDraft(null);
  }

  return (
    <section aria-label="Zoom properties" data-testid="zoom-properties" style={rootStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>Zoom properties</span>
        {onClose ? (
          <button type="button" style={doneButtonStyle} onClick={onClose}>
            Done
          </button>
        ) : null}
      </div>

      <div style={fieldStyle}>
        <span style={labelStyle}>
          Scale
          <span style={readoutStyle} data-testid="zoom-scale-readout">
            {scale.toFixed(1)}×
          </span>
        </span>
        <input
          type="range"
          aria-label="Zoom scale"
          min={MIN_ZOOM_SCALE}
          max={MAX_ZOOM_SCALE}
          step={0.1}
          value={scale}
          style={sliderStyle}
          onChange={(e) => setDraft(Number(e.currentTarget.value))}
          onPointerUp={commitScale}
          onMouseUp={commitScale}
          onKeyUp={commitScale}
          onBlur={commitScale}
        />
      </div>

      <div style={fieldStyle}>
        <span style={labelStyle}>Easing</span>
        <select
          aria-label="Zoom easing"
          value={zoomEasing(unit)}
          style={selectStyle}
          onChange={(e) => onEasing(e.currentTarget.value as ZoomEasing)}
        >
          {EASINGS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div style={fieldStyle}>
        <span style={labelStyle}>Timing (seconds)</span>
        <div style={timingRowStyle}>
          <label style={{ ...labelStyle, display: "block" }}>
            <span>Start</span>
            <input
              type="number"
              aria-label="Zoom start"
              step={0.1}
              min={0}
              max={durationSeconds}
              value={unit.start}
              style={{ ...inputStyle, marginTop: 4 }}
              onChange={(e) => {
                const n = parseNumber(e.currentTarget.value);
                if (n !== undefined) onStart(n);
              }}
            />
          </label>
          <label style={{ ...labelStyle, display: "block" }}>
            <span>End</span>
            <input
              type="number"
              aria-label="Zoom end"
              step={0.1}
              min={0}
              max={durationSeconds}
              value={unit.end}
              style={{ ...inputStyle, marginTop: 4 }}
              onChange={(e) => {
                const n = parseNumber(e.currentTarget.value);
                if (n !== undefined) onEnd(n);
              }}
            />
          </label>
          <label style={{ ...labelStyle, display: "block" }}>
            <span>Length</span>
            <input
              type="number"
              aria-label="Zoom duration"
              step={0.1}
              min={0}
              max={durationSeconds}
              value={duration}
              style={{ ...inputStyle, marginTop: 4 }}
              onChange={(e) => {
                const n = parseNumber(e.currentTarget.value);
                if (n !== undefined) onDuration(n);
              }}
            />
          </label>
        </div>
      </div>

      <div style={actionsRowStyle}>
        <button type="button" style={ghostButtonStyle} onClick={onReset}>
          Reset zoom
        </button>
        <button type="button" style={dangerButtonStyle} onClick={onRemove}>
          Remove zoom
        </button>
      </div>
    </section>
  );
}
