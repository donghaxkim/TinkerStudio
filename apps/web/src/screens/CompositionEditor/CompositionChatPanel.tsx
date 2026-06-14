import { type CSSProperties } from "react";
import { type ChatContextRef, formatContextLabel } from "../../lib/chatContext.js";

export type CompositionChatPanelProps = {
  instruction: string;
  onInstructionChange: (value: string) => void;
  contextRefs: ChatContextRef[];
  onRemoveRef: (id: string) => void;
  hasSelection: boolean;
  onAddToChat: () => void;
  onSend?: () => void;
  // 2b edit-loop state (all optional; absent = Phase 2a behavior):
  status?: "idle" | "drafting" | "preview" | "error";
  error?: string;
  isPreviewing?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  canUndo?: boolean;
  onUndo?: () => void;
};

const panelStyle: CSSProperties = {
  display: "grid", gridTemplateRows: "auto 1fr auto", minHeight: 0, height: "100%",
  background: "var(--tk-panel-bg)", borderLeft: "1px solid var(--tk-border)", padding: 12, gap: 10,
};

export function CompositionChatPanel({
  instruction, onInstructionChange, contextRefs, onRemoveRef, hasSelection, onAddToChat, onSend,
  status = "idle", error, isPreviewing, onAccept, onReject, canUndo, onUndo,
}: CompositionChatPanelProps) {
  const drafting = status === "drafting";
  const sendDisabled = onSend === undefined || instruction.trim() === "" || drafting;
  return (
    <aside aria-label="Chat" style={panelStyle}>
      <button type="button" className="tk-btn" aria-label="Add selection to chat" disabled={!hasSelection} onClick={onAddToChat}>
        + Add selection to chat
      </button>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignContent: "flex-start", overflow: "auto", minHeight: 0 }}>
        {contextRefs.map((ref) => {
          const label = formatContextLabel(ref);
          return (
            <span key={ref.id} className="tk-chip" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {label}
              <button type="button" aria-label={`Remove ${label} from chat`} onClick={() => onRemoveRef(ref.id)}
                style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
            </span>
          );
        })}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {drafting ? (
          <div role="status" style={{ fontSize: 12.5, color: "var(--tk-text-sec)" }}>Drafting edit…</div>
        ) : null}
        {status === "error" && error ? (
          <div role="alert" style={{ fontSize: 12.5, color: "var(--tk-danger, #C0392B)" }}>{error}</div>
        ) : null}
        {isPreviewing ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="tk-btn tk-btn-accent" aria-label="Accept edit" onClick={onAccept}>Accept</button>
            <button type="button" className="tk-btn" aria-label="Reject edit" onClick={onReject}>Reject</button>
          </div>
        ) : null}
        {canUndo ? (
          <button type="button" className="tk-btn" aria-label="Undo last edit" onClick={onUndo} style={{ justifySelf: "start" }}>
            Undo last edit
          </button>
        ) : null}
        <textarea
          className="tk-input"
          aria-label="Edit instruction"
          placeholder="Ask Tinker to edit the demo…"
          value={instruction}
          onChange={(e) => onInstructionChange(e.currentTarget.value)}
          rows={3}
        />
        <button
          type="button"
          className="tk-send"
          aria-label={onSend === undefined ? "Send (coming in Phase 2b)" : "Send"}
          disabled={sendDisabled}
          title={onSend === undefined ? "AI editing arrives in Phase 2b" : "Send"}
          onClick={onSend}
        >
          ↑
        </button>
      </div>
    </aside>
  );
}
