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

function formatRange(range: SelectedRange | undefined) {
  if (!range) return "No range selected";
  return `${range.start.toFixed(1)}s – ${range.end.toFixed(1)}s`;
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

  return (
    <aside
      aria-label="AI edit panel"
      style={{
        display: "grid",
        gap: 12,
        padding: 16,
        border: "1px solid #334155",
        borderRadius: 12,
        background: "#0f172a",
      }}
    >
      <div>
        <p style={{ margin: 0, color: "#a78bfa", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          AI edit mock
        </p>
        <h2 style={{ margin: "4px 0 0" }}>Edit selected range</h2>
      </div>

      <div>
        <div style={{ color: "#94a3b8", fontSize: 12, textTransform: "uppercase" }}>Target range</div>
        <strong>{formatRange(selectedRange)}</strong>
      </div>

      {slice ? (
        <p style={{ margin: 0, color: "#94a3b8" }}>
          Context: {slice.clips.length} clips, {slice.zooms.length} zooms, {slice.cursorEvents.length} cursor events.
        </p>
      ) : (
        <p style={{ margin: 0, color: "#fbbf24" }}>Select a non-empty timeline range to enable AI edits.</p>
      )}

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ color: "#94a3b8", fontSize: 12, textTransform: "uppercase" }}>Instruction</span>
        <textarea
          value={flow.prompt}
          onChange={(event) => flow.setPrompt(event.currentTarget.value)}
          rows={4}
          style={{ borderRadius: 10, border: "1px solid #334155", background: "#020617", color: "white", padding: 10 }}
        />
      </label>

      <button
        type="button"
        disabled={!flow.canGenerate || flow.status === "generating"}
        onClick={() => void flow.generateProposal()}
        style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #7c3aed", background: flow.canGenerate ? "#6d28d9" : "#334155", color: "white" }}
      >
        {flow.status === "generating" ? "Generating…" : "Generate mock proposal"}
      </button>

      {flow.error ? <p role="alert" style={{ margin: 0, color: "#fca5a5" }}>{flow.error}</p> : null}

      <section aria-label="Proposed operations" style={{ display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Proposed operations</h3>
        <OperationPreviewList operations={flow.proposal?.operations ?? []} />
      </section>

      {flow.status === "preview" ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={flow.acceptProposal} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #16a34a", background: "#15803d", color: "white" }}>
            Accept edit
          </button>
          <button type="button" onClick={flow.rejectProposal} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #475569", background: "#111827", color: "white" }}>
            Reject edit
          </button>
        </div>
      ) : null}

      {flow.status === "accepted" ? <p style={{ margin: 0, color: "#86efac" }}>Accepted and applied to DemoProject.</p> : null}
      {flow.status === "rejected" ? <p style={{ margin: 0, color: "#cbd5e1" }}>Proposal rejected. Project unchanged.</p> : null}
    </aside>
  );
}
