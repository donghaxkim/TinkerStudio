import { useMemo, useState } from "react";
import { Preview, Timeline, type SelectedRange } from "@tinker/editor";
import { loadSampleProject } from "../../fixtures/loadSampleProject.js";
import { ProjectLoadPanel } from "./ProjectLoadPanel.js";

function formatRange(range: SelectedRange | undefined) {
  if (!range) return "No range selected";
  return `${range.start.toFixed(1)}s – ${range.end.toFixed(1)}s`;
}

export function EditorScreen() {
  const loadResult = useMemo(() => loadSampleProject(), []);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedRange, setSelectedRange] = useState<SelectedRange>({ start: 12, end: 18 });

  if (!loadResult.ok) {
    return (
      <main style={{ padding: 24 }}>
        <ProjectLoadPanel result={loadResult} />
      </main>
    );
  }

  const project = loadResult.project;

  return (
    <main style={{ display: "grid", gap: 20, padding: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p style={{ margin: 0, color: "#60a5fa", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Tinker editor shell</p>
          <h1 style={{ margin: "6px 0 0", fontSize: 36 }}>{project.title}</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => setCurrentTime(3)} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #334155", background: "#111827", color: "white" }}>
            Jump to caption (3s)
          </button>
          <button type="button" onClick={() => setCurrentTime(14)} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #334155", background: "#111827", color: "white" }}>
            Jump to zoom/callout (14s)
          </button>
        </div>
      </header>

      <ProjectLoadPanel result={loadResult} />

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 22rem", gap: 20, alignItems: "start" }}>
        <Preview project={project} currentTime={currentTime} />
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setSelectedRange({ start: 2, end: 5 })} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #334155", background: "#111827", color: "white" }}>
              Select caption
            </button>
            <button type="button" onClick={() => setSelectedRange({ start: 12, end: 18 })} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #334155", background: "#111827", color: "white" }}>
              Select analytics
            </button>
          </div>
          <p style={{ margin: 0, color: "#94a3b8" }}>Click the timeline ruler or clips to seek. The highlighted timeline band is the current selected range.</p>
        </aside>
      </section>

      <Timeline project={project} currentTime={currentTime} selectedRange={selectedRange} onSeek={setCurrentTime} />
    </main>
  );
}
