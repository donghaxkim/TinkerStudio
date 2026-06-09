import { useMemo, useState } from "react";
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

const DEFAULT_RANGE: SelectedRange = { start: 12, end: 18 };
const DEFAULT_MANUAL_TARGET = { x: 620, y: 260, width: 620, height: 380 };

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
  composer,
  error,
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
  composer: string;
  error?: string;
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
            <button className="active" type="button">
              Wallpaper
            </button>
            <button type="button">Color</button>
            <button type="button">Blur</button>
          </div>
          <div className="wallpaper-grid" aria-label="Wallpaper presets">
            {Array.from({ length: 10 }).map((_, index) => (
              <button key={index} type="button" aria-label={`Wallpaper ${index + 1}`} />
            ))}
          </div>
          <label className="control-row">
            Background blur
            <input max={100} min={0} type="range" defaultValue={18} />
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
              <input max={3} min={1} step={0.1} type="range" defaultValue={selectedZoom.scale} />
              <button type="button">Reset</button>
            </div>
            <button className="wide-control" type="button">
              <Plus size={17} />
              Apply zoom level to all other zooms
            </button>
          </PanelSection>

          <PanelSection title="Zoom mode">
            <div className="segmented-control" role="group" aria-label="Zoom mode">
              <button className={selectedZoom.mode === "auto" ? "active" : undefined} type="button">
                <WandSparkles size={17} />
                Auto
              </button>
              <button
                className={selectedZoom.mode === "manual" ? "active" : undefined}
                type="button"
              >
                <Crosshair size={17} />
                Manual
              </button>
            </div>
            <p className="panel-copy">
              {selectedZoom.mode === "auto"
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
              <strong>{selectedZoom.scale.toFixed(1)}x</strong>
            </div>
          </PanelSection>

          <PanelSection title="Animation">
            <label className="toggle-row">
              Instant animation
              <input type="checkbox" />
            </label>
            <label className="toggle-row">
              Disable zoom
              <input type="checkbox" />
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
  currentCursor,
  currentTime,
  onAddFrame,
}: {
  activeZoom?: ZoomRegion;
  currentCursor?: DemoProject["cursorEvents"][number];
  currentTime: number;
  onAddFrame: () => void;
}) {
  const zoomTarget =
    activeZoom?.mode === "manual" ? activeZoom.target : activeZoom?.keyframes.at(-1)?.target;

  return (
    <section className="preview-shell" aria-label="Preview">
      <div className="preview-toolbar">
        <span>{formatTime(currentTime)}</span>
        <button type="button" onClick={onAddFrame}>
          <ImagePlus size={15} />
          Add frame
        </button>
      </div>
      <div className="preview-frame">
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

  function percent(time: number) {
    return `${(time / project.duration) * 100}%`;
  }

  function timeFromEvent(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const rawTime = ((event.clientX - rect.left) / rect.width) * project.duration;
    const time = Math.max(0, Math.min(project.duration, rawTime));

    return Number(time.toFixed(1));
  }

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    onSeek(timeFromEvent(event));
  }

  function handleZoomHover(event: React.MouseEvent<HTMLDivElement>) {
    setHoverZoomTime(timeFromEvent(event));
  }

  return (
    <section className="timeline-shell" aria-label="Timeline">
      <div className="timeline-ruler" onClick={handleClick}>
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

      <TimelineRow className="video-row" label="Video">
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
          onMouseLeave={() => setHoverZoomTime(undefined)}
          onMouseMove={handleZoomHover}
        >
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
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div className={`timeline-row ${className ?? ""}`}>
      <span>{label}</span>
      <div className="timeline-track">{children}</div>
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

function formatTime(time: number) {
  const minutes = Math.floor(time / 60);
  const seconds = time % 60;

  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
}
