import { type ReactNode } from "react";
import { type ChatContextRef, formatContextLabel } from "../../lib/chatContext.js";

function ChatIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 14.5a2 2 0 0 1-2 2H8l-4 4V5.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z" />
    </svg>
  );
}

function MediaIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="14" rx="2.2" />
      <circle cx="8.5" cy="10" r="1.4" />
      <path d="m4 17 4.5-4 3 2.5L15 12l5 5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}

/** A crosshair — the Zoom (target) tab. */
function ZoomTabIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Sliders — the Clip (properties) tab. */
function ClipTabIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h10M18 8h2M4 16h4M12 16h8" />
      <circle cx="16" cy="8" r="2" fill="currentColor" stroke="none" />
      <circle cx="10" cy="16" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export type CompositionChatPanelProps = {
  instruction: string;
  onInstructionChange: (value: string) => void;
  contextRefs: ChatContextRef[];
  onRemoveRef: (id: string) => void;
  hasSelection: boolean;
  onAddToChat: () => void;
  onSend?: () => void;
  /** Assistant greeting shown at the top of the thread (derived from the real composition). */
  intro?: string;
  /** Quick edit prompts; clicking one fills the composer. */
  suggestions?: string[];
  // 2b edit-loop state (all optional; absent = Phase 2a behavior):
  status?: "idle" | "drafting" | "preview" | "error";
  error?: string;
  isPreviewing?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  unavailableReason?: string;
  /**
   * Contextual zoom property editor for the selected zoom unit. When supplied, a Zoom tab
   * appears in the tab strip; when `zoomTabActive` is set it replaces the chat body (so the
   * properties live inside this panel, not a separate inspector). Chat state is preserved —
   * the composer is simply hidden behind the tab.
   */
  zoomProperties?: ReactNode;
  zoomTabActive?: boolean;
  onSelectChatTab?: () => void;
  onSelectZoomTab?: () => void;
  /**
   * Contextual clip property editor (speed) for the selected clip. When supplied, a Clip tab appears
   * in the tab strip; it opens only on an explicit tab click (`clipTabActive`) — selecting a clip
   * alone keeps this panel on chat. Mutually exclusive with the Zoom tab in practice.
   */
  clipProperties?: ReactNode;
  clipTabActive?: boolean;
  onSelectClipTab?: () => void;
};

export function CompositionChatPanel({
  instruction,
  onInstructionChange,
  contextRefs,
  onRemoveRef,
  hasSelection,
  onAddToChat,
  onSend,
  intro,
  suggestions,
  status = "idle",
  error,
  isPreviewing,
  onAccept,
  onReject,
  zoomProperties,
  zoomTabActive = false,
  onSelectChatTab,
  onSelectZoomTab,
  clipProperties,
  clipTabActive = false,
  onSelectClipTab,
}: CompositionChatPanelProps) {
  const drafting = status === "drafting";
  const editingUnavailable = onSend === undefined;
  const sendDisabled = editingUnavailable || instruction.trim() === "" || drafting;
  const showSuggestions =
    !editingUnavailable && status === "idle" && !isPreviewing && instruction.trim() === "" && (suggestions?.length ?? 0) > 0;
  // The Clip / Zoom property tabs are always present but disabled (greyed out) until their target is
  // selected — `clipProperties` / `zoomProperties` are only supplied then. Clicking an enabled tab
  // replaces the chat body with its properties; the chat composer unmounts, but its state lives in
  // the parent, so switching back restores it. Zoom takes precedence if both are somehow supplied
  // (the screen keeps them mutually exclusive).
  const hasZoomTab = zoomProperties != null;
  const hasClipTab = clipProperties != null;
  const showZoom = hasZoomTab && zoomTabActive;
  const showClip = hasClipTab && clipTabActive && !showZoom;
  const showChat = !showZoom && !showClip;

  return (
    <aside aria-label="Chat" className="tk-composition-chat">
      <div className="tk-composition-chat-surface">
        <div className="tk-composition-chat-tabs">
          <button
            type="button"
            className={`tk-tab-icon${showChat ? " tk-tab-icon-on" : ""}`}
            aria-label="Chat to edit"
            {...(showChat ? { "aria-current": "page" as const } : {})}
            onClick={onSelectChatTab}
          >
            <ChatIcon />
          </button>
          <button
            type="button"
            className={`tk-tab-icon${showClip ? " tk-tab-icon-on" : ""}`}
            aria-label="Clip properties"
            title={hasClipTab ? "Clip properties" : "Select a clip to edit its properties"}
            disabled={!hasClipTab}
            {...(showClip ? { "aria-current": "page" as const } : {})}
            onClick={onSelectClipTab}
          >
            <ClipTabIcon />
          </button>
          <button
            type="button"
            className={`tk-tab-icon${showZoom ? " tk-tab-icon-on" : ""}`}
            aria-label="Zoom properties"
            title={hasZoomTab ? "Zoom properties" : "Select a zoom on the timeline to edit it"}
            disabled={!hasZoomTab}
            {...(showZoom ? { "aria-current": "page" as const } : {})}
            onClick={onSelectZoomTab}
          >
            <ZoomTabIcon />
          </button>
          <button type="button" className="tk-tab-icon" aria-label="Media" disabled>
            <MediaIcon />
          </button>
        </div>

        {showZoom ? (
          <div className="tk-composition-chat-zoom">{zoomProperties}</div>
        ) : showClip ? (
          <div className="tk-composition-chat-zoom">{clipProperties}</div>
        ) : (
        <>
        <div className="tk-composition-chat-composer">
          {contextRefs.length ? (
            <div className="tk-composition-chat-context">
              {contextRefs.map((ref) => {
                const label = formatContextLabel(ref);
                return (
                  <span key={ref.id} className="tk-chip" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {label}
                    <button
                      type="button"
                      aria-label={`Remove ${label} from chat`}
                      onClick={() => onRemoveRef(ref.id)}
                      style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, lineHeight: 1 }}
                    >
                      x
                    </button>
                  </span>
                );
              })}
            </div>
          ) : null}
          <div className="tk-composer-row">
            <button
              type="button"
              className="tk-composer-add"
              aria-label="Add selection to chat"
              title={hasSelection ? "Add the selected range to chat" : "Select a range on the timeline to attach it"}
              disabled={editingUnavailable}
              aria-disabled={!hasSelection}
              onClick={onAddToChat}
            >
              <PlusIcon />
            </button>
            <textarea
              className="tk-composition-chat-textarea"
              aria-label="Edit instruction"
              placeholder="Type something you want to change…"
              value={instruction}
              onChange={(e) => onInstructionChange(e.currentTarget.value)}
              rows={3}
              disabled={editingUnavailable}
            />
            <button
              type="button"
              className="tk-send"
              aria-label={onSend === undefined ? "Send unavailable" : "Send"}
              disabled={sendDisabled}
              title={onSend === undefined ? "Generate first" : "Send"}
              onClick={onSend}
            >
              <SendIcon />
            </button>
          </div>
        </div>

        <div className="tk-composition-chat-thread">
          {intro ? <p className="tk-chat-msg">{intro}</p> : null}
          {showSuggestions ? (
            <div className="tk-composition-chat-suggestions">
              {suggestions!.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="tk-suggestion"
                  onClick={() => onInstructionChange(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
          {drafting ? (
            <div role="status" className="tk-composition-chat-status">Drafting edit…</div>
          ) : null}
          {status === "error" && error ? (
            <div role="alert" className="tk-composition-chat-error">{error}</div>
          ) : null}
          {isPreviewing ? (
            <div className="tk-composition-chat-actions">
              <button type="button" className="tk-btn tk-btn-accent" aria-label="Accept edit" onClick={onAccept}>Accept</button>
              <button type="button" className="tk-btn" aria-label="Reject edit" onClick={onReject}>Reject</button>
            </div>
          ) : null}
        </div>
        </>
        )}
      </div>
    </aside>
  );
}
