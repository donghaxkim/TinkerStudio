import { useMemo, useState, type CSSProperties } from "react";
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
import { useCompositionPlayback } from "./useCompositionPlayback.js";
import { CompositionPlaybackBar } from "./CompositionPlaybackBar.js";
import { CompositionChatPanel } from "./CompositionChatPanel.js";

export type CompositionEditorScreenProps = {
  compositionIndexUrl: string;
  outputVideoUrl?: string;
  resolveWindow?: (iframe: HTMLIFrameElement) => TimelineRegistryWindow | null | undefined;
};

const shellStyle: CSSProperties = {
  height: "100%", minHeight: 0, display: "grid", gridTemplateRows: "52px minmax(0,1fr)",
  background: "var(--tk-app-bg)", color: "var(--tk-text)", fontFamily: "var(--tk-font)",
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

export function CompositionEditorScreen({ compositionIndexUrl, outputVideoUrl, resolveWindow }: CompositionEditorScreenProps) {
  const [model, setModel] = useState<CompositionTimelineModel | undefined>(undefined);
  const [selection, setSelection] = useState<CompositionSelection | undefined>(undefined);
  const [contextRefs, setContextRefs] = useState<ChatContextRef[]>([]);
  const [instruction, setInstruction] = useState("");
  const [refSeq, setRefSeq] = useState(0);

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

  return (
    <div className="tk-porcelain" style={shellStyle}>
      <header style={headerStyle}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Tinker</span>
        <span style={{ fontSize: 14, color: "var(--tk-text-sec)" }}>Studio</span>
        <div style={{ marginLeft: "auto" }}>
          <button type="button" className="tk-btn tk-btn-accent" aria-label="Export" title="Export (coming soon)" disabled>
            Export
          </button>
        </div>
      </header>

      <div style={bodyStyle}>
        <div style={leftColStyle}>
          <section aria-label="Preview stage" style={stageStyle}>
            <CompositionPreview
              src={compositionIndexUrl}
              currentTime={playback.currentTime}
              fallbackVideoSrc={outputVideoUrl}
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
        />
      </div>
    </div>
  );
}
