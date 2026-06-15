import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  CompositionPreview,
  CompositionTimeline,
  clipSelection,
  rangeSelection,
  type CompositionClip,
  type CompositionSelection,
  type CompositionTimelineModel,
  type TimelineRegistryWindow,
} from "@tinker/editor";
import { chatContextRefFromSelection, type ChatContextRef } from "../../lib/chatContext.js";
import type { CompositionEditClient, CompositionRevision } from "../../lib/compositionEditClient.js";
import { useCompositionEditFlow } from "./useCompositionEditFlow.js";
import { useCompositionPlayback } from "./useCompositionPlayback.js";
import { CompositionPlaybackBar } from "./CompositionPlaybackBar.js";
import { CompositionChatPanel } from "./CompositionChatPanel.js";

export type CompositionEditorScreenProps = {
  compositionIndexUrl: string;
  outputVideoUrl?: string;
  /** Render a back affordance in the app bar (returns to the create/request screen). */
  onBack?: () => void;
  /** Enables the AI edit loop when provided together with editClient. */
  jobId?: string;
  editClient?: CompositionEditClient;
  resolveWindow?: (iframe: HTMLIFrameElement) => TimelineRegistryWindow | null | undefined;
};

const shellStyle: CSSProperties = {
  height: "100vh", maxHeight: "100vh", overflow: "hidden", display: "grid", gridTemplateRows: "52px minmax(0,1fr)",
  background: "var(--tk-app-bg)", color: "var(--tk-text)", fontFamily: "var(--tk-font)",
};
const wordmarkButtonStyle: CSSProperties = {
  display: "inline-flex", alignItems: "baseline", gap: 6, border: "none", background: "transparent",
  padding: "4px 2px", borderRadius: "var(--tk-radius-sm)",
};
const headerStyle: CSSProperties = {
  display: "flex", alignItems: "center", gap: 12, padding: "0 14px",
  borderBottom: "1px solid var(--tk-border)", background: "var(--tk-card)",
};
const bodyStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", minHeight: 0 };
const leftColStyle: CSSProperties = { display: "grid", gridTemplateRows: "minmax(0,1fr) auto auto", minHeight: 0, padding: 14, gap: 12 };
const stageStyle: CSSProperties = {
  position: "relative", minHeight: 0, borderRadius: 18, overflow: "hidden",
  background: "var(--tk-preview-bg)", display: "flex", alignItems: "center", justifyContent: "center",
};

export function CompositionEditorScreen({ compositionIndexUrl, outputVideoUrl, onBack, jobId, editClient, resolveWindow }: CompositionEditorScreenProps) {
  const [model, setModel] = useState<CompositionTimelineModel | undefined>(undefined);
  const [selection, setSelection] = useState<CompositionSelection | undefined>(undefined);
  const [contextRefs, setContextRefs] = useState<ChatContextRef[]>([]);
  const [instruction, setInstruction] = useState("");
  const [refSeq, setRefSeq] = useState(0);
  const [lastEditedRange, setLastEditedRange] = useState<{ start: number; end: number } | undefined>(undefined);

  const duration = model?.durationSeconds ?? 0;
  const playback = useCompositionPlayback(duration);

  const clips = model?.clips ?? [];
  const starts = useMemo(() => Array.from(new Set(clips.map((c) => c.start))).sort((a, b) => a - b), [clips]);
  const prev = [...starts].reverse().find((s) => s < playback.currentTime - 1e-6);
  const next = starts.find((s) => s > playback.currentTime + 1e-6);

  const selectedClipId = selection?.kind === "clip" ? selection.clipId : undefined;
  const band = selection ? { start: selection.start, end: selection.end } : undefined;

  function handleSelectClip(clip: CompositionClip) { setSelection(clipSelection(clip)); }
  function handleSelectRange(range: { start: number; end: number }) { setSelection(rangeSelection(range.start, range.end)); }

  function handleAddToChat() {
    if (!selection) return;
    const id = `ref-${refSeq}`;
    setRefSeq((n) => n + 1);
    setContextRefs((refs) => [...refs, chatContextRefFromSelection(selection, id)]);
  }
  function handleRemoveRef(id: string) { setContextRefs((refs) => refs.filter((r) => r.id !== id)); }

  const baseRevision: CompositionRevision = useMemo(
    () => ({ id: "rev-0", compositionIndexUrl, ...(outputVideoUrl === undefined ? {} : { outputVideoUrl }) }),
    [compositionIndexUrl, outputVideoUrl],
  );
  const noopClient = useMemo<CompositionEditClient>(() => ({ editComposition: async () => baseRevision }), [baseRevision]);
  const edit = useCompositionEditFlow({ jobId: jobId ?? "", client: editClient ?? noopClient, baseRevision });
  const editEnabled = jobId !== undefined && editClient !== undefined;
  const exportVideoUrl = edit.currentVideoUrl ?? outputVideoUrl;

  function handleSend() {
    const refs = contextRefs;
    const editedRange = refs.length
      ? { start: Math.min(...refs.map((r) => r.start)), end: Math.max(...refs.map((r) => r.end)) }
      : undefined;
    setLastEditedRange(editedRange);
    void edit.submit(instruction, refs);
    // Clear the instruction only; keep contextRefs so Send-during-preview reprompts the same clip.
    setInstruction("");
  }

  // Auto-replay the edited clip on loop whenever a new revision previews. Keyed on the
  // composition URL (changes per revision) so it re-fires for each Reprompt revision —
  // isPreviewing stays true across a Reprompt and would not re-trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (edit.isPreviewing && model && lastEditedRange) {
      playback.playSegment(lastEditedRange.start, lastEditedRange.end);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit.currentCompositionUrl]);

  return (
    <div className="tk-porcelain" style={shellStyle}>
      <header style={headerStyle}>
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
        <div style={{ marginLeft: "auto" }}>
          <button
            type="button"
            className="tk-btn tk-btn-accent"
            aria-label="Export"
            title={exportVideoUrl === undefined ? "Render the edit to export" : "Export"}
            disabled={exportVideoUrl === undefined}
            onClick={() => { if (exportVideoUrl) window.open(exportVideoUrl, "_blank"); }}
          >
            Export
          </button>
        </div>
      </header>

      <div style={bodyStyle}>
        <div style={leftColStyle}>
          <section aria-label="Preview stage" style={stageStyle}>
            <CompositionPreview
              src={edit.currentCompositionUrl}
              currentTime={playback.currentTime}
              fallbackVideoSrc={edit.currentVideoUrl}
              onReady={(readyModel) => setModel(readyModel)}
              resolveWindow={resolveWindow}
            />
          </section>

          {model ? (
            <CompositionPlaybackBar
              currentTime={playback.currentTime}
              duration={duration}
              isPlaying={playback.isPlaying}
              canPrev={prev !== undefined}
              canNext={next !== undefined}
              onPlayPause={() => (playback.isPlaying ? playback.pause() : playback.play())}
              onPrev={() => prev !== undefined && playback.seek(prev)}
              onNext={() => next !== undefined && playback.seek(next)}
            />
          ) : null}

          {model ? (
            <CompositionTimeline
              model={model}
              currentTime={playback.currentTime}
              selectedClipId={selectedClipId}
              selection={band}
              onSeek={playback.seek}
              onSelectClip={handleSelectClip}
              onSelectRange={handleSelectRange}
            />
          ) : null}
        </div>

        <CompositionChatPanel
          instruction={instruction}
          onInstructionChange={setInstruction}
          contextRefs={contextRefs}
          onRemoveRef={handleRemoveRef}
          hasSelection={selection !== undefined}
          onAddToChat={handleAddToChat}
          {...(editEnabled
            ? {
                onSend: handleSend,
                status: edit.status,
                isPreviewing: edit.isPreviewing,
                onAccept: () => { edit.accept(); setContextRefs([]); setSelection(undefined); },
                onReject: () => { edit.reject(); setContextRefs([]); setSelection(undefined); },
                canUndo: edit.canUndo,
                onUndo: edit.undo,
                ...(edit.error === undefined ? {} : { error: edit.error }),
              }
            : {})}
        />
      </div>
    </div>
  );
}
