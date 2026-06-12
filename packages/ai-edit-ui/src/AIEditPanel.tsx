import { useEffect } from "react";
import type { DemoProject } from "@tinker/project-schema";
import type { EditorCommand, SelectedRange } from "@tinker/editor";
import { selectProjectSlice } from "@tinker/editor";
import { OperationPreviewList } from "./OperationPreviewList.js";
import { useAIEditFlow } from "./useAIEditFlow.js";

export type AIEditPreviewSource = "none" | "auto-zoom" | "ai";

export type AIEditPanelProps = {
  project: DemoProject;
  selectedRange?: SelectedRange;
  previewSource?: AIEditPreviewSource;
  onPreviewProjectChange?: (project: DemoProject | undefined) => void;
  onAccept?: (project: DemoProject, command: EditorCommand) => void;
  onReject?: () => void;
};

/** Quick-prompt pills shown when the conversation is idle. Clicking fills the composer. */
const SUGGESTION_CHIPS = [
  "Tighten the pacing",
  "Add a zoom on the click",
  "Punch in on the modal",
];

function formatRange(range: SelectedRange | undefined) {
  if (!range) return "No range selected";
  return `${range.start.toFixed(1)}s – ${range.end.toFixed(1)}s`;
}

/** Return "1 word" or "n words" (pluralised). */
function plural(n: number, word: string): string {
  return `${n} ${n === 1 ? word : `${word}s`}`;
}

/** Circular arrow-up send glyph (inherits currentColor). */
function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}

export function AIEditPanel({
  project,
  selectedRange,
  previewSource,
  onPreviewProjectChange,
  onAccept,
  onReject,
}: AIEditPanelProps) {
  const flow = useAIEditFlow({
    project,
    selectedRange,
    onPreviewProjectChange,
    onAccept,
    onReject,
  });
  const slice = selectedRange && selectedRange.end > selectedRange.start ? selectProjectSlice(project, selectedRange) : undefined;
  const { clearStalePreview, status } = flow;

  useEffect(() => {
    if (status === "preview" && previewSource !== undefined && previewSource !== "ai") {
      clearStalePreview();
    }
  }, [clearStalePreview, previewSource, status]);

  const isBusy = flow.status === "generating";
  const showProposal = flow.status === "preview" && (flow.proposal?.operations.length ?? 0) > 0;

  function submitComposer() {
    if (!flow.canGenerate || isBusy) return;
    void flow.generateProposal();
  }

  return (
    <aside
      aria-label="AI edit panel"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        height: "100%",
        background: "var(--tk-card)",
        color: "var(--tk-text)",
        fontFamily: "var(--tk-font)",
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 14px",
          borderBottom: "1px solid var(--tk-border)",
          flexShrink: 0,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: "var(--tk-radius-pill)",
            background: "var(--tk-accent-soft)",
            color: "var(--tk-accent)",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v3" />
            <path d="m5 7 1.8 1.8" />
            <path d="M3 14h3" />
            <path d="M9 21l3-9 9-3-9 3-3 9Z" />
          </svg>
        </span>
        <div style={{ display: "grid", gap: 1 }}>
          <strong style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em" }}>Assistant</strong>
          <span style={{ fontSize: 11, color: "var(--tk-text-ter)" }}>Edit the selected range with AI</span>
        </div>
      </header>

      {/* ── Conversation / content (scrolls) ───────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Context line */}
        {slice ? (
          <p style={{ margin: 0, fontSize: 12, color: "var(--tk-text-sec)" }}>
            <span style={{ fontFamily: "var(--tk-mono)", color: "var(--tk-text)" }}>{formatRange(selectedRange)}</span>
            {" · "}
            {plural(slice.clips.length, "clip")}, {plural(slice.zooms.length, "zoom")}, {plural(slice.cursorEvents.length, "cursor event")}
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--tk-text-sec)" }}>
            Select a timeline range to edit it with the assistant.
          </p>
        )}

        {/* Idle: suggestion chips */}
        {flow.status === "idle" ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {SUGGESTION_CHIPS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="tk-chip"
                onClick={() => flow.setPrompt(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}

        {/* Generating indicator */}
        {isBusy ? (
          <div
            aria-live="polite"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12.5,
              color: "var(--tk-text-sec)",
            }}
          >
            <span className="tk-dot" style={{ background: "var(--tk-accent)" }} />
            <span className="tk-dot" style={{ background: "var(--tk-accent)", animationDelay: "0.15s" }} />
            <span className="tk-dot" style={{ background: "var(--tk-accent)", animationDelay: "0.3s" }} />
            <span style={{ marginLeft: 4 }}>Drafting an edit…</span>
          </div>
        ) : null}

        {/* AI edit proposal card */}
        {showProposal ? (
          <section
            aria-label="Proposed operations"
            style={{
              display: "grid",
              gap: 10,
              padding: 14,
              border: "1px solid var(--tk-border)",
              borderRadius: "var(--tk-radius-lg)",
              background: "var(--tk-card)",
              boxShadow: "var(--tk-shadow-sm)",
            }}
          >
            <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.02em", textTransform: "uppercase", color: "var(--tk-text-sec)" }}>
              Proposed edit
            </h3>
            <OperationPreviewList operations={flow.proposal?.operations ?? []} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="tk-btn tk-btn-accent" onClick={flow.acceptProposal}>
                Accept edit
              </button>
              <button type="button" className="tk-btn" onClick={flow.rejectProposal}>
                Reject edit
              </button>
            </div>
          </section>
        ) : null}

        {/* Status messages */}
        {flow.error ? (
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
            {flow.error}
          </div>
        ) : null}

        {flow.status === "accepted" ? (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--tk-ok)" }}>Accepted and applied to your project.</p>
        ) : null}
        {flow.status === "rejected" ? (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--tk-text-sec)" }}>Proposal rejected. Project unchanged.</p>
        ) : null}
      </div>

      {/* ── Composer (pinned to bottom) ────────────────────────────────────── */}
      <div style={{ padding: 12, borderTop: "1px solid var(--tk-border)", flexShrink: 0 }}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitComposer();
          }}
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 4,
            padding: "4px 4px 4px 10px",
            border: "1px solid var(--tk-border)",
            borderRadius: "var(--tk-radius-lg)",
            background: "var(--tk-raised)",
          }}
        >
          <label htmlFor="ai-edit-composer" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", margin: -1, padding: 0, border: 0 }}>
            Edit instruction
          </label>
          <textarea
            id="ai-edit-composer"
            value={flow.prompt}
            onChange={(event) => flow.setPrompt(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submitComposer();
              }
            }}
            rows={2}
            placeholder="Describe an edit for the selected range…"
            style={{
              flex: 1,
              resize: "none",
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--tk-text)",
              fontFamily: "var(--tk-font)",
              fontSize: 13,
              lineHeight: 1.4,
              padding: "6px 0",
              maxHeight: 120,
            }}
          />
          <button
            type="submit"
            className="tk-send"
            aria-label="Generate mock proposal"
            title="Generate proposal"
            disabled={!flow.canGenerate || isBusy}
          >
            <SendIcon />
          </button>
        </form>
      </div>
    </aside>
  );
}
