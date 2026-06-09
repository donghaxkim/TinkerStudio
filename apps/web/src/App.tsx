import { useEffect, useMemo, useState } from "react";
import type React from "react";
import {
  ArrowLeft,
  Check,
  CircleGauge,
  Crosshair,
  ImagePlus,
  MessageSquare,
  MousePointer2,
  Palette,
  Play,
  Plus,
  Scissors,
  WandSparkles,
  X,
  ZoomIn,
} from "lucide-react";
import { applyEditOperations } from "@tinker/editor";
import {
  parseDemoProject,
  type AIEditOperation,
  type DemoProject,
  type ZoomRegion,
} from "@tinker/project-schema";
import { sampleProject } from "./fixtures/sampleProject.js";

type SelectedRange = { start: number; end: number };

type ChatAttachment =
  | { type: "time_range"; id: string; start: number; end: number }
  | { type: "current_frame"; id: string; time: number };

type Proposal = {
  id: string;
  label: string;
  operations: AIEditOperation[];
  reviewOpen: boolean;
};

type SidePanelTab = "cursor" | "zoom" | "chat" | "background";
type BackgroundMode = "wallpaper" | "gradient" | "color";
type BackgroundState = {
  blur: number;
  mode: BackgroundMode;
  padding: number;
  wallpaperIndex: number;
};

const DEFAULT_RANGE: SelectedRange = { start: 12, end: 18 };
const DEFAULT_MANUAL_TARGET = { x: 620, y: 260, width: 620, height: 380 };
const DEFAULT_BACKGROUND: BackgroundState = {
  blur: 18,
  mode: "wallpaper",
  padding: 28,
  wallpaperIndex: 0,
};
const WALLPAPERS = [
  "linear-gradient(135deg, rgba(218, 236, 255, 0.92) 0%, rgba(76, 178, 235, 0.78) 27%, rgba(22, 71, 199, 0.92) 54%, rgba(6, 15, 48, 0.95) 78%, rgba(184, 216, 255, 0.76) 100%)",
  "linear-gradient(135deg, #1f2248 0%, #2446d8 38%, #7a5cff 72%, #130f2c 100%)",
  "linear-gradient(135deg, #111827 0%, #f36b45 42%, #f0bd51 72%, #21130b 100%)",
  "linear-gradient(135deg, #071b20 0%, #36d1b6 48%, #2458ff 100%)",
  "linear-gradient(135deg, #201328 0%, #7c5cff 46%, #ff7a5c 100%)",
  "linear-gradient(135deg, #09131d 0%, #78d4ff 35%, #244dd9 76%, #02040a 100%)",
];

export function App() {
  const [project, setProject] = useState<DemoProject>(() => parseDemoProject(sampleProject));
  const [currentTime, setCurrentTime] = useState(12.1);
  const [selectedRange, setSelectedRange] = useState<SelectedRange>(DEFAULT_RANGE);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [proposal, setProposal] = useState<Proposal | undefined>();
  const [composer, setComposer] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [activePanel, setActivePanel] = useState<SidePanelTab>("chat");
  const [selectedZoomId, setSelectedZoomId] = useState<string | undefined>();
  const [background, setBackground] = useState<BackgroundState>(DEFAULT_BACKGROUND);

  const activeZoom = useMemo(
    () => project.zooms.find((zoom) => currentTime >= zoom.start && currentTime < zoom.end),
    [currentTime, project.zooms],
  );

  const currentCursor = useMemo(
    () =>
      project.cursorEvents
        .filter((event) => event.time <= currentTime)
        .sort((a, b) => b.time - a.time)[0],
    [currentTime, project.cursorEvents],
  );

  const selectedZoom = useMemo(
    () => project.zooms.find((zoom) => zoom.id === selectedZoomId),
    [project.zooms, selectedZoomId],
  );

  function applyOperations(operations: AIEditOperation[], prompt: string) {
    const result = applyEditOperations(project, operations, {
      mode: "accept",
      prompt,
    });

    if (!result.ok) {
      setError(result.errors.join(", "));
      return;
    }

    setError(undefined);
    setProject(result.project);
    setCurrentTime(Math.min(currentTime, result.project.duration));
    setSelectedRange(clampRange(selectedRange, result.project.duration));
    setProposal(undefined);
  }

  function addZoomAt(time: number) {
    const start = Math.max(0, Number(time.toFixed(1)));
    const end = Math.min(project.duration, Number((start + 2).toFixed(1)));

    if (end <= start) {
      setError("Cannot add zoom at the end of the project.");
      return;
    }

    const operation: AIEditOperation = {
      type: "add_zoom",
      start,
      end,
      target: DEFAULT_MANUAL_TARGET,
      scale: 2,
      easing: "easeInOut",
    };
    const result = applyEditOperations(project, [operation], {
      mode: "accept",
      prompt: `Added zoom at ${formatTime(start)}`,
    });

    if (!result.ok) {
      setError(result.errors.join(", "));
      return;
    }

    const previousZoomIds = new Set(project.zooms.map((zoom) => zoom.id));
    const createdZoom = result.project.zooms.find((zoom) => !previousZoomIds.has(zoom.id));

    setError(undefined);
    setProject(result.project);
    setCurrentTime(start);
    setSelectedRange({ start, end });
    setSelectedZoomId(createdZoom?.id);
    setActivePanel("zoom");
  }

  function selectZoom(zoom: ZoomRegion) {
    setSelectedZoomId(zoom.id);
    setSelectedRange({ start: zoom.start, end: zoom.end });
    setCurrentTime(zoom.start);
    setActivePanel("zoom");
  }

  function createProposal(kind: "auto_zoom" | "manual_zoom" | "trim" | "speed") {
    const operationsByKind: Record<typeof kind, AIEditOperation[]> = {
      auto_zoom: [{ type: "auto_zoom", start: selectedRange.start, end: selectedRange.end, scale: 2 }],
      manual_zoom: [
        {
          type: "add_zoom",
          start: selectedRange.start,
          end: selectedRange.end,
          target: { x: 620, y: 260, width: 620, height: 380 },
          scale: 2,
          easing: "easeInOut",
        },
      ],
      trim: [{ type: "trim", start: selectedRange.start, end: selectedRange.end }],
      speed: [{ type: "speed", start: selectedRange.start, end: selectedRange.end, speed: 2 }],
    };

    const labels: Record<typeof kind, string> = {
      auto_zoom: "Auto zoom follows the cursor",
      manual_zoom: "Manual zoom on selected frame",
      trim: "Trim selected range",
      speed: "Speed selected range to 2x",
    };

    setProposal({
      id: `proposal_${Date.now()}`,
      label: labels[kind],
      operations: operationsByKind[kind],
      reviewOpen: false,
    });
    setComposer("");
    setError(undefined);
  }

  function addRangeAttachment() {
    setAttachments((items) => [
      ...items,
      {
        type: "time_range",
        id: `range_${items.length + 1}`,
        start: selectedRange.start,
        end: selectedRange.end,
      },
    ]);
  }

  function addFrameAttachment() {
    setAttachments((items) => [
      ...items,
      {
        type: "current_frame",
        id: `frame_${items.length + 1}`,
        time: currentTime,
      },
    ]);
  }

  function sendComposer() {
    const text = composer.toLowerCase();

    if (text.includes("trim") || text.includes("cut")) {
      createProposal("trim");
      return;
    }

    if (text.includes("speed") || text.includes("faster")) {
      createProposal("speed");
      return;
    }

    if (text.includes("manual")) {
      createProposal("manual_zoom");
      return;
    }

    createProposal("auto_zoom");
  }

  return (
    <main className="app-shell">
      <section className="editor-pane" aria-label="Tinker editor">
        <header className="topbar">
          <h1>{project.title}</h1>
        </header>

        <div className="studio-workspace">
          <Preview
            activeZoom={activeZoom}
            background={background}
            currentCursor={currentCursor}
            currentTime={currentTime}
            onAddFrame={addFrameAttachment}
          />
        </div>

        <div className="transport">
          <button className="icon-button primary" type="button" aria-label="Play">
            <Play size={16} fill="currentColor" />
          </button>
          <span className="timecode">{formatTime(currentTime)}</span>
          <input
            aria-label="Current time"
            className="scrubber"
            max={project.duration}
            min={0}
            onChange={(event) => setCurrentTime(Number(event.target.value))}
            step={0.1}
            type="range"
            value={currentTime}
          />
        </div>

        <Timeline
          currentTime={currentTime}
          onAddZoomAt={addZoomAt}
          onSelectRange={setSelectedRange}
          onSelectZoom={selectZoom}
          onSeek={setCurrentTime}
          project={project}
          selectedZoomId={selectedZoomId}
          selectedRange={selectedRange}
        />

        <div className="action-strip" aria-label="Editor actions">
          <button type="button" onClick={() => createProposal("auto_zoom")}>
            <WandSparkles size={16} />
            Auto zoom
          </button>
          <button type="button" onClick={() => createProposal("manual_zoom")}>
            <ZoomIn size={16} />
            Manual zoom
          </button>
          <button type="button" onClick={() => createProposal("trim")}>
            <Scissors size={16} />
            Trim
          </button>
          <button type="button" onClick={() => createProposal("speed")}>
            <CircleGauge size={16} />
            Speed 2x
          </button>
        </div>
      </section>

      <aside className="side-pane" aria-label="Editor side panel">
        <SideTabs activePanel={activePanel} onChange={setActivePanel} />
        <PanelContent
          activePanel={activePanel}
          attachments={attachments}
          composer={composer}
          error={error}
          onAddRangeAttachment={addRangeAttachment}
          onApplyOperations={applyOperations}
          onComposerChange={setComposer}
          onProposalChange={setProposal}
          onSendComposer={sendComposer}
          onTabChange={setActivePanel}
          background={background}
          onBackgroundChange={setBackground}
          proposal={proposal}
          selectedZoom={selectedZoom}
        />
      </aside>
    </main>
  );
}

function SideTabs({
  activePanel,
  onChange,
}: {
  activePanel: SidePanelTab;
  onChange: (tab: SidePanelTab) => void;
}) {
  const tabs: Array<{ icon: React.ReactNode; id: SidePanelTab; label: string }> = [
    { id: "cursor", label: "Cursor", icon: <MousePointer2 size={18} /> },
    { id: "zoom", label: "Zoom", icon: <Crosshair size={18} /> },
    { id: "chat", label: "Chat", icon: <MessageSquare size={18} /> },
    { id: "background", label: "Background", icon: <Palette size={18} /> },
  ];

  return (
    <nav className="side-tabs" aria-label="Side panel tabs">
      {tabs.map((tab) => (
        <button
          className={activePanel === tab.id ? "active" : undefined}
          key={tab.id}
          type="button"
          aria-label={tab.label}
          aria-pressed={activePanel === tab.id}
          onClick={() => onChange(tab.id)}
        >
          {tab.icon}
        </button>
      ))}
    </nav>
  );
}

function PanelContent({
  activePanel,
  attachments,
  background,
  composer,
  error,
  onBackgroundChange,
  onAddRangeAttachment,
  onApplyOperations,
  onComposerChange,
  onProposalChange,
  onSendComposer,
  onTabChange,
  proposal,
  selectedZoom,
}: {
  activePanel: SidePanelTab;
  attachments: ChatAttachment[];
  background: BackgroundState;
  composer: string;
  error?: string;
  onBackgroundChange: React.Dispatch<React.SetStateAction<BackgroundState>>;
  onAddRangeAttachment: () => void;
  onApplyOperations: (operations: AIEditOperation[], prompt: string) => void;
  onComposerChange: (value: string) => void;
  onProposalChange: React.Dispatch<React.SetStateAction<Proposal | undefined>>;
  onSendComposer: () => void;
  onTabChange: (tab: SidePanelTab) => void;
  proposal?: Proposal;
  selectedZoom?: ZoomRegion;
}) {
  if (activePanel === "zoom") {
    return <ZoomEditor onClose={() => onTabChange("chat")} selectedZoom={selectedZoom} />;
  }

  if (activePanel === "cursor") {
    return (
      <div className="panel-scroll">
        <PanelSection title="Cursor">
          <p className="panel-copy">Cursor smoothing, click emphasis, and cursor size controls will live here.</p>
          <label className="control-row">
            Cursor size
            <input max={2} min={0.5} step={0.1} type="range" defaultValue={1} />
          </label>
          <label className="toggle-row">
            Show click pulse
            <input type="checkbox" defaultChecked />
          </label>
        </PanelSection>
      </div>
    );
  }

  if (activePanel === "background") {
    return (
      <div className="panel-scroll">
        <PanelSection title="Background">
          <div className="segmented-control" role="group" aria-label="Background type">
            <button
              className={background.mode === "wallpaper" ? "active" : undefined}
              type="button"
              onClick={() => onBackgroundChange((current) => ({ ...current, mode: "wallpaper" }))}
            >
              Wallpaper
            </button>
            <button
              className={background.mode === "gradient" ? "active" : undefined}
              type="button"
              onClick={() => onBackgroundChange((current) => ({ ...current, mode: "gradient" }))}
            >
              Gradient
            </button>
            <button
              className={background.mode === "color" ? "active" : undefined}
              type="button"
              onClick={() => onBackgroundChange((current) => ({ ...current, mode: "color" }))}
            >
              Color
            </button>
          </div>
          <div className="wallpaper-grid" aria-label="Wallpaper presets">
            {WALLPAPERS.map((wallpaper, index) => (
              <button
                className={background.wallpaperIndex === index ? "active" : undefined}
                key={wallpaper}
                type="button"
                aria-label={`Wallpaper ${index + 1}`}
                style={{ backgroundImage: wallpaper }}
                onClick={() =>
                  onBackgroundChange((current) => ({
                    ...current,
                    mode: "wallpaper",
                    wallpaperIndex: index,
                  }))
                }
              />
            ))}
          </div>
          <label className="control-row">
            Background blur
            <input
              aria-label="Background blur"
              max={48}
              min={0}
              type="range"
              value={background.blur}
              onChange={(event) =>
                onBackgroundChange((current) => ({ ...current, blur: Number(event.target.value) }))
              }
            />
          </label>
          <label className="control-row">
            Padding
            <input
              aria-label="Padding"
              max={72}
              min={8}
              type="range"
              value={background.padding}
              onChange={(event) =>
                onBackgroundChange((current) => ({
                  ...current,
                  padding: Number(event.target.value),
                }))
              }
            />
          </label>
        </PanelSection>
      </div>
    );
  }

  return (
    <>
      <div className="chat-header">
        <h2>Tinker</h2>
      </div>

      <div className="chat-scroll">
        <div className="message assistant">
          <span className="message-author">Tinker</span>
          <p>Select a range, attach it, then ask for auto zoom, manual zoom, trim, or speed.</p>
        </div>

        {attachments.map((attachment) => (
          <AttachmentCard key={attachment.id} attachment={attachment} />
        ))}

        {proposal ? (
          <div className="proposal">
            <span className="message-author">Tinker suggests</span>
            <p>{proposal.label}</p>
            {proposal.reviewOpen ? <pre>{JSON.stringify(proposal.operations, null, 2)}</pre> : null}
            <div className="proposal-actions">
              <button
                className="primary"
                type="button"
                onClick={() => onApplyOperations(proposal.operations, proposal.label)}
              >
                <Check size={15} />
                Apply
              </button>
              <button
                type="button"
                onClick={() =>
                  onProposalChange((current) =>
                    current ? { ...current, reviewOpen: !current.reviewOpen } : current,
                  )
                }
              >
                Review
              </button>
              <button type="button" onClick={() => onProposalChange(undefined)}>
                <X size={15} />
                Reject
              </button>
            </div>
          </div>
        ) : null}

        {error ? <p className="error-text">{error}</p> : null}
      </div>

      <div className="composer">
        <div className="composer-input-row">
          <button
            className="attach-button"
            type="button"
            aria-label="Attach selected range"
            onClick={onAddRangeAttachment}
          >
            <Plus size={18} />
          </button>
          <input
            aria-label="Ask Tinker"
            onChange={(event) => onComposerChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onSendComposer();
              }
            }}
            placeholder="Ask Tinker..."
            type="text"
            value={composer}
          />
          <button className="primary" type="button" onClick={onSendComposer}>
            Send
          </button>
        </div>
      </div>
    </>
  );
}

function ZoomEditor({
  onClose,
  selectedZoom,
}: {
  onClose: () => void;
  selectedZoom?: ZoomRegion;
}) {
  const [disabled, setDisabled] = useState(false);
  const [instantAnimation, setInstantAnimation] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(selectedZoom?.scale ?? 2);
  const [zoomMode, setZoomMode] = useState<ZoomRegion["mode"]>(selectedZoom?.mode ?? "auto");

  useEffect(() => {
    setDisabled(false);
    setInstantAnimation(false);
    setZoomLevel(selectedZoom?.scale ?? 2);
    setZoomMode(selectedZoom?.mode ?? "auto");
  }, [selectedZoom?.id, selectedZoom?.mode, selectedZoom?.scale]);

  return (
    <div className="panel-scroll zoom-editor">
      <button className="panel-back-button" type="button" onClick={onClose}>
        <ArrowLeft size={21} />
        Close Zoom editor
      </button>

      {selectedZoom ? (
        <>
          <PanelSection title="Zoom level">
            <p className="panel-copy">How close to zoom during this phase.</p>
            <div className="slider-row">
              <input
                aria-label="Zoom level"
                max={3}
                min={1}
                onChange={(event) => setZoomLevel(Number(event.target.value))}
                step={0.1}
                type="range"
                value={zoomLevel}
              />
              <button type="button" onClick={() => setZoomLevel(selectedZoom.scale)}>
                Reset
              </button>
            </div>
            <button className="wide-control" type="button">
              <Plus size={17} />
              Apply zoom level to all other zooms
            </button>
          </PanelSection>

          <PanelSection title="Zoom mode">
            <div className="segmented-control" role="group" aria-label="Zoom mode">
              <button
                className={zoomMode === "auto" ? "active" : undefined}
                type="button"
                onClick={() => setZoomMode("auto")}
              >
                <WandSparkles size={17} />
                Auto
              </button>
              <button
                className={zoomMode === "manual" ? "active" : undefined}
                type="button"
                onClick={() => setZoomMode("manual")}
              >
                <Crosshair size={17} />
                Manual
              </button>
            </div>
            <p className="panel-copy">
              {zoomMode === "auto"
                ? "Zoomed camera keeps the mouse cursor visible."
                : "Manual zoom uses an explicit target region."}
            </p>
          </PanelSection>

          <PanelSection title="Timing">
            <div className="property-grid">
              <span>Start</span>
              <strong>{formatTime(selectedZoom.start)}</strong>
              <span>End</span>
              <strong>{formatTime(selectedZoom.end)}</strong>
              <span>Scale</span>
              <strong>{zoomLevel.toFixed(1)}x</strong>
            </div>
          </PanelSection>

          <PanelSection title="Animation">
            <label className="toggle-row">
              Instant animation
              <input
                checked={instantAnimation}
                onChange={(event) => setInstantAnimation(event.target.checked)}
                type="checkbox"
              />
            </label>
            <label className="toggle-row">
              Disable zoom
              <input
                checked={disabled}
                onChange={(event) => setDisabled(event.target.checked)}
                type="checkbox"
              />
            </label>
          </PanelSection>
        </>
      ) : (
        <PanelSection title="No zoom selected">
          <p className="panel-copy">
            Hover over the Zoom lane and press the add button to create a zoom at that time.
          </p>
        </PanelSection>
      )}
    </div>
  );
}

function PanelSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="panel-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Preview({
  activeZoom,
  background,
  currentCursor,
  currentTime,
  onAddFrame,
}: {
  activeZoom?: ZoomRegion;
  background: BackgroundState;
  currentCursor?: DemoProject["cursorEvents"][number];
  currentTime: number;
  onAddFrame: () => void;
}) {
  const zoomTarget =
    activeZoom?.mode === "manual" ? activeZoom.target : activeZoom?.keyframes.at(-1)?.target;
  const previewStyle = {
    "--preview-background": previewBackground(background),
    "--preview-blur": `${background.blur}px`,
    "--preview-padding": `${background.padding}px`,
  } as React.CSSProperties;

  return (
    <section className="preview-shell" aria-label="Preview">
      <div className="preview-toolbar">
        <span>{formatTime(currentTime)}</span>
        <button type="button" onClick={onAddFrame}>
          <ImagePlus size={15} />
          Add frame
        </button>
      </div>
      <div className="preview-frame" style={previewStyle}>
        <div className="preview-wallpaper" />
        <div className="preview-window">
          <div className="browser-bar">
            <span />
            <span />
            <span />
          </div>
          <div className="product-screen">
            <div className="screen-sidebar" />
            <div className="screen-content">
              <div className="screen-row wide" />
              <div className="screen-grid">
                <div />
                <div />
                <div />
              </div>
              <div className="screen-chart" />
            </div>
            {zoomTarget ? (
              <div
                className="zoom-target"
                style={{
                  height: `${(zoomTarget.height / 1080) * 100}%`,
                  left: `${(zoomTarget.x / 1920) * 100}%`,
                  top: `${(zoomTarget.y / 1080) * 100}%`,
                  width: `${(zoomTarget.width / 1920) * 100}%`,
                }}
              >
                {activeZoom?.mode === "auto" ? "Auto" : "Manual"}
              </div>
            ) : null}
            {currentCursor ? (
              <div
                className="cursor-dot"
                style={{
                  left: `${(currentCursor.x / 1920) * 100}%`,
                  top: `${(currentCursor.y / 1080) * 100}%`,
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function Timeline({
  currentTime,
  onAddZoomAt,
  onSeek,
  onSelectRange,
  onSelectZoom,
  project,
  selectedZoomId,
  selectedRange,
}: {
  currentTime: number;
  onAddZoomAt: (time: number) => void;
  onSeek: (time: number) => void;
  onSelectRange: (range: SelectedRange) => void;
  onSelectZoom: (zoom: ZoomRegion) => void;
  project: DemoProject;
  selectedZoomId?: string;
  selectedRange: SelectedRange;
}) {
  const [hoverZoomTime, setHoverZoomTime] = useState<number | undefined>();
  const [hoverTimelineTime, setHoverTimelineTime] = useState<number | undefined>();

  function percent(time: number) {
    return `${(time / project.duration) * 100}%`;
  }

  function timeFromEvent(event: React.MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const rawTime = ((event.clientX - rect.left) / rect.width) * project.duration;
    const time = Math.max(0, Math.min(project.duration, rawTime));

    return Number(time.toFixed(1));
  }

  function handleClick(event: React.MouseEvent<HTMLElement>) {
    onSeek(timeFromEvent(event));
  }

  function handleTimelineHover(event: React.MouseEvent<HTMLElement>) {
    setHoverTimelineTime(timeFromEvent(event));
  }

  function handleZoomHover(event: React.MouseEvent<HTMLElement>) {
    const time = timeFromEvent(event);

    setHoverTimelineTime(time);
    setHoverZoomTime(time);
  }

  return (
    <section
      className="timeline-shell"
      aria-label="Timeline"
      onMouseLeave={() => {
        setHoverTimelineTime(undefined);
        setHoverZoomTime(undefined);
      }}
    >
      {hoverTimelineTime !== undefined ? (
        <div
          aria-label={`Frame preview ${formatTime(hoverTimelineTime)}`}
          className="timeline-hover-preview"
          style={{ left: percent(hoverTimelineTime) }}
        >
          <div className="hover-frame">
            <div className="hover-browser-bar">
              <span />
              <span />
              <span />
            </div>
            <div className="hover-frame-screen">
              <span className="hover-cursor-dot" style={mockCursorStyle(hoverTimelineTime)} />
            </div>
          </div>
          <strong>{formatTime(hoverTimelineTime)}</strong>
        </div>
      ) : null}

      <div className="timeline-ruler" onClick={handleClick} onMouseMove={handleTimelineHover}>
        <div className="playhead" style={{ left: percent(currentTime) }} />
        <div
          className="selected-range"
          style={{
            left: percent(selectedRange.start),
            width: `${((selectedRange.end - selectedRange.start) / project.duration) * 100}%`,
          }}
        />
        {[0, 0.25, 0.5, 0.75, 1].map((mark) => (
          <span key={mark} style={{ left: `${mark * 100}%` }}>
            {formatTime(project.duration * mark)}
          </span>
        ))}
      </div>

      <TimelineRow className="video-row" label="Video" onClick={handleClick} onMouseMove={handleTimelineHover}>
        {project.tracks.flatMap((track) =>
          track.clips.map((clip) => (
            <div
              className="clip-bar"
              key={clip.id}
              style={{
                left: percent(clip.start),
                width: `${((clip.end - clip.start) / project.duration) * 100}%`,
              }}
            >
              {clip.playbackRate !== 1 ? `${clip.playbackRate}x` : clip.name ?? "Clip"}
            </div>
          )),
        )}
      </TimelineRow>

      <div className="timeline-row zoom-row">
        <span>Zoom</span>
        <div
          className="timeline-track zoom-track"
          onClick={handleClick}
          onMouseMove={handleZoomHover}
        >
          {project.zooms.length === 0 && hoverZoomTime === undefined ? (
            <span className="zoom-lane-hint">Hover to add zoom on cursor</span>
          ) : null}
          {hoverZoomTime !== undefined ? (
            <button
              className="zoom-add-button"
              type="button"
              aria-label={`Add zoom at ${formatTime(hoverZoomTime)}`}
              style={{ left: percent(hoverZoomTime) }}
              onClick={(event) => {
                event.stopPropagation();
                onAddZoomAt(hoverZoomTime);
              }}
            >
              <Plus size={14} />
              <span>{formatTime(hoverZoomTime)}</span>
            </button>
          ) : null}
          {project.zooms.map((zoom) => (
            <button
              className={`zoom-bar ${zoom.mode} ${selectedZoomId === zoom.id ? "selected" : ""}`}
              key={zoom.id}
              type="button"
              aria-label={`Edit ${zoom.mode} zoom ${formatTime(zoom.start)} to ${formatTime(zoom.end)}`}
              style={{
                left: percent(zoom.start),
                width: `${((zoom.end - zoom.start) / project.duration) * 100}%`,
              }}
              onClick={(event) => {
                event.stopPropagation();
                onSelectZoom(zoom);
              }}
            >
              {zoom.mode === "auto" ? "Auto" : "Manual"}
            </button>
          ))}
        </div>
      </div>

      <div className="range-editors">
        <label>
          Start
          <input
            max={selectedRange.end - 0.1}
            min={0}
            onChange={(event) =>
              onSelectRange({ ...selectedRange, start: Number(event.target.value) })
            }
            step={0.1}
            type="number"
            value={selectedRange.start}
          />
        </label>
        <label>
          End
          <input
            max={project.duration}
            min={selectedRange.start + 0.1}
            onChange={(event) =>
              onSelectRange({ ...selectedRange, end: Number(event.target.value) })
            }
            step={0.1}
            type="number"
            value={selectedRange.end}
          />
        </label>
      </div>
    </section>
  );
}

function TimelineRow({
  children,
  className,
  label,
  onClick,
  onMouseMove,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onMouseMove?: (event: React.MouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div className={`timeline-row ${className ?? ""}`}>
      <span>{label}</span>
      <div className="timeline-track" onClick={onClick} onMouseMove={onMouseMove}>
        {children}
      </div>
    </div>
  );
}

function AttachmentCard({ attachment }: { attachment: ChatAttachment }) {
  if (attachment.type === "current_frame") {
    return (
      <div className="attachment-card">
        <span className="message-author">Frame</span>
        <p>{formatTime(attachment.time)}</p>
      </div>
    );
  }

  return (
    <div className="attachment-card">
      <span className="message-author">Selected range</span>
      <p>
        {formatTime(attachment.start)}-{formatTime(attachment.end)}
      </p>
      <div className="thumb-strip">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function clampRange(range: SelectedRange, duration: number): SelectedRange {
  if (range.end <= duration) {
    return range;
  }

  const length = range.end - range.start;
  const end = duration;
  const start = Math.max(0, end - length);

  return { start, end };
}

function mockCursorStyle(time: number) {
  return {
    left: `${50 + Math.sin(time * 0.7) * 26}%`,
    top: `${50 + Math.cos(time * 0.55) * 22}%`,
  };
}

function previewBackground(background: BackgroundState) {
  if (background.mode === "color") {
    return "#151515";
  }

  if (background.mode === "gradient") {
    return "linear-gradient(135deg, #0d0d0f 0%, #272a3f 28%, #7c5cff 58%, #6fd6c0 100%)";
  }

  return WALLPAPERS[background.wallpaperIndex] ?? WALLPAPERS[0];
}

function formatTime(time: number) {
  const minutes = Math.floor(time / 60);
  const seconds = time % 60;

  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
}
