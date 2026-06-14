import { type CSSProperties } from "react";
import { type ChatContextRef, formatContextLabel } from "../../lib/chatContext.js";

export type CompositionChatPanelProps = {
  instruction: string;
  onInstructionChange: (value: string) => void;
  contextRefs: ChatContextRef[];
  onRemoveRef: (id: string) => void;
  hasSelection: boolean;
  onAddToChat: () => void;
  /** 2b wires this; absent/false in 2a keeps Send disabled. */
  onSend?: () => void;
};

const panelStyle: CSSProperties = {
  display: "grid", gridTemplateRows: "auto 1fr auto", minHeight: 0, height: "100%",
  background: "var(--tk-panel-bg)", borderLeft: "1px solid var(--tk-border)", padding: 12, gap: 10,
};

export function CompositionChatPanel({
  instruction, onInstructionChange, contextRefs, onRemoveRef, hasSelection, onAddToChat, onSend,
}: CompositionChatPanelProps) {
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
          aria-label="Send (coming in Phase 2b)"
          disabled={onSend === undefined}
          title={onSend === undefined ? "AI editing arrives in Phase 2b" : "Send"}
          onClick={onSend}
        >
          ↑
        </button>
      </div>
    </aside>
  );
}
