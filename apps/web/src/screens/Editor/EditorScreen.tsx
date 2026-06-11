import { useMemo, useState } from "react";
import { AIEditPanel } from "@tinker/ai-edit-ui";
import {
  Preview,
  Timeline,
  createEditorHistory,
  pushEditorCommand,
  redoEditorCommand,
  undoEditorCommand,
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

function formatRange(range: SelectedRange | undefined) {
  if (!range) return "No range selected";
  return `${range.start.toFixed(1)}s – ${range.end.toFixed(1)}s`;
}

type EditorScreenProps = {
  initialProject?: DemoProject;
};

type PreviewState = {
  source: Exclude<PreviewSource, "none">;
  project: DemoProject;
};

export function EditorScreen({ initialProject }: EditorScreenProps = {}) {
  const loadResult = useMemo(() => (initialProject ? { ok: true as const, project: initialProject } : loadSampleProject()), [initialProject]);
  const [project, setProject] = useState<DemoProject | undefined>(loadResult.ok ? loadResult.project : undefined);
  const [previewState, setPreviewState] = useState<PreviewState | undefined>();
  const [history, setHistory] = useState<EditorHistory>(() => createEditorHistory());
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedRange, setSelectedRange] = useState<SelectedRange>({ start: 12, end: 18 });

  if (!loadResult.ok) {
    return (
      <main style={{ padding: 24 }}>
        <ProjectLoadPanel result={loadResult} />
      </main>
    );
  }

  if (!project) {
    return (
      <main style={{ padding: 24 }}>
        <p>Project failed to initialize.</p>
      </main>
    );
  }

  const displayProject = previewState?.project ?? project;
  const previewSource = previewState?.source ?? "none";
  const isPreviewingAIEdit = previewState?.source === "ai";

  return (
    <main style={{ display: "grid", gap: 20, padding: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p style={{ margin: 0, color: "#60a5fa", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Tinker editor shell</p>
          <h1 style={{ margin: "6px 0 0", fontSize: 36 }}>{project.title}</h1>
          {isPreviewingAIEdit ? <p style={{ margin: "6px 0 0", color: "#fbbf24" }}>Previewing proposed AI operations. Accept or reject in the AI panel.</p> : null}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button type="button" onClick={() => setCurrentTime(3)} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #334155", background: "#111827", color: "white" }}>
            Jump to intro (3s)
          </button>
          <button type="button" onClick={() => setCurrentTime(14)} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #334155", background: "#111827", color: "white" }}>
            Jump to zoom (14s)
          </button>
          <button
            type="button"
            disabled={history.past.length === 0}
            onClick={() => {
              const result = undoEditorCommand(history, project);
              setHistory(result.history);
              setProject(result.project);
              setPreviewState(undefined);
            }}
            style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #334155", background: history.past.length ? "#111827" : "#334155", color: "white" }}
          >
            Undo
          </button>
          <button
            type="button"
            disabled={history.future.length === 0}
            onClick={() => {
              const result = redoEditorCommand(history, project);
              setHistory(result.history);
              setProject(result.project);
              setPreviewState(undefined);
            }}
            style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #334155", background: history.future.length ? "#111827" : "#334155", color: "white" }}
          >
            Redo
          </button>
        </div>
      </header>

      <ProjectLoadPanel result={{ ok: true, project }} />
      <ProjectSaveLoadControls
        project={project}
        onProjectLoaded={(loadedProject) => {
          setProject(loadedProject);
          setPreviewState(undefined);
          setHistory(createEditorHistory());
          setCurrentTime(0);
          setSelectedRange({ start: 0, end: Math.min(loadedProject.duration, 6) });
        }}
      />
      <ProjectExportPanel project={displayProject} />

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 22rem", gap: 20, alignItems: "start" }}>
        <Preview project={displayProject} currentTime={currentTime} />
        <aside aria-label="Selection details" style={{ display: "grid", gap: 12, padding: 16, border: "1px solid #334155", borderRadius: 12, background: "#0f172a" }}>
          <h2 style={{ margin: 0 }}>Editor state</h2>
          <div>
            <div style={{ color: "#94a3b8", fontSize: 12, textTransform: "uppercase" }}>Current time</div>
            <strong>{currentTime.toFixed(1)}s</strong>
          </div>
          <div>
            <div style={{ color: "#94a3b8", fontSize: 12, textTransform: "uppercase" }}>Selected range</div>
            <strong>{formatRange(selectedRange)}</strong>
          </div>
          <div>
            <div style={{ color: "#94a3b8", fontSize: 12, textTransform: "uppercase" }}>AI history</div>
            <strong>{project.aiEditHistory.filter((edit) => edit.status === "accepted").length} accepted edits</strong>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setSelectedRange({ start: 2, end: 5 })} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #334155", background: "#111827", color: "white" }}>
              Select intro
            </button>
            <button type="button" onClick={() => setSelectedRange({ start: 12, end: 18 })} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #334155", background: "#111827", color: "white" }}>
              Select analytics
            </button>
          </div>
          <p style={{ margin: 0, color: "#94a3b8" }}>Click the timeline ruler or clips to seek. The highlighted timeline band is the current selected range.</p>
        </aside>
      </section>

      <EditorManualControls
        project={project}
        selectedRange={selectedRange}
        onApply={(updatedProject, command) => {
          setProject(updatedProject);
          setPreviewState(undefined);
          setHistory((currentHistory) => pushEditorCommand(currentHistory, command));
        }}
      />
      <EditorAutoZoomPanel
        project={project}
        previewSource={previewSource}
        onPreviewProjectChange={(previewProject) => {
          setPreviewState(previewProject ? { source: "auto-zoom", project: previewProject } : undefined);
        }}
        onAccept={(updatedProject, command) => {
          setProject(updatedProject);
          setPreviewState(undefined);
          setHistory((currentHistory) => pushEditorCommand(currentHistory, command));
        }}
      />

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 22rem", gap: 20, alignItems: "start" }}>
        <Timeline project={displayProject} currentTime={currentTime} selectedRange={selectedRange} onSeek={setCurrentTime} />
        <AIEditPanel
          project={project}
          selectedRange={selectedRange}
          previewSource={previewSource}
          onPreviewProjectChange={(previewProject) => {
            setPreviewState(previewProject ? { source: "ai", project: previewProject } : undefined);
          }}
          onAccept={(updatedProject, command) => {
            setProject(updatedProject);
            setPreviewState(undefined);
            setHistory((currentHistory) => pushEditorCommand(currentHistory, command));
          }}
          onReject={() => setPreviewState(undefined)}
        />
      </section>
    </main>
  );
}
