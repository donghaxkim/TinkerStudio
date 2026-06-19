import type { CSSProperties } from "react";

export type CompositionEditorScreenProps = {
  standaloneVideoUrl: string;
  /** GitHub repo this demo was generated from, as `owner/repo`. Shown in the app bar. */
  repo?: string;
  /** Render a back affordance in the app bar (returns to the create/request screen). */
  onBack?: () => void;
};

const wordmarkButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "baseline",
  gap: 6,
  border: "none",
  background: "transparent",
  padding: "4px 2px",
  borderRadius: "var(--tk-radius-sm)",
};

const standaloneVideoStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  border: "none",
  borderRadius: "var(--tk-radius-lg, 11px)",
  background: "#050609",
  boxShadow: "0 18px 54px rgba(0,0,0,0.22)",
};

export function CompositionEditorScreen({ standaloneVideoUrl, repo, onBack }: CompositionEditorScreenProps) {
  function handleExport() {
    window.open(standaloneVideoUrl, "_blank");
  }

  return (
    <div className="tk-porcelain tk-composition-shell">
      <header className="tk-composition-header">
        <button
          type="button"
          onClick={onBack}
          disabled={!onBack}
          aria-label="Back to create"
          title="Back to create"
          style={{ ...wordmarkButtonStyle, cursor: onBack ? "pointer" : "default" }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--tk-text)" }}>Tinker</span>
          <span style={{ fontSize: 14, fontWeight: 400, color: "var(--tk-text-sec)" }}>Studio</span>
        </button>
        {repo ? (
          <a
            className="tk-repo-link"
            href={`https://github.com/${repo}`}
            target="_blank"
            rel="noreferrer"
            aria-label={`GitHub repository ${repo}`}
            title={`github.com/${repo}`}
          >
            github.com/{repo}
          </a>
        ) : null}
        <div className="tk-composition-status" aria-label="Editor status">
          Saved
        </div>
        <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>
          <button type="button" className="tk-btn tk-btn-accent" aria-label="Export" title="Export" onClick={handleExport}>
            Export
          </button>
        </div>
      </header>

      <div className="tk-composition-body">
        <div className="tk-composition-main">
          <section aria-label="Preview stage" className="tk-composition-stage">
            <video data-testid="composition-standalone-video" aria-label="Generated video preview" src={standaloneVideoUrl} controls style={standaloneVideoStyle}>
              <track kind="captions" label="No captions available" src="data:text/vtt,WEBVTT%0A" default />
            </video>
          </section>
        </div>
      </div>
    </div>
  );
}
