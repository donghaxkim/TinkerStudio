import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ClipProperties,
  CompositionPreview,
  CompositionTimeline,
  DEFAULT_ZOOM_EASING,
  DEFAULT_ZOOM_SCALE,
  DEFAULT_ZOOM_TARGET,
  ZoomProperties,
  clipAt,
  clipSelection,
  rangeSelection,
  zoomScale,
  zoomTarget,
  type CompositionClip,
  type CompositionSelection,
  type TimelineRegistryWindow,
  type TrimEdge,
  type ZoomEasing,
  type ZoomTarget,
} from "@tinker/editor";
import { chatContextRefFromSelection, type ChatContextRef } from "../../lib/chatContext.js";
import type { CompositionEditClient, CompositionRevision } from "../../lib/compositionEditClient.js";
import { useCompositionEditFlow } from "./useCompositionEditFlow.js";
import { useCompositionPlayback } from "./useCompositionPlayback.js";
import { useTimelineEdits } from "./useTimelineEdits.js";
import { CompositionPlaybackBar } from "./CompositionPlaybackBar.js";
import { CompositionChatPanel } from "./CompositionChatPanel.js";

export type CompositionEditorScreenProps = {
  compositionIndexUrl: string;
  outputVideoUrl?: string;
  /** GitHub repo this demo was generated from, as `owner/repo`. Shown in the app bar. */
  repo?: string;
  /** Render a back affordance in the app bar (returns to the create/request screen). */
  onBack?: () => void;
  /** Enables the AI edit loop when provided together with editClient. */
  jobId?: string;
  editClient?: CompositionEditClient;
  resolveWindow?: (iframe: HTMLIFrameElement) => TimelineRegistryWindow | null | undefined;
};

const wordmarkButtonStyle: CSSProperties = {
  display: "inline-flex", alignItems: "baseline", gap: 6, border: "none", background: "transparent",
  padding: "4px 2px", borderRadius: "var(--tk-radius-sm)",
};

const EDIT_SUGGESTIONS = ["Tighten the pacing", "Zoom in on every click", "Smooth the cursor"];

export function CompositionEditorScreen({ compositionIndexUrl, outputVideoUrl, repo, onBack, jobId, editClient, resolveWindow }: CompositionEditorScreenProps) {
  // Local timeline-edit history (split / delete / marker, with undo/redo). Self-contained so
  // the toolbar behaves identically in the empty shell and the real generated editor.
  const { model, reset: resetEdits, split, remove: removeClipEdit, trim, setClipSpeed, addZoom, moveZoom, resizeZoom, updateZoom, removeZoom, undo, redo, canUndo, canRedo } = useTimelineEdits();
  const [selection, setSelection] = useState<CompositionSelection | undefined>(undefined);
  const [selectedZoomId, setSelectedZoomId] = useState<string | undefined>(undefined);
  // Which surface the right panel shows. Selecting a zoom flips it to "zoom" (its properties);
  // a clip's properties ("clip") open only on an explicit Clip-tab click — selecting a clip stays
  // on "chat". The Chat tab returns to "chat" without losing chat state.
  const [rightTab, setRightTab] = useState<"chat" | "zoom" | "clip">("chat");
  // Monotonic counter for unique zoom ids — keeps ids stable across undo/redo (snapshots
  // bake the id in) without colliding when a unit is created after an undo.
  const zoomSeq = useRef(0);
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
  const canSkipStart = playback.currentTime > 1e-6;
  const canSkipEnd = duration > 0 && playback.currentTime < duration - 1e-6;

  const selectedClipId = selection?.kind === "clip" ? selection.clipId : undefined;
  const band = selection ? { start: selection.start, end: selection.end } : undefined;
  // The live selected zoom unit (looked up each render so an undo that removes it just drops the
  // Zoom tab — no stale unit is held). The Zoom tab is active only while one is selected.
  const selectedZoom = selectedZoomId === undefined ? undefined : model?.zooms?.find((z) => z.id === selectedZoomId);
  const zoomTabActive = rightTab === "zoom" && selectedZoom !== undefined;
  // The live selected clip (looked up each render so a speed edit reflects immediately and a delete
  // just drops the Clip tab). Its properties open only when the Clip tab is the active surface.
  const selectedClip = selectedClipId === undefined ? undefined : clips.find((c) => c.id === selectedClipId);
  const clipTabActive = rightTab === "clip" && selectedClip !== undefined;

  // Toolbar enablement: split only inside a clip; delete only with a clip selected.
  const playheadClip = model ? clipAt(model, playback.currentTime) : undefined;

  function handleSplit() {
    split(playback.currentTime);
  }
  function handleDeleteClip() {
    if (selectedClipId === undefined) return;
    removeClipEdit(selectedClipId);
    setSelection(undefined);
  }
  function handleTrimClip(clipId: string, edge: TrimEdge, time: number) {
    trim(clipId, edge, time);
    // Keep the trimmed clip selected (its id is stable) and slide the selection band's
    // matching edge to the committed, already-clamped time so the focus stays in sync.
    setSelection((sel) => (sel?.kind === "clip" && sel.clipId === clipId ? { ...sel, [edge]: time } : sel));
  }

  // --- Clip properties (right panel). Speed edits rescale the clip's duration and ride the shared
  // undo/redo history; reset is just a change back to 1×.
  function handleClipSpeed(speed: number) {
    if (selectedClipId !== undefined) setClipSpeed(selectedClipId, speed);
  }
  function handleResetClipSpeed() {
    if (selectedClipId !== undefined) setClipSpeed(selectedClipId, 1);
  }

  // --- Zoom track. Units live in the model, so create/move/resize/delete are undoable via
  // the same history; zoom selection is tracked separately from clip/range selection.
  function handleCreateZoom(start: number, end: number) {
    const id = `zoom-${(zoomSeq.current += 1)}`;
    addZoom(id, start, end);
    selectZoom(id);
  }
  // Selecting a zoom surfaces its properties in the right panel (the Zoom tab) — it does not touch
  // the clip/range chat selection, so chat is undisturbed beyond the tab switch.
  function selectZoom(id: string) {
    setSelectedZoomId(id);
    setSelection(undefined);
    setRightTab("zoom");
  }
  function handleSelectZoom(id: string) {
    selectZoom(id);
  }
  function handleMoveZoom(id: string, start: number) {
    moveZoom(id, start);
  }
  function handleResizeZoom(id: string, edge: TrimEdge, time: number) {
    resizeZoom(id, edge, time);
  }
  function handleDeleteZoom(id: string) {
    removeZoom(id);
    setSelectedZoomId((cur) => (cur === id ? undefined : cur));
    setRightTab("chat");
  }

  // --- Zoom properties (right panel). Look edits go through updateZoom; timing reuses the clamped
  // resizeZoom; all ride the shared undo/redo history.
  function handleZoomScale(scale: number) {
    if (selectedZoom) updateZoom(selectedZoom.id, { scale });
  }
  function handleZoomEasing(easing: ZoomEasing) {
    if (selectedZoom) updateZoom(selectedZoom.id, { easing });
  }
  function handleZoomTarget(target: ZoomTarget) {
    if (selectedZoom) updateZoom(selectedZoom.id, { target });
  }
  function handleZoomStart(start: number) {
    if (selectedZoom) resizeZoom(selectedZoom.id, "start", start);
  }
  function handleZoomEnd(end: number) {
    if (selectedZoom) resizeZoom(selectedZoom.id, "end", end);
  }
  function handleZoomDuration(duration: number) {
    if (selectedZoom) resizeZoom(selectedZoom.id, "end", selectedZoom.start + duration);
  }
  function handleResetZoom() {
    if (selectedZoom) {
      updateZoom(selectedZoom.id, { scale: DEFAULT_ZOOM_SCALE, easing: DEFAULT_ZOOM_EASING, target: DEFAULT_ZOOM_TARGET });
    }
  }
  function handleRemoveSelectedZoom() {
    if (selectedZoom) handleDeleteZoom(selectedZoom.id);
  }

  function attachSelection(nextSelection: CompositionSelection) {
    const id = `ref-${refSeq}`;
    setRefSeq((n) => n + 1);
    setContextRefs([chatContextRefFromSelection(nextSelection, id)]);
  }

  function handleSelectClip(clip: CompositionClip) {
    const nextSelection = clipSelection(clip);
    setSelection(nextSelection);
    setSelectedZoomId(undefined);
    setRightTab("chat");
    attachSelection(nextSelection);
  }

  function handleSelectRange(range: { start: number; end: number }) {
    // A dragged range is NOT auto-attached — the user confirms it via the floating
    // "Add to Chat" popup (or ⌘L), so they choose exactly which window to give the AI.
    setSelection(rangeSelection(range.start, range.end));
    setSelectedZoomId(undefined);
    setRightTab("chat");
  }

  function handleAddToChat() {
    if (!selection) return;
    const id = `ref-${refSeq}`;
    setRefSeq((n) => n + 1);
    setContextRefs((refs) => [...refs, chatContextRefFromSelection(selection, id)]);
  }

  // Confirm the dragged range as chat context, then dismiss the band + popup.
  function handleAddRangeToChat() {
    handleAddToChat();
    setSelection(undefined);
  }
  function handleRemoveRef(id: string) { setContextRefs((refs) => refs.filter((r) => r.id !== id)); }

  const baseRevision: CompositionRevision = useMemo(
    () => ({ id: "rev-0", compositionIndexUrl, ...(outputVideoUrl === undefined ? {} : { outputVideoUrl }) }),
    [compositionIndexUrl, outputVideoUrl],
  );
  const noopClient = useMemo<CompositionEditClient>(
    () => ({ editComposition: async () => baseRevision, renderRevision: async () => baseRevision.outputVideoUrl ?? "" }),
    [baseRevision],
  );
  const edit = useCompositionEditFlow({ jobId: jobId ?? "", client: editClient ?? noopClient, baseRevision });
  const editEnabled = jobId !== undefined && editClient !== undefined;
  const hasGeneratedPreview = outputVideoUrl !== undefined || editEnabled;
  // The video for the CURRENT revision only — no fallback to the base video. An edited revision
  // that has not been rendered yet has none, so Export renders it on demand (below) instead of
  // silently downloading the un-edited base.
  const exportVideoUrl = edit.currentVideoUrl;
  const exporting = edit.exportStatus === "rendering";
  const exportLabel = exporting ? "Rendering export" : exportVideoUrl === undefined && editEnabled ? "Render export" : "Export";
  const statusText = !hasGeneratedPreview
    ? "Empty editor shell"
    : exporting
      ? "Rendering export"
      : edit.isPreviewing
        ? "Previewing edit"
        : "Saved";

  // Assistant greeting derived from the real composition (scene count + duration).
  const sceneCount = clips.length;
  const chatIntro = model
    ? `I watched the recording — ${sceneCount} ${sceneCount === 1 ? "scene" : "scenes"}, ${Math.round(duration)} seconds. I can tighten the pacing, add zoom moves, or clean up the cursor. Where should we start?`
    : undefined;

  // ⌘L / Ctrl-L adds the active range selection to chat — mirrors the timeline popup's hint.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && (event.key === "l" || event.key === "L")) {
        if (editEnabled && selection !== undefined && selectedClipId === undefined) {
          event.preventDefault();
          handleAddRangeToChat();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editEnabled, selection, selectedClipId]);

  const handlePreviewLoading = useCallback(() => {
    resetEdits(undefined);
    setSelection(undefined);
    setSelectedZoomId(undefined);
    setRightTab("chat");
    zoomSeq.current = 0;
  }, [resetEdits]);

  function handleExport() {
    // Direct download when the current revision already has a rendered video (base or a
    // previously-exported edit); otherwise render it on demand. After a render completes, the
    // button re-enables and a second click downloads the freshly rendered edit.
    if (exportVideoUrl !== undefined) { window.open(exportVideoUrl, "_blank"); return; }
    void edit.requestExport();
  }

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
          {statusText}
        </div>
        <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            className="tk-btn tk-btn-accent"
            aria-label={exportLabel}
            title={edit.exportError ?? (exportVideoUrl !== undefined ? "Export" : editEnabled ? "Render & export this edit" : "Render the edit to export")}
            disabled={exporting || (exportVideoUrl === undefined && !editEnabled)}
            onClick={handleExport}
          >
            {exportLabel}
          </button>
        </div>
      </header>

      <div className="tk-composition-body">
        <div className="tk-composition-main">
          <section aria-label="Preview stage" className="tk-composition-stage">
            <CompositionPreview
              src={edit.currentCompositionUrl}
              currentTime={playback.currentTime}
              fallbackVideoSrc={edit.currentVideoUrl}
              aspectRatio="16 / 9"
              onLoading={handlePreviewLoading}
              onReady={(readyModel) => resetEdits(readyModel)}
              resolveWindow={resolveWindow}
              {...(selectedZoom
                ? {
                    zoomOverlay: {
                      scale: zoomScale(selectedZoom),
                      target: zoomTarget(selectedZoom),
                      onMoveTarget: handleZoomTarget,
                      onScale: handleZoomScale,
                    },
                  }
                : {})}
            />
          </section>

          {model ? (
            <CompositionPlaybackBar
              currentTime={playback.currentTime}
              duration={duration}
              isPlaying={playback.isPlaying}
              canPrev={canSkipStart}
              canNext={canSkipEnd}
              onPlayPause={() => (playback.isPlaying ? playback.pause() : playback.play())}
              onPrev={() => prev !== undefined && playback.seek(prev)}
              onNext={() => next !== undefined && playback.seek(next)}
              onSkipStart={() => playback.seek(0)}
              onSkipEnd={() => playback.seek(duration)}
              onUndo={undo}
              canUndo={canUndo}
              onRedo={redo}
              canRedo={canRedo}
              onSplit={handleSplit}
              canSplit={playheadClip !== undefined}
              onDelete={handleDeleteClip}
              canDelete={selectedClipId !== undefined}
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
              onTrimClip={handleTrimClip}
              zoom={{
                ...(selectedZoomId === undefined ? {} : { selectedId: selectedZoomId }),
                onCreate: handleCreateZoom,
                onSelect: handleSelectZoom,
                onMove: handleMoveZoom,
                onResize: handleResizeZoom,
                onDelete: handleDeleteZoom,
              }}
              {...(editEnabled ? { selectionAction: { label: "Add to Chat", hint: "⌘L", onAct: handleAddRangeToChat } } : {})}
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
          zoomTabActive={zoomTabActive}
          onSelectChatTab={() => setRightTab("chat")}
          onSelectZoomTab={() => setRightTab("zoom")}
          clipTabActive={clipTabActive}
          onSelectClipTab={() => setRightTab("clip")}
          {...(selectedClip
            ? {
                clipProperties: (
                  <ClipProperties
                    clip={selectedClip}
                    onSpeed={handleClipSpeed}
                    onReset={handleResetClipSpeed}
                    onClose={() => setRightTab("chat")}
                  />
                ),
              }
            : {})}
          {...(selectedZoom
            ? {
                zoomProperties: (
                  <ZoomProperties
                    unit={selectedZoom}
                    durationSeconds={duration}
                    onScale={handleZoomScale}
                    onEasing={handleZoomEasing}
                    onStart={handleZoomStart}
                    onEnd={handleZoomEnd}
                    onDuration={handleZoomDuration}
                    onReset={handleResetZoom}
                    onRemove={handleRemoveSelectedZoom}
                    onClose={() => setRightTab("chat")}
                  />
                ),
              }
            : {})}
          {...(editEnabled
            ? {
                onSend: handleSend,
                ...(chatIntro === undefined ? {} : { intro: chatIntro }),
                suggestions: EDIT_SUGGESTIONS,
                status: edit.status,
                isPreviewing: edit.isPreviewing,
                onAccept: () => { edit.accept(); setContextRefs([]); setSelection(undefined); },
                onReject: () => { edit.reject(); setContextRefs([]); setSelection(undefined); },
                ...(edit.error === undefined ? {} : { error: edit.error }),
              }
            : { unavailableReason: "Generate a demo to enable AI edits." })}
        />
      </div>
    </div>
  );
}
