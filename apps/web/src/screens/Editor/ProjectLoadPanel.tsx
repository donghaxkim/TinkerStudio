import type { DemoProject } from "@tinker/project-schema";
import type { ProjectLoadResult } from "../../fixtures/loadSampleProject.js";

export type ProjectLoadPanelProps = {
  result: ProjectLoadResult;
};

export function ProjectLoadPanel({ result }: ProjectLoadPanelProps) {
  if (!result.ok) {
    return (
      <section aria-label="Project validation errors" style={{ padding: 16, border: "1px solid #7f1d1d", borderRadius: 12, background: "#450a0a" }}>
        <h2>Invalid DemoProject</h2>
        <p>{result.error.message}</p>
        <ul>
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
    <section aria-label="Project metadata" style={{ padding: 16, border: "1px solid #334155", borderRadius: 12, background: "#0f172a" }}>
      <h2 style={{ marginTop: 0 }}>DemoProject loaded</h2>
      <dl style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, margin: 0 }}>
        {metadata.map(([label, value]) => (
          <div key={label} style={{ padding: 12, borderRadius: 10, background: "#111827" }}>
            <dt style={{ color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</dt>
            <dd style={{ margin: "4px 0 0", fontWeight: 800 }}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
