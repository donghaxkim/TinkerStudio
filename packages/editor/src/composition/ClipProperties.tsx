import { type CSSProperties } from "react";
import { CLIP_SPEED_PRESETS, clipSpeed, type CompositionClip } from "./compositionTimelineModel.js";

export type ClipPropertiesProps = {
  clip: CompositionClip;
  /** Commit a new playback speed (one of the presets). */
  onSpeed: (speed: number) => void;
  /** Reset playback speed to 1× (real-time). */
  onReset: () => void;
  /** Leave the properties view (back to chat). */
  onClose?: () => void;
};

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

const presetsRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 };

const presetButtonStyle: CSSProperties = {
  padding: "7px 4px",
  borderRadius: 7,
  border: "1px solid var(--tk-border, rgba(20,20,15,0.16))",
  background: "var(--tk-card, #FFFFFF)",
  color: "var(--tk-text, #1B1A17)",
  fontFamily: "var(--tk-mono)",
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
};

const presetButtonActiveStyle: CSSProperties = {
  // Use the `border` shorthand (not `borderColor`) so toggling active never removes a longhand
  // while the base shorthand stays — React warns about mixing the two across rerenders.
  border: "1px solid var(--tk-accent, #6C8CFF)",
  background: "var(--tk-accent-soft, rgba(108,140,255,0.12))",
  color: "var(--tk-accent, #6C8CFF)",
  boxShadow: "0 0 0 3px var(--tk-accent-ring, rgba(108,140,255,0.18))",
};

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

/**
 * Contextual clip property editor, rendered inside the right (chat) panel when the user explicitly
 * opens the selected clip's properties (the Clip tab) — not on plain clip selection, which stays in
 * chat for AI editing. Speed is chosen from presets; picking one commits a single edit that rescales
 * the clip's duration. The current playback length is shown as a readout. All callbacks are routed by
 * the screen through the undo/redo history.
 */
export function ClipProperties({ clip, onSpeed, onReset, onClose }: ClipPropertiesProps) {
  const speed = clipSpeed(clip);
  const duration = Math.max(0, clip.end - clip.start);

  return (
    <section aria-label="Clip properties" data-testid="clip-properties" style={rootStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>Clip properties</span>
        {onClose ? (
          <button type="button" style={doneButtonStyle} onClick={onClose}>
            Done
          </button>
        ) : null}
      </div>

      <div style={fieldStyle}>
        <span style={labelStyle}>
          Speed
          <span style={readoutStyle} data-testid="clip-speed-readout">
            {speed}×
          </span>
        </span>
        <div style={presetsRowStyle} role="group" aria-label="Playback speed">
          {CLIP_SPEED_PRESETS.map((preset) => {
            const active = preset === speed;
            return (
              <button
                key={preset}
                type="button"
                data-testid={`clip-speed-${preset}`}
                aria-label={`${preset}× speed`}
                aria-pressed={active}
                style={{ ...presetButtonStyle, ...(active ? presetButtonActiveStyle : null) }}
                onClick={() => onSpeed(preset)}
              >
                {preset}×
              </button>
            );
          })}
        </div>
      </div>

      <div style={fieldStyle}>
        <span style={labelStyle}>
          Duration
          <span style={readoutStyle} data-testid="clip-duration-readout">
            {duration.toFixed(1)}s
          </span>
        </span>
      </div>

      <div style={actionsRowStyle}>
        <button type="button" style={ghostButtonStyle} onClick={onReset}>
          Reset speed
        </button>
      </div>
    </section>
  );
}
