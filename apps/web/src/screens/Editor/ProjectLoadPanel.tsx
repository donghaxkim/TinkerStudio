import type { DemoProject } from "@tinker/project-schema";
import type { ProjectLoadResult } from "../../fixtures/loadSampleProject.js";

export type ProjectLoadPanelProps = {
  result: ProjectLoadResult;
};

export function ProjectLoadPanel({ result }: ProjectLoadPanelProps) {
  if (!result.ok) {
    return (
      <section
        aria-label="Project validation errors"
        style={{
          padding: 16,
          border: "1px solid var(--tk-border)",
          borderRadius: "var(--tk-radius-lg)",
          background: "var(--tk-card)",
          color: "var(--tk-text)",
        }}
      >
        <h2 style={{ margin: "0 0 6px", fontSize: 15 }}>This project could not be validated</h2>
        <p style={{ margin: "0 0 8px", color: "var(--tk-text-sec)", fontSize: 13 }}>{result.error.message}</p>
        <ul style={{ margin: 0, paddingLeft: 18, color: "var(--tk-text-sec)", fontSize: 12.5 }}>
          {result.error.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      </section>
    );
  }

  return <ProjectMetadata project={result.project} />;
}

export function ProjectMetadata({ project }: { project: DemoProject }) {
  const metadata = [
    ["Title", project.title],
    ["Duration", `${project.duration}s`],
    ["FPS", String(project.fps)],
    ["Aspect ratio", project.aspectRatio],
    ["Assets", String(project.assets.length)],
    ["Tracks", String(project.tracks.length)],
  ];

  return (
    <section
      aria-label="Project metadata"
      style={{
        padding: 16,
        border: "1px solid var(--tk-border)",
        borderRadius: "var(--tk-radius-lg)",
        background: "var(--tk-card)",
        color: "var(--tk-text)",
      }}
    >
      <h2 style={{ marginTop: 0, fontSize: 15 }}>Project details</h2>
      <dl style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, margin: 0 }}>
        {metadata.map(([label, value]) => (
          <div key={label} style={{ padding: 12, borderRadius: "var(--tk-radius-md)", background: "var(--tk-raised)" }}>
            <dt style={{ color: "var(--tk-text-sec)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</dt>
            <dd style={{ margin: "4px 0 0", fontWeight: 700 }}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
