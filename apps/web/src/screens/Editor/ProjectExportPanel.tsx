import { prepareMp4Export } from "@tinker/editor";
import type { DemoProject } from "@tinker/project-schema";

type ProjectExportPanelProps = {
  project: DemoProject;
};

export function ProjectExportPanel({ project }: ProjectExportPanelProps) {
  const exportResult = prepareMp4Export(project);

  if (!exportResult.ok) {
    return (
      <section aria-label="Export" style={{ display: "grid", gap: 10, padding: 16, border: "1px solid #7f1d1d", borderRadius: 12, background: "#1f0f12" }}>
        <h2 style={{ margin: 0 }}>Export</h2>
        <p role="alert" style={{ margin: 0, color: "#fecaca" }}>{exportResult.error}</p>
      </section>
    );
  }

  const { plan } = exportResult;

  return (
    <section aria-label="Export" style={{ display: "grid", gap: 12, padding: 16, border: "1px solid #334155", borderRadius: 12, background: "#0f172a" }}>
      <div>
        <p style={{ margin: 0, color: "#60a5fa", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>MP4 artifact</p>
        <h2 style={{ margin: "4px 0 0" }}>Export</h2>
      </div>
      <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "8px 12px", margin: 0 }}>
        <dt style={{ color: "#94a3b8" }}>File</dt>
        <dd style={{ margin: 0, fontWeight: 700 }}>{plan.output.fileName}</dd>
        <dt style={{ color: "#94a3b8" }}>Type</dt>
        <dd style={{ margin: 0 }}>{plan.output.mimeType}</dd>
        <dt style={{ color: "#94a3b8" }}>Size</dt>
        <dd style={{ margin: 0 }}>{plan.output.width} × {plan.output.height}</dd>
        <dt style={{ color: "#94a3b8" }}>Timeline</dt>
        <dd style={{ margin: 0 }}>{plan.timeline.duration}s at {plan.timeline.fps}fps</dd>
        <dt style={{ color: "#94a3b8" }}>Composition</dt>
        <dd style={{ margin: 0 }}>{plan.layers.length} render layers from DemoProject</dd>
      </dl>
      <p style={{ margin: 0, color: "#94a3b8" }}>
        Export v0 renders this project to MP4 through the local `@tinker/rendering` ffmpeg renderer. The browser panel only previews the artifact plan; it does not export JSON or mutate source video files.
      </p>
    </section>
  );
}
