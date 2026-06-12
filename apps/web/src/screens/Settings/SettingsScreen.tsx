import { useState } from "react";
import { PROJECT_SCHEMA_VERSION } from "@tinker/project-schema";
import {
  LOCAL_PROJECT_STORAGE_KEY,
  clearProjectStorage,
  loadProjectFromStorage,
} from "../../lib/projectStorage.js";
import {
  DEFAULT_EXPORT_DIRECTORY,
  EXPORT_DIRECTORY_STORAGE_KEY,
  getExportDirectory,
  sanitizeExportDirectory,
  setExportDirectory,
} from "../../lib/appSettings.js";

// ─── constants ────────────────────────────────────────────────────────────────

export const APP_VERSION = "0.1.0-prototype";

// ─── types ────────────────────────────────────────────────────────────────────

type SettingsStatus =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

type SettingsScreenProps = {
  onClose?: () => void;
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function getSavedProjectSummary(): string {
  const result = loadProjectFromStorage();
  if (!result.ok) return "none";
  const p = result.project;
  return `"${p.title}" · ${p.id} · ${p.duration}s`;
}

// ─── component ────────────────────────────────────────────────────────────────

export function SettingsScreen({ onClose }: SettingsScreenProps = {}) {
  const [status, setStatus] = useState<SettingsStatus>({ kind: "idle" });
  const [exportDir, setExportDirState] = useState<string>(() => getExportDirectory());
  const [exportDirInput, setExportDirInput] = useState<string>(() => getExportDirectory());

  function resetStorage() {
    const result = clearProjectStorage();
    if (!result.ok) {
      setStatus({ kind: "error", message: result.error.message });
      return;
    }
    setStatus({ kind: "success", message: "Saved project snapshot cleared." });
  }

  function handleExportDirChange(e: React.ChangeEvent<HTMLInputElement>) {
    setExportDirInput(e.target.value);
  }

  function handleExportDirSave() {
    const sanitized = sanitizeExportDirectory(exportDirInput);
    setExportDirectory(sanitized);
    setExportDirState(sanitized);
    setExportDirInput(sanitized);
    setStatus({ kind: "success", message: `Export directory set to "${sanitized}".` });
  }

  const savedProjectSummary = getSavedProjectSummary();

  return (
    <div
      aria-label="Settings"
      style={{
        minHeight: "100vh",
        background: "var(--tk-app-bg)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "48px 16px 64px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          background: "var(--tk-card)",
          border: "1px solid var(--tk-border)",
          borderRadius: "var(--tk-radius-xl)",
          boxShadow: "var(--tk-shadow-md)",
          overflow: "hidden",
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "20px 24px 16px",
            borderBottom: "1px solid var(--tk-border)",
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                color: "var(--tk-accent)",
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
              }}
            >
              Tinker Studio
            </p>
            <h2 style={{ margin: "3px 0 0", fontSize: 18, fontWeight: 700, color: "var(--tk-text)" }}>
              Settings
            </h2>
          </div>
          {onClose ? (
            <button type="button" className="tk-btn" onClick={onClose}>
              Close settings
            </button>
          ) : null}
        </div>

        {/* ── Body ── */}
        <div style={{ padding: "20px 24px", display: "grid", gap: 28 }}>

          {/* Diagnostics block */}
          <section aria-label="Diagnostics" style={{ display: "grid", gap: 12 }}>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: "var(--tk-text-sec)",
              }}
            >
              Diagnostics
            </p>
            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "13rem minmax(0, 1fr)",
                gap: "6px 12px",
                margin: 0,
                fontSize: 13,
              }}
            >
              <dt style={{ color: "var(--tk-text-sec)" }}>App version</dt>
              <dd style={{ margin: 0, fontFamily: "var(--tk-mono)", fontSize: 12 }}>
                {APP_VERSION}
              </dd>

              <dt style={{ color: "var(--tk-text-sec)" }}>Schema version</dt>
              <dd style={{ margin: 0, fontFamily: "var(--tk-mono)", fontSize: 12 }}>
                {PROJECT_SCHEMA_VERSION}
              </dd>

              <dt style={{ color: "var(--tk-text-sec)" }}>Generation mode</dt>
              <dd style={{ margin: 0 }}>Mock local client</dd>

              <dt style={{ color: "var(--tk-text-sec)" }}>Project storage key</dt>
              <dd style={{ margin: 0 }}>
                <code style={{ fontFamily: "var(--tk-mono)", fontSize: 12 }}>
                  {LOCAL_PROJECT_STORAGE_KEY}
                </code>
              </dd>

              <dt style={{ color: "var(--tk-text-sec)" }}>Saved project</dt>
              <dd
                style={{
                  margin: 0,
                  fontFamily: savedProjectSummary === "none" ? undefined : "var(--tk-mono)",
                  fontSize: savedProjectSummary === "none" ? undefined : 12,
                  color: savedProjectSummary === "none" ? "var(--tk-text-ter)" : "var(--tk-text)",
                }}
                data-testid="saved-project-summary"
              >
                {savedProjectSummary}
              </dd>
            </dl>
          </section>

          {/* Export directory */}
          <section aria-label="Export" style={{ display: "grid", gap: 12 }}>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: "var(--tk-text-sec)",
              }}
            >
              Export
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              <label
                htmlFor="export-dir-input"
                style={{ fontSize: 13, color: "var(--tk-text)", fontWeight: 600 }}
              >
                Output directory
              </label>
              <p style={{ margin: 0, fontSize: 12, color: "var(--tk-text-ter)", lineHeight: 1.5 }}>
                Relative subdirectory for rendered MP4 files. No absolute paths or <code style={{ fontFamily: "var(--tk-mono)" }}>..</code> allowed.
                Default: <code style={{ fontFamily: "var(--tk-mono)" }}>{DEFAULT_EXPORT_DIRECTORY}</code>
              </p>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  id="export-dir-input"
                  type="text"
                  value={exportDirInput}
                  onChange={handleExportDirChange}
                  aria-label="Export directory"
                  placeholder={DEFAULT_EXPORT_DIRECTORY}
                  style={{
                    flex: 1,
                    padding: "7px 10px",
                    border: "1px solid var(--tk-border-strong)",
                    borderRadius: "var(--tk-radius-sm)",
                    background: "var(--tk-raised)",
                    color: "var(--tk-text)",
                    fontFamily: "var(--tk-mono)",
                    fontSize: 13,
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  className="tk-btn"
                  onClick={handleExportDirSave}
                  aria-label="Save export directory"
                >
                  Save
                </button>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "var(--tk-text-ter)" }}>
                Current: <code style={{ fontFamily: "var(--tk-mono)" }}>{exportDir}/{"{id}"}.mp4</code>
              </p>
            </div>
          </section>

          {/* Storage reset */}
          <section aria-label="Storage" style={{ display: "grid", gap: 12 }}>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: "var(--tk-text-sec)",
              }}
            >
              Storage
            </p>
            <div style={{ display: "grid", gap: 10 }}>
              <p style={{ margin: 0, fontSize: 13, color: "var(--tk-text-sec)", lineHeight: 1.5 }}>
                Clears the locally-saved project snapshot from <code style={{ fontFamily: "var(--tk-mono)", fontSize: 12 }}>{LOCAL_PROJECT_STORAGE_KEY}</code>.
                Use this if the app is stuck or you want a clean slate.
              </p>
              <button
                type="button"
                className="tk-btn"
                onClick={resetStorage}
                style={{ justifySelf: "start" }}
              >
                Reset saved project
              </button>
            </div>
          </section>

          {/* Status messages */}
          {status.kind === "success" ? (
            <p
              role="status"
              style={{
                margin: 0,
                padding: "10px 14px",
                borderRadius: "var(--tk-radius-sm)",
                background: "rgba(46,139,87,0.09)",
                border: "1px solid rgba(46,139,87,0.22)",
                color: "var(--tk-ok)",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {status.message}
            </p>
          ) : null}
          {status.kind === "error" ? (
            <p
              role="alert"
              style={{
                margin: 0,
                padding: "10px 14px",
                borderRadius: "var(--tk-radius-sm)",
                background: "rgba(220,38,38,0.07)",
                border: "1px solid rgba(220,38,38,0.20)",
                color: "#dc2626",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {status.message}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
