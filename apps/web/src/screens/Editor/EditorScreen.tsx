import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AIEditPanel } from "@tinker/ai-edit-ui";
import {
  Preview,
  Timeline,
  createEditorHistory,
  pushEditorCommand,
  redoEditorCommand,
  undoEditorCommand,
  type EditorCommand,
  type EditorHistory,
  type SelectedRange,
} from "@tinker/editor";
import type { DemoProject } from "@tinker/project-schema";
import { loadSampleProject } from "../../fixtures/loadSampleProject.js";
import { EditorAutoZoomPanel, type PreviewSource } from "./EditorAutoZoomPanel.js";
import { EditorManualControls } from "./EditorManualControls.js";
import { ProjectLoadPanel } from "./ProjectLoadPanel.js";
import { ProjectExportPanel } from "./ProjectExportPanel.js";
import { ProjectSaveLoadControls } from "./ProjectSaveLoadControls.js";

// ─── time + resolution formatters ──────────────────────────────────────────────

/** Format seconds as `m:ss.s` (e.g. 3.2 → "0:03.2"). */
function formatTimecode(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  const rounded = remainder.toFixed(1);
  const padded = parseFloat(rounded) < 10 ? `0${rounded}` : rounded;
  return `${minutes}:${padded}`;
}

/** Map aspect ratio + (implicit) height to a friendly resolution label. */
function resolutionLabel(aspectRatio: DemoProject["aspectRatio"]): string {
  switch (aspectRatio) {
    case "16:9":
      return "1080p";
    case "9:16":
      return "1080×1920";
    case "1:1":
      return "1080×1080";
    default:
      return aspectRatio;
  }
}

/** Ordered clip-start times across all tracks (used by prev/next clip seek). */
function clipBoundaries(project: DemoProject): number[] {
  const starts = project.tracks.flatMap((track) => track.clips.map((clip) => clip.start));
  return Array.from(new Set(starts)).sort((a, b) => a - b);
}

function previousBoundary(boundaries: number[], time: number): number | undefined {
  let result: number | undefined;
  for (const boundary of boundaries) {
    if (boundary < time - 1e-6) result = boundary;
  }
  return result;
}

function nextBoundary(boundaries: number[], time: number): number | undefined {
  for (const boundary of boundaries) {
    if (boundary > time + 1e-6) return boundary;
  }
  return undefined;
}

// ─── icons (inline, currentColor) ──────────────────────────────────────────────

const ICON = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function GearIcon() {
  return (
    <svg {...ICON} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}

function PrevIcon() {
  return (
    <svg {...ICON} aria-hidden="true">
      <path d="M19 20 9 12l10-8z" />
      <line x1="5" y1="4" x2="5" y2="20" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg {...ICON} aria-hidden="true">
      <path d="m5 4 10 8-10 8z" />
      <line x1="19" y1="4" x2="19" y2="20" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg {...ICON} aria-hidden="true">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-1" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg {...ICON} aria-hidden="true">
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9a5 5 0 0 0 0 10h1" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg {...ICON} aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg {...ICON} aria-hidden="true">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

function SplitIcon() {
  return (
    <svg {...ICON} aria-hidden="true">
      <line x1="12" y1="3" x2="12" y2="21" />
      <path d="M8 7 4 11l4 4" />
      <path d="m16 7 4 4-4 4" />
    </svg>
  );
}

function ZoomMoveIcon() {
  return (
    <svg {...ICON} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

function FrameIcon() {
  return (
    <svg {...ICON} aria-hidden="true">
      <path d="M4 8V6a2 2 0 0 1 2-2h2" />
      <path d="M16 4h2a2 2 0 0 1 2 2v2" />
      <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
      <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
    </svg>
  );
}

function CropIcon() {
  return (
    <svg {...ICON} aria-hidden="true">
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M18 22V8a2 2 0 0 0-2-2H2" />
    </svg>
  );
}

function MaskIcon() {
  return (
    <svg {...ICON} aria-hidden="true">
      <circle cx="9" cy="12" r="6" />
      <circle cx="15" cy="12" r="6" />
    </svg>
  );
}

// ─── types ──────────────────────────────────────────────────────────────────

type EditorScreenProps = {
  initialProject?: DemoProject;
  onOpenSettings?: () => void;
  onExitToCreate?: () => void;
};

type PreviewState = {
  source: Exclude<PreviewSource, "none">;
  project: DemoProject;
};

type PanelTab = "chat" | "zoom" | "speed" | "cursor" | "frame";

const PANEL_TABS: Array<{ id: PanelTab; label: string }> = [
  { id: "chat", label: "Chat" },
  { id: "zoom", label: "Zoom" },
  { id: "speed", label: "Speed" },
  { id: "cursor", label: "Cursor" },
  { id: "frame", label: "Frame" },
];

// ─── error / empty states (calm Porcelain) ────────────────────────────────────

function EditorMessage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main
      className="tk-porcelain"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "var(--tk-app-bg)",
        color: "var(--tk-text)",
        fontFamily: "var(--tk-font)",
      }}
    >
      <section
        style={{
          maxWidth: 460,
          width: "100%",
          display: "grid",
          gap: 12,
          padding: 24,
          background: "var(--tk-card)",
          border: "1px solid var(--tk-border)",
          borderRadius: "var(--tk-radius-lg)",
          boxShadow: "var(--tk-shadow-md)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 18 }}>{title}</h1>
        <div style={{ color: "var(--tk-text-sec)", fontSize: 13.5, lineHeight: 1.5 }}>{children}</div>
      </section>
    </main>
  );
}

// ─── component ────────────────────────────────────────────────────────────────

export function EditorScreen({ initialProject, onOpenSettings, onExitToCreate }: EditorScreenProps = {}) {
  const loadResult = useMemo(() => (initialProject ? { ok: true as const, project: initialProject } : loadSampleProject()), [initialProject]);
  const [project, setProject] = useState<DemoProject | undefined>(loadResult.ok ? loadResult.project : undefined);
  const [previewState, setPreviewState] = useState<PreviewState | undefined>();
  const [history, setHistory] = useState<EditorHistory>(() => createEditorHistory());
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedRange, setSelectedRange] = useState<SelectedRange>({ start: 12, end: 18 });
  const [activeTab, setActiveTab] = useState<PanelTab>("zoom");
  const [isPlaying, setIsPlaying] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [toolRailOpen, setToolRailOpen] = useState(true);

  // Refs for the rAF playback loop.
  const lastFrameTimeRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  // Ref so the rAF callback always reads the latest currentTime without stale closure.
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;
  // Ref for the export panel section (used to scroll it into view).
  const exportPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      if (rafIdRef.current !== null) {
        if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      lastFrameTimeRef.current = null;
      return;
    }

    if (typeof requestAnimationFrame !== "function") return;

    const duration = project?.duration ?? 0;

    function tick(timestamp: number) {
      if (!mountedRef.current) return;

      if (lastFrameTimeRef.current === null) {
        lastFrameTimeRef.current = timestamp;
      }
      const delta = (timestamp - lastFrameTimeRef.current) / 1000;
      lastFrameTimeRef.current = timestamp;

      const next = Math.min(currentTimeRef.current + delta, duration);
      setCurrentTime(next);

      if (next >= duration) {
        setIsPlaying(false);
        lastFrameTimeRef.current = null;
        return;
      }

      rafIdRef.current = requestAnimationFrame(tick);
    }

    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafIdRef.current !== null) {
        if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      lastFrameTimeRef.current = null;
    };
  }, [isPlaying, project?.duration]);

  // Fix 6: scroll export panel into view when exportOpen becomes true, no uncancelled timer.
  useEffect(() => {
    if (exportOpen) {
      exportPanelRef.current?.scrollIntoView?.({ block: "nearest" });
    }
  }, [exportOpen]);

  if (!loadResult.ok) {
    return (
      <EditorMessage title="This project could not be opened">
        <ProjectLoadPanel result={loadResult} />
      </EditorMessage>
    );
  }

  if (!project) {
    return (
      <EditorMessage title="Project failed to initialize">
        The editor could not load a project. Start a new demo or load a saved project file to continue.
      </EditorMessage>
    );
  }

  const displayProject = previewState?.project ?? project;
  const previewSource = previewState?.source ?? "none";
  const isPreviewingAIEdit = previewState?.source === "ai";
  const isPreviewingEdit = previewState !== undefined;

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;
  const boundaries = clipBoundaries(project);
  const prevClip = previousBoundary(boundaries, currentTime);
  const nextClip = nextBoundary(boundaries, currentTime);

  function handleUndo() {
    const result = undoEditorCommand(history, project!);
    setHistory(result.history);
    setProject(result.project);
    setPreviewState(undefined);
  }

  function handleRedo() {
    const result = redoEditorCommand(history, project!);
    setHistory(result.history);
    setProject(result.project);
    setPreviewState(undefined);
  }

  function handleProjectLoaded(loadedProject: DemoProject) {
    setProject(loadedProject);
    setPreviewState(undefined);
    setHistory(createEditorHistory());
    setCurrentTime(0);
    setSelectedRange({ start: 0, end: Math.min(loadedProject.duration, 6) });
  }

  function handleManualApply(updatedProject: DemoProject, command: EditorCommand) {
    setProject(updatedProject);
    setPreviewState(undefined);
    setHistory((current) => pushEditorCommand(current, command));
  }

  function handleAcceptCommand(updatedProject: DemoProject, command: EditorCommand) {
    setProject(updatedProject);
    setPreviewState(undefined);
    setHistory((current) => pushEditorCommand(current, command));
  }

  return (
    <div
      className="tk-porcelain"
      style={{
        height: "100vh",
        maxHeight: "100vh",
        overflow: "auto",
        display: "grid",
        gridTemplateRows: "52px minmax(0, 1fr) auto",
        background: "var(--tk-app-bg)",
        color: "var(--tk-text)",
        fontFamily: "var(--tk-font)",
      }}
    >
      {/* ── Top app bar ─────────────────────────────────────────────────────── */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 14px",
          borderBottom: "1px solid var(--tk-border)",
          background: "var(--tk-card)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <button
            type="button"
            onClick={onExitToCreate}
            disabled={!onExitToCreate}
            aria-label="New demo"
            title="Back to New demo"
            style={{
              display: "inline-flex",
              alignItems: "baseline",
              gap: 6,
              border: "none",
              background: "transparent",
              padding: "4px 2px",
              borderRadius: "var(--tk-radius-sm)",
              cursor: onExitToCreate ? "pointer" : "default",
            }}
          >
            <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--tk-text)" }}>Tinker</span>
            <span style={{ fontSize: 13.5, fontWeight: 400, color: "var(--tk-text-sec)" }}>Studio</span>
          </button>
          <span className="tk-vr" />
          <span
            style={{
              fontFamily: "var(--tk-mono)",
              fontSize: 12,
              color: "var(--tk-text-sec)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {project.title}
          </span>
          <span style={{ fontSize: 11.5, color: "var(--tk-text-ter)" }}>Saved</span>
        </div>

        {/* The h1 carries the project title for navigation/identity (visually flush in the bar). */}
        <h1 className="tk-sr-title" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", margin: -1, padding: 0, border: 0 }}>
          {project.title}
        </h1>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" className="tk-iconbtn" onClick={onOpenSettings} disabled={!onOpenSettings}>
            <GearIcon />
            <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", margin: -1, padding: 0, border: 0 }}>Settings</span>
          </button>
          <span className="tk-vr" />
          <button
            type="button"
            className="tk-btn"
            aria-label="Preview (play)"
            title="Preview (play)"
            onClick={() => {
              if (project && currentTime >= project.duration) setCurrentTime(0);
              setIsPlaying(true);
            }}
          >
            Preview
          </button>
          <button
            type="button"
            className="tk-btn tk-btn-accent"
            aria-label="Export"
            title="Open the export panel"
            onClick={() => setExportOpen(true)}
          >
            Export
          </button>
        </div>
      </header>

      {/* ── Body: 70 / 30 split ─────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) clamp(320px, 30%, 440px)", minHeight: 0 }}>
        {/* ── Left column ──────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateRows: "minmax(0, 1fr) auto auto", minHeight: 0, padding: 14, gap: 12 }}>
          {/* Preview stage */}
          <section aria-label="Preview stage" style={{ position: "relative", minHeight: 0 }}>
            <div
              style={{
                position: "relative",
                height: "100%",
                minHeight: 0,
                borderRadius: "var(--tk-radius-xl)",
                background: "var(--tk-preview-bg)",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 24,
              }}
            >
              {/* Floating tool rail */}
              {toolRailOpen ? (
                <nav
                  aria-label="Editor tools"
                  style={{
                    position: "absolute",
                    left: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    display: "grid",
                    gap: 4,
                    padding: 5,
                    borderRadius: "var(--tk-radius-md)",
                    background: "var(--tk-card)",
                    border: "1px solid var(--tk-border)",
                    boxShadow: "var(--tk-shadow-md)",
                    zIndex: 5,
                  }}
                >
                  <button
                    type="button"
                    className="tk-iconbtn"
                    aria-label="Close tools"
                    title="Close tools"
                    onClick={() => setToolRailOpen(false)}
                  >
                    <CloseIcon />
                  </button>
                  <button type="button" className="tk-railbtn" aria-label="Split clip — not available in the MVP" title="Not available in the MVP" disabled>
                    <SplitIcon />
                  </button>
                  <button
                    type="button"
                    className={`tk-railbtn${activeTab === "zoom" ? " tk-railbtn-on" : ""}`}
                    aria-label="Zoom move"
                    title="Add a zoom move (opens the Zoom panel)"
                    aria-pressed={activeTab === "zoom"}
                    onClick={() => setActiveTab("zoom")}
                  >
                    <ZoomMoveIcon />
                  </button>
                  <button type="button" className="tk-railbtn" aria-label="Auto frame — not available in the MVP" title="Not available in the MVP" disabled>
                    <FrameIcon />
                  </button>
                  <button type="button" className="tk-railbtn" aria-label="Crop — not available in the MVP" title="Not available in the MVP" disabled>
                    <CropIcon />
                  </button>
                  <button type="button" className="tk-railbtn" aria-label="Mask — not available in the MVP" title="Not available in the MVP" disabled>
                    <MaskIcon />
                  </button>
                </nav>
              ) : (
                <button
                  type="button"
                  className="tk-iconbtn"
                  aria-label="Open tools"
                  title="Open tools"
                  style={{
                    position: "absolute",
                    left: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    zIndex: 5,
                  }}
                  onClick={() => setToolRailOpen(true)}
                >
                  <ZoomMoveIcon />
                </button>
              )}

              <div style={{ width: "100%", maxWidth: 760 }}>
                <Preview project={displayProject} currentTime={currentTime} />
              </div>

              {/* Inline preview banner */}
              {isPreviewingEdit ? (
                <div
                  role="status"
                  style={{
                    position: "absolute",
                    left: "50%",
                    bottom: 14,
                    transform: "translateX(-50%)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 14px",
                    borderRadius: "var(--tk-radius-pill)",
                    background: "var(--tk-card)",
                    border: "1px solid var(--tk-accent-line)",
                    boxShadow: "var(--tk-shadow-md)",
                    fontSize: 12,
                    color: "var(--tk-text)",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: "var(--tk-accent)" }} />
                  Previewing proposed {isPreviewingAIEdit ? "AI" : "auto-zoom"} edit — accept or reject in the panel
                </div>
              ) : null}
            </div>
          </section>

          {/* Playback bar */}
          <section
            aria-label="Playback controls"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: "var(--tk-radius-md)",
              background: "var(--tk-raised)",
              border: "1px solid var(--tk-border)",
            }}
          >
            <button
              type="button"
              className="tk-iconbtn"
              aria-label="Previous clip"
              title="Previous clip"
              disabled={prevClip === undefined}
              onClick={() => prevClip !== undefined && setCurrentTime(prevClip)}
            >
              <PrevIcon />
            </button>
            <button
              type="button"
              className="tk-play"
              aria-label={isPlaying ? "Pause" : "Play"}
              title={isPlaying ? "Pause" : "Play"}
              onClick={() => {
                if (!isPlaying && project && currentTime >= project.duration) {
                  setCurrentTime(0);
                }
                setIsPlaying((prev) => !prev);
              }}
            >
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button
              type="button"
              className="tk-iconbtn"
              aria-label="Next clip"
              title="Next clip"
              disabled={nextClip === undefined}
              onClick={() => nextClip !== undefined && setCurrentTime(nextClip)}
            >
              <NextIcon />
            </button>

            <span className="tk-timecode" aria-label="Timecode">
              {formatTimecode(currentTime)} / {formatTimecode(project.duration)}
            </span>

            <span className="tk-vr" />

            <button type="button" className="tk-iconbtn" aria-label="Undo" title="Undo" disabled={!canUndo} onClick={handleUndo}>
              <UndoIcon />
            </button>
            <button type="button" className="tk-iconbtn" aria-label="Redo" title="Redo" disabled={!canRedo} onClick={handleRedo}>
              <RedoIcon />
            </button>
            <button
              type="button"
              className="tk-iconbtn"
              aria-label="Delete selection — not available in the MVP"
              title="Not available in the MVP"
              disabled
            >
              <TrashIcon />
            </button>

            <span
              style={{
                marginLeft: "auto",
                fontFamily: "var(--tk-mono)",
                fontSize: 11.5,
                color: "var(--tk-text-sec)",
              }}
            >
              {resolutionLabel(project.aspectRatio)} · {project.fps}fps
            </span>
          </section>

          {/* Timeline */}
          <section aria-label="Timeline" style={{ minHeight: 0 }}>
            <Timeline project={displayProject} currentTime={currentTime} selectedRange={selectedRange} onSeek={setCurrentTime} />
          </section>
        </div>

        {/* ── Right column: full-height tabbed panel ───────────────────────── */}
        <aside
          aria-label="Editor panel"
          style={{
            display: "grid",
            gridTemplateRows: "auto minmax(0, 1fr)",
            minHeight: 0,
            borderLeft: "1px solid var(--tk-border)",
            background: "var(--tk-card)",
          }}
        >
          <div role="tablist" aria-label="Editor panel tabs" style={{ display: "flex", gap: 4, padding: 8, borderBottom: "1px solid var(--tk-border)" }}>
            {PANEL_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-controls={`panel-${tab.id}`}
                aria-selected={activeTab === tab.id}
                className={`tk-tab${activeTab === tab.id ? " tk-tab-on" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ minHeight: 0, overflow: "auto" }}>
            {/* Chat tab — full-height AI assistant */}
            <div role="tabpanel" id="panel-chat" aria-labelledby="tab-chat" hidden={activeTab !== "chat"} style={{ height: "100%", minHeight: 0 }}>
              {activeTab === "chat" ? (
                <AIEditPanel
                  project={project}
                  selectedRange={selectedRange}
                  previewSource={previewSource}
                  onPreviewProjectChange={(previewProject) => {
                    setPreviewState(previewProject ? { source: "ai", project: previewProject } : undefined);
                  }}
                  onAccept={handleAcceptCommand}
                  onReject={() => setPreviewState(undefined)}
                />
              ) : null}
            </div>

            {/* Zoom tab — auto-zoom + manual zoom/clip controls */}
            <div role="tabpanel" id="panel-zoom" aria-labelledby="tab-zoom" hidden={activeTab !== "zoom"} style={{ display: activeTab === "zoom" ? "grid" : "none", gap: 12, padding: 14 }}>
              <EditorAutoZoomPanel
                project={project}
                previewSource={previewSource}
                onPreviewProjectChange={(previewProject) => {
                  setPreviewState(previewProject ? { source: "auto-zoom", project: previewProject } : undefined);
                }}
                onAccept={handleAcceptCommand}
              />
              <EditorManualControls project={project} selectedRange={selectedRange} onApply={handleManualApply} />
            </div>

            {/* Speed tab */}
            <div role="tabpanel" id="panel-speed" aria-labelledby="tab-speed" hidden={activeTab !== "speed"} style={{ display: activeTab === "speed" ? "block" : "none", padding: 14 }}>
              <PlaceholderPanel
                kind="Clip speed"
                lead="Per-clip speed ramps land in a later step."
                detail="Until then, trim a clip from the Zoom tab to change how long a moment plays."
              />
            </div>

            {/* Cursor tab */}
            <div role="tabpanel" id="panel-cursor" aria-labelledby="tab-cursor" hidden={activeTab !== "cursor"} style={{ display: activeTab === "cursor" ? "block" : "none", padding: 14 }}>
              <PlaceholderPanel
                kind="Cursor & clicks"
                lead="Cursor smoothing and click styling arrive in a later step."
                detail="Recorded cursor moves and clicks already drive the auto-zoom suggestions in the Zoom tab."
              />
            </div>

            {/* Frame tab */}
            <div role="tabpanel" id="panel-frame" aria-labelledby="tab-frame" hidden={activeTab !== "frame"} style={{ display: activeTab === "frame" ? "block" : "none", padding: 14 }}>
              <PlaceholderPanel
                kind="Frame & wallpaper"
                lead="Background and framing controls arrive in a later step."
                detail="The preview currently uses the deep-blue Porcelain stage shown to the left."
              />
            </div>
          </div>
        </aside>
      </div>

      {/*
        Save/Load and Export stay mounted (Export top-bar button routes here via the Zoom tab).
        Kept reachable + visually quiet in a collapsible footer; full placement is refined in PB-007/008.
      */}
      <details
        open={exportOpen}
        onToggle={(e) => setExportOpen((e.currentTarget as HTMLDetailsElement).open)}
        style={{
          borderTop: "1px solid var(--tk-border)",
          background: "var(--tk-app-bg)",
        }}
      >
        <summary
          style={{
            listStyle: "none",
            cursor: "pointer",
            padding: "10px 14px",
            fontSize: 11.5,
            fontWeight: 600,
            color: "var(--tk-text-sec)",
          }}
        >
          Project file · save, load &amp; export
        </summary>
        <div ref={exportPanelRef} style={{ display: "grid", gap: 12, padding: "0 14px 14px" }}>
          <ProjectSaveLoadControls project={project} onProjectLoaded={handleProjectLoaded} />
          <ProjectExportPanel project={displayProject} />
        </div>
      </details>
    </div>
  );
}

function PlaceholderPanel({ kind, lead, detail }: { kind: string; lead: string; detail: string }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--tk-text-ter)" }}>{kind}</p>
      <p style={{ margin: 0, fontSize: 13, color: "var(--tk-text)", lineHeight: 1.5 }}>{lead}</p>
      <p style={{ margin: 0, fontSize: 12.5, color: "var(--tk-text-sec)", lineHeight: 1.5 }}>{detail}</p>
    </div>
  );
}
