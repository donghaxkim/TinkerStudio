import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from "react";
import { AIEditPanel } from "@tinker/ai-edit-ui";
import {
  Preview,
  Timeline,
  applyManualEditOperation,
  createEditorHistory,
  pushEditorCommand,
  redoEditorCommand,
  undoEditorCommand,
  type EditorCommand,
  type EditorHistory,
  type SelectedEntity,
  type SelectedRange,
} from "@tinker/editor";
import { safeParseDemoProject, type CursorSettings, type DemoProject } from "@tinker/project-schema";
import { loadSampleProject } from "../../fixtures/loadSampleProject.js";
import { useWebExportJob } from "../../lib/useWebExportJob.js";
import { CursorControls } from "./CursorControls.js";
import { EditorAutoZoomPanel, type PreviewSource } from "./EditorAutoZoomPanel.js";
import { EditorManualControls } from "./EditorManualControls.js";
import { ProjectLoadPanel } from "./ProjectLoadPanel.js";
import { ProjectExportPanel } from "./ProjectExportPanel.js";
import { ProjectSaveLoadControls } from "./ProjectSaveLoadControls.js";

// ─── local helpers ─────────────────────────────────────────────────────────────

/** Convert a string to a URL-safe slug (lowercase, non-alphanumeric → single hyphen). */
function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "demo-project";
}

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

// ─── panel-tab icons (15×15, currentColor) ─────────────────────────────────────

const TAB_ICON = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function ChatIcon() {
  return (
    <svg {...TAB_ICON} aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
    </svg>
  );
}

function MagnifierIcon() {
  return (
    <svg {...TAB_ICON} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  );
}

function SpeedIcon() {
  return (
    <svg {...TAB_ICON} aria-hidden="true">
      <path d="M12 20a8 8 0 1 1 8-8" />
      <path d="M12 12l4-3" />
    </svg>
  );
}

function CursorIcon() {
  return (
    <svg {...TAB_ICON} aria-hidden="true">
      <path d="M5 3l6.5 16 2.2-6.3L20 10.5z" />
    </svg>
  );
}

function FrameTabIcon() {
  return (
    <svg {...TAB_ICON} aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="9" y1="4" x2="9" y2="20" />
    </svg>
  );
}

// ─── persistence state ────────────────────────────────────────────────────────

/**
 * How the project arrived in the editor and whether it has unsaved local changes.
 * - origin: the last "clean" event that set the project
 * - dirty: true whenever the project has been mutated since that clean event
 */
export type PersistenceOrigin = "generated" | "sample" | "imported" | "saved" | "downloaded";

export type PersistenceState = {
  origin: PersistenceOrigin;
  dirty: boolean;
};

function persistenceLabel({ origin, dirty }: PersistenceState): string {
  if (dirty) return "Unsaved changes";
  switch (origin) {
    case "saved":
      return "Saved locally";
    case "downloaded":
      return "Downloaded";
    case "imported":
      return "Loaded from file";
    case "sample":
      return "Saved";
    case "generated":
    default:
      return "Generated";
  }
}

// ─── types ──────────────────────────────────────────────────────────────────

export type ProjectOrigin = "generated" | "sample";

type EditorScreenProps = {
  initialProject?: DemoProject;
  /** How the project was created — affects the initial persistence state label. */
  projectOrigin?: ProjectOrigin;
  onOpenSettings?: () => void;
  onExitToCreate?: () => void;
};

type PreviewState = {
  source: Exclude<PreviewSource, "none">;
  project: DemoProject;
};

type PanelTab = "chat" | "zoom" | "speed" | "cursor" | "frame";

const PANEL_TABS: Array<{ id: PanelTab; label: string; icon: ReactNode }> = [
  { id: "chat", label: "Chat", icon: <ChatIcon /> },
  { id: "zoom", label: "Zoom", icon: <MagnifierIcon /> },
  { id: "speed", label: "Speed", icon: <SpeedIcon /> },
  { id: "cursor", label: "Cursor", icon: <CursorIcon /> },
  { id: "frame", label: "Frame", icon: <FrameTabIcon /> },
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

export function EditorScreen({ initialProject, projectOrigin, onOpenSettings, onExitToCreate }: EditorScreenProps = {}) {
  const loadResult = useMemo(() => (initialProject ? { ok: true as const, project: initialProject } : loadSampleProject()), [initialProject]);
  const [project, setProject] = useState<DemoProject | undefined>(loadResult.ok ? loadResult.project : undefined);
  const [previewState, setPreviewState] = useState<PreviewState | undefined>();
  const [history, setHistory] = useState<EditorHistory>(() => createEditorHistory());
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedRange, setSelectedRange] = useState<SelectedRange>({ start: 12, end: 18 });
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | undefined>();
  const [activeTab, setActiveTab] = useState<PanelTab>("zoom");
  const [isPlaying, setIsPlaying] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const exportJob = useWebExportJob();

  // ── Persistence state ────────────────────────────────────────────────────
  // Derives the initial origin from the prop (generated vs sample).
  // Falls back to "generated" for backward-compatibility when prop is absent.
  const initialOrigin: PersistenceOrigin = projectOrigin ?? (initialProject ? "generated" : "sample");
  const [persistenceState, setPersistenceState] = useState<PersistenceState>({
    origin: initialOrigin,
    dirty: false,
  });

  // Refs for the rAF playback loop.
  const lastFrameTimeRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  // Ref so the rAF callback always reads the latest currentTime without stale closure.
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;
  // filesOverlayOpen combines both states: either the overlay is open for save/load or for export.
  const filesOverlayOpen = filesOpen || exportOpen;
  const closeFilesOverlay = useCallback(() => {
    setFilesOpen(false);
    setExportOpen(false);
  }, []);

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

  // Close the overlay when Escape is pressed.
  useEffect(() => {
    if (!filesOverlayOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeFilesOverlay();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [filesOverlayOpen, closeFilesOverlay]);

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
    setPersistenceState((ps) => ({ ...ps, dirty: true }));
  }

  function handleRedo() {
    const result = redoEditorCommand(history, project!);
    setHistory(result.history);
    setProject(result.project);
    setPreviewState(undefined);
    setPersistenceState((ps) => ({ ...ps, dirty: true }));
  }

  function handleProjectLoaded(loadedProject: DemoProject, origin: PersistenceOrigin) {
    setProject(loadedProject);
    setPreviewState(undefined);
    setHistory(createEditorHistory());
    setCurrentTime(0);
    setSelectedRange({ start: 0, end: Math.min(loadedProject.duration, 6) });
    setSelectedEntity(undefined);
    setPersistenceState({ origin, dirty: false });
  }

  function handleManualApply(updatedProject: DemoProject, command: EditorCommand) {
    setProject(updatedProject);
    setPreviewState(undefined);
    setHistory((current) => pushEditorCommand(current, command));
    setPersistenceState((ps) => ({ ...ps, dirty: true }));
  }

  // PB-006: apply a new `cursor` display-settings object as a single undoable command.
  // Mirrors the manual-edit flow (set project + push EditorCommand) so undo/redo works
  // and the preview reflects the change immediately. The result is validated through the
  // shared schema so the project stays a valid contract for export.
  function handleCursorSettingsApply(cursor: CursorSettings) {
    const beforeProject = project!;
    const candidate: DemoProject = {
      ...beforeProject,
      cursor,
      updatedAt: new Date().toISOString(),
    };
    const parsed = safeParseDemoProject(candidate);
    if (!parsed.success) return;

    const afterProject = parsed.data;
    const command: EditorCommand = {
      type: "manual-edit",
      id: `cursor_settings_${Date.now()}`,
      label: "Update cursor settings",
      beforeProject,
      afterProject,
    };

    setProject(afterProject);
    setPreviewState(undefined);
    setHistory((current) => pushEditorCommand(current, command));
    setPersistenceState((ps) => ({ ...ps, dirty: true }));
  }

  // Selecting a timeline item maps its row-item kind → an editor entity type and
  // syncs the selected range to the item's bounds (so range-driven UX still works).
  function handleSelectTimelineItem(item: { id: string; kind: string; start: number; end: number }) {
    const type: SelectedEntity["type"] = item.kind === "clip" ? "clip" : "zoom";
    setSelectedEntity({ type, id: item.id });
    setSelectedRange({ start: item.start, end: item.end });
  }

  // Delete is scoped to the currently-selected entity and only supports zooms in
  // the MVP. Every successful delete is pushed as an undoable manual-edit command.
  function handleDeleteSelection() {
    if (!project || selectedEntity?.type !== "zoom") return;

    const result = applyManualEditOperation(project, {
      type: "remove_entity",
      entityType: "zoom",
      id: selectedEntity.id,
    });
    if (!result.ok) return;

    setProject(result.project);
    setPreviewState(undefined);
    setHistory((current) => pushEditorCommand(current, result.command));
    setSelectedEntity(undefined);
    setPersistenceState((ps) => ({ ...ps, dirty: true }));
  }

  const canDeleteSelection = selectedEntity?.type === "zoom";
  const deleteSelectionLabel = canDeleteSelection
    ? "Delete selection"
    : selectedEntity?.type === "clip"
      ? "Delete selection — clip deletion is not available in the MVP"
      : "Delete selection — select a zoom to delete it";

  function handleAcceptCommand(updatedProject: DemoProject, command: EditorCommand) {
    setProject(updatedProject);
    setPreviewState(undefined);
    setHistory((current) => pushEditorCommand(current, command));
    setPersistenceState((ps) => ({ ...ps, dirty: true }));
  }

  return (
    <div
      className="tk-porcelain"
      style={{
        height: "100vh",
        maxHeight: "100vh",
        overflow: "hidden",
        display: "grid",
        gridTemplateRows: "52px minmax(0, 1fr)",
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
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.14px", color: "var(--tk-text)" }}>Tinker</span>
            <span style={{ fontSize: 14, fontWeight: 400, color: "var(--tk-text-sec)" }}>Studio</span>
          </button>
          <span className="tk-vr" />
          <span
            style={{
              fontFamily: "var(--tk-mono)",
              fontSize: 11.5,
              color: "var(--tk-text-sec)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {slugify(project.title)}.tinker
          </span>
          <span
            aria-label="Persistence status"
            style={{
              fontSize: 10.5,
              color: persistenceState.dirty ? "var(--tk-accent)" : "var(--tk-text-ter)",
              fontWeight: persistenceState.dirty ? 600 : 400,
            }}
          >
            {persistenceLabel(persistenceState)}
          </span>
        </div>

        {/* The h1 carries the project title for navigation/identity (visually flush in the bar). */}
        <h1 className="tk-sr-title" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", margin: -1, padding: 0, border: 0 }}>
          {project.title}
        </h1>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" className="tk-iconbtn" aria-label="Settings" title="Settings" onClick={onOpenSettings} disabled={!onOpenSettings}>
            <GearIcon />
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
            style={{
              height: 33,
              borderRadius: 7,
              background: "var(--tk-card)",
              border: "1px solid rgba(20,20,15,0.14)",
              fontSize: 13.3,
              fontWeight: 400,
              padding: "0 14px",
            }}
          >
            Preview
          </button>
          <button
            type="button"
            className="tk-btn tk-btn-accent"
            aria-label="Export"
            title="Open save, load &amp; export panel"
            onClick={() => setFilesOpen(true)}
            style={{
              height: 33,
              minWidth: 68,
              borderRadius: 7,
              fontSize: 13.3,
              fontWeight: 400,
              padding: "0 14px",
              justifyContent: "center",
            }}
          >
            Export
          </button>
        </div>
      </header>

      {/* ── Body: 78 / 22 split ─────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 284px", minHeight: 0 }}>
        {/* ── Left column ──────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateRows: "minmax(0, 1fr) auto auto", minHeight: 0, padding: 14, gap: 12 }}>
          {/* Preview stage */}
          <section aria-label="Preview stage" style={{ position: "relative", minHeight: 0 }}>
            <div
              style={{
                position: "relative",
                height: "100%",
                minHeight: 0,
                borderRadius: 18,
                background: "var(--tk-preview-bg)",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* Floating tool rail — 50×272, 6 icons (M16) */}
              <nav
                aria-label="Editor tools"
                style={{
                  position: "absolute",
                  left: 14,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 50,
                  height: 272,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "space-evenly",
                  padding: "8px 0",
                  borderRadius: 19,
                  background: "rgba(255,255,255,0.94)",
                  border: "1px solid rgba(0,0,0,0.08)",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.26)",
                  zIndex: 5,
                }}
              >
                <button
                  type="button"
                  className="tk-railbtn tk-railbtn-active"
                  aria-label="Cursor tool"
                  title="Cursor"
                  aria-pressed={true}
                >
                  <CursorIcon />
                </button>
                <button type="button" className="tk-railbtn" aria-label="Split clip — not available in the MVP" title="Not available in the MVP" disabled>
                  <SplitIcon />
                </button>
                <button
                  type="button"
                  className={`tk-railbtn${activeTab === "zoom" ? " tk-railbtn-active" : ""}`}
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
                <button
                  type="button"
                  className="tk-railbtn tk-railbtn-active"
                  aria-label="Crop tool"
                  title="Crop"
                  aria-pressed={true}
                >
                  <CropIcon />
                </button>
                <button type="button" className="tk-railbtn" aria-label="Mask — not available in the MVP" title="Not available in the MVP" disabled>
                  <MaskIcon />
                </button>
              </nav>

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
              aria-label={deleteSelectionLabel}
              title={canDeleteSelection ? "Delete the selected zoom" : "Select a zoom to delete it"}
              disabled={!canDeleteSelection}
              onClick={handleDeleteSelection}
            >
              <TrashIcon />
            </button>

            <span
              style={{
                marginLeft: "auto",
                fontFamily: "var(--tk-mono)",
                fontSize: 11,
                color: "var(--tk-text-ter)",
              }}
            >
              {resolutionLabel(project.aspectRatio)} · {project.fps}fps
            </span>
          </section>

          {/* Timeline */}
          <section aria-label="Timeline" style={{ minHeight: 0 }}>
            <Timeline
              project={displayProject}
              currentTime={currentTime}
              selectedRange={selectedRange}
              selectedEntity={selectedEntity}
              onSeek={setCurrentTime}
              onSelectItem={handleSelectTimelineItem}
            />
          </section>
        </div>

        {/* ── Right column: full-height tabbed panel ───────────────────────── */}
        <aside
          aria-label="Editor panel"
          style={{
            display: "grid",
            gridTemplateRows: "auto minmax(0, 1fr)",
            minHeight: 0,
            background: "var(--tk-panel-bg)",
          }}
        >
          <div role="tablist" aria-label="Editor panel tabs" style={{ display: "flex", gap: 6, padding: 10 }}>
            {PANEL_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-label={tab.label}
                aria-controls={`panel-${tab.id}`}
                aria-selected={activeTab === tab.id}
                className={`tk-tab-icon${activeTab === tab.id ? " tk-tab-icon-on" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
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
              <EditorManualControls
                project={project}
                selectedRange={selectedRange}
                selectedEntity={selectedEntity}
                onSelectEntity={setSelectedEntity}
                onApply={handleManualApply}
              />
            </div>

            {/* Speed tab */}
            <div role="tabpanel" id="panel-speed" aria-labelledby="tab-speed" hidden={activeTab !== "speed"} style={{ display: activeTab === "speed" ? "block" : "none", padding: 14 }}>
              <PlaceholderPanel
                kind="Clip speed"
                lead="Per-clip speed ramps land in a later step."
                detail="Until then, trim a clip from the Zoom tab to change how long a moment plays."
              />
            </div>

            {/* Cursor tab — PB-006 cursor/click display controls */}
            <div role="tabpanel" id="panel-cursor" aria-labelledby="tab-cursor" hidden={activeTab !== "cursor"} style={{ display: activeTab === "cursor" ? "block" : "none", padding: 14 }}>
              <CursorControls project={project} onApply={handleCursorSettingsApply} />
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

      {/* ── Project file overlay (save/load + export) — position:fixed, does NOT reflow the grid ── */}
      {filesOverlayOpen ? (
        <>
          {/* Backdrop */}
          <div
            aria-hidden="true"
            onClick={closeFilesOverlay}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 50,
              background: "rgba(20,20,15,0.32)",
            }}
          />
          {/* Bottom-sheet dialog */}
          <div
            role="dialog"
            aria-label="Project file — save, load &amp; export"
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 51,
              background: "var(--tk-card)",
              borderTop: "1px solid var(--tk-border)",
              borderRadius: "var(--tk-radius-xl) var(--tk-radius-xl) 0 0",
              boxShadow: "var(--tk-shadow-overlay, 0 -4px 32px rgba(0,0,0,0.18))",
              maxHeight: "70vh",
              display: "grid",
              gridTemplateRows: "auto minmax(0, 1fr)",
            }}
          >
            {/* Sheet header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px 12px",
                borderBottom: "1px solid var(--tk-border)",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--tk-text-sec)" }}>
                Project file · save, load &amp; export
              </span>
              <button
                type="button"
                className="tk-iconbtn"
                aria-label="Close project file panel"
                title="Close"
                onClick={closeFilesOverlay}
              >
                <CloseIcon />
              </button>
            </div>
            {/* Sheet body — scrollable */}
            <div style={{ overflow: "auto", display: "grid", gap: 12, padding: "14px 16px 24px" }}>
              <ProjectSaveLoadControls
                project={project}
                dirty={persistenceState.dirty}
                onProjectLoaded={(loadedProject, origin) => handleProjectLoaded(loadedProject, origin)}
                onSaved={() => setPersistenceState({ origin: "saved", dirty: false })}
                onDownloaded={() => setPersistenceState({ origin: "downloaded", dirty: false })}
              />
              <ProjectExportPanel
                project={displayProject}
                exportJobState={exportJob.state}
                onStartExport={() => exportJob.start(project)}
                isExportRunning={exportJob.isRunning}
              />
            </div>
          </div>
        </>
      ) : null}
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
