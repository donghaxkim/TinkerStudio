import {
  CURSOR_SETTINGS_DEFAULTS,
  resolveCursorSettings,
  type ClickEffect,
  type CursorSettings,
  type DemoProject,
} from "@tinker/project-schema";

type CursorControlsProps = {
  project: DemoProject;
  /**
   * Apply a new `cursor` settings object to the project. The host (EditorScreen)
   * turns this into an undoable EditorCommand so the change flows through history.
   */
  onApply: (cursor: CursorSettings) => void;
};

const CLICK_EFFECTS: Array<{ id: ClickEffect; label: string; hint: string }> = [
  { id: "ring", label: "Ring", hint: "Accent ring around the click (default)." },
  { id: "ripple", label: "Ripple", hint: "An expanding ring that draws the eye." },
  { id: "none", label: "None", hint: "Just the cursor — no click emphasis." },
];

const fieldStyle = { display: "grid", gap: 5, fontSize: 12, color: "var(--tk-text-sec)" } as const;
const inputStyle = {
  padding: "8px 10px",
  borderRadius: "var(--tk-radius-sm)",
  border: "1px solid var(--tk-border)",
  background: "var(--tk-card)",
  color: "var(--tk-text)",
  font: "inherit",
} as const;

/**
 * PB-006 Cursor tab: real controls for the VISIBLE cursor/click display settings.
 * These map 1:1 onto the optional `project.cursor` schema field, which the preview
 * and the export both read through `resolveCursorSettings` for parity.
 */
export function CursorControls({ project, onApply }: CursorControlsProps) {
  const resolved = resolveCursorSettings(project.cursor);

  // Build the next settings object from the resolved current state plus one change.
  function applyChange(change: Partial<CursorSettings>) {
    onApply({
      hidden: resolved.hidden,
      clickEffect: resolved.clickEffect,
      clickEffectDurationMs: resolved.clickEffectDurationMs,
      ...change,
    });
  }

  const durationDisabled = resolved.hidden || resolved.clickEffect === "none";

  return (
    <section aria-label="Cursor controls" style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 8 }}>
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
          Cursor &amp; clicks
        </p>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--tk-text-sec)", lineHeight: 1.5 }}>
          Tune how the cursor and clicks look. The preview and the exported video use these settings
          identically.
        </p>
      </div>

      {/* Cursor visibility toggle */}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: 12,
          border: "1px solid var(--tk-border)",
          borderRadius: "var(--tk-radius-md)",
          background: "var(--tk-card)",
          cursor: "pointer",
        }}
      >
        <span style={{ display: "grid", gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--tk-text)" }}>Show cursor</span>
          <span style={{ fontSize: 12, color: "var(--tk-text-sec)" }}>
            Hide it to render a clean screen with no cursor overlay.
          </span>
        </span>
        <input
          type="checkbox"
          aria-label="Show cursor"
          checked={!resolved.hidden}
          onChange={(event) => applyChange({ hidden: !event.target.checked })}
        />
      </label>

      {/* Click emphasis style */}
      <fieldset
        style={{
          display: "grid",
          gap: 8,
          margin: 0,
          padding: 12,
          border: "1px solid var(--tk-border)",
          borderRadius: "var(--tk-radius-md)",
          background: "var(--tk-card)",
          opacity: resolved.hidden ? 0.55 : 1,
        }}
      >
        <legend style={{ padding: "0 4px", fontSize: 12.5, fontWeight: 600, color: "var(--tk-text)" }}>
          Click emphasis
        </legend>
        <div style={{ display: "grid", gap: 6 }}>
          {CLICK_EFFECTS.map((effect) => (
            <label
              key={effect.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                fontSize: 12.5,
                color: "var(--tk-text)",
                cursor: resolved.hidden ? "default" : "pointer",
              }}
            >
              <input
                type="radio"
                name="click-effect"
                value={effect.id}
                aria-label={`Click emphasis ${effect.label}`}
                disabled={resolved.hidden}
                checked={resolved.clickEffect === effect.id}
                onChange={() => applyChange({ clickEffect: effect.id })}
                style={{ marginTop: 2 }}
              />
              <span style={{ display: "grid", gap: 1 }}>
                <span style={{ fontWeight: 600 }}>{effect.label}</span>
                <span style={{ fontSize: 11.5, color: "var(--tk-text-sec)" }}>{effect.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Click emphasis duration */}
      <label style={fieldStyle}>
        Click emphasis duration (ms)
        <input
          type="number"
          min={1}
          step={50}
          aria-label="Click emphasis duration in milliseconds"
          style={{ ...inputStyle, opacity: durationDisabled ? 0.55 : 1 }}
          disabled={durationDisabled}
          value={String(resolved.clickEffectDurationMs)}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!Number.isFinite(next) || next <= 0) return;
            applyChange({ clickEffectDurationMs: next });
          }}
        />
        <span style={{ fontSize: 11, color: "var(--tk-text-ter)" }}>
          How long the click emphasis shows after each click. Default {CURSOR_SETTINGS_DEFAULTS.clickEffectDurationMs}
          ms.
        </span>
      </label>
    </section>
  );
}
