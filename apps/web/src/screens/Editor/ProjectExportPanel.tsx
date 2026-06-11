import { prepareMp4Export } from "@tinker/editor";
import type { DemoProject } from "@tinker/project-schema";
import type { ExportJobState } from "@tinker/rendering/node";

type ProjectExportPanelProps = {
  project: DemoProject;
  exportJobState?: ExportJobState;
};

const wrappingValueStyle = { minWidth: 0, overflowWrap: "anywhere" } as const;
const wrappingCodeStyle = { ...wrappingValueStyle, display: "block" } as const;

export function ProjectExportPanel({ project, exportJobState }: ProjectExportPanelProps) {
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
        <dd style={{ ...wrappingValueStyle, margin: 0, fontWeight: 700 }}>{plan.output.fileName}</dd>
        <dt style={{ color: "#94a3b8" }}>Type</dt>
        <dd style={{ ...wrappingValueStyle, margin: 0 }}>{plan.output.mimeType}</dd>
        <dt style={{ color: "#94a3b8" }}>Size</dt>
        <dd style={{ ...wrappingValueStyle, margin: 0 }}>{plan.output.width} × {plan.output.height}</dd>
        <dt style={{ color: "#94a3b8" }}>Timeline</dt>
        <dd style={{ ...wrappingValueStyle, margin: 0 }}>{plan.timeline.duration}s at {plan.timeline.fps}fps</dd>
        <dt style={{ color: "#94a3b8" }}>Composition</dt>
        <dd style={{ ...wrappingValueStyle, margin: 0 }}>{plan.layers.length} render layers from DemoProject</dd>
      </dl>
      <p style={{ margin: 0, color: "#94a3b8" }}>
        Export v0 renders this project to MP4 through the local `@tinker/rendering` ffmpeg renderer. The browser panel only previews the artifact plan; it does not export JSON or mutate source video files.
      </p>
      {exportJobState ? <ExportJobStatus state={exportJobState} /> : null}
    </section>
  );
}

function ExportJobStatus({ state }: { state: ExportJobState }) {
  const percent = Math.round(state.progress * 100);
  const phase = formatPhase(state.phase);
  const errorPhase = state.error ? formatPhase(state.error.phase) : undefined;

  return (
    <div
      aria-label="Export job status"
      aria-live="polite"
      role="status"
      style={{ display: "grid", gap: 6, padding: 12, border: "1px solid #334155", borderRadius: 8, background: "#111827" }}
    >
      <strong>{phase}</strong>
      <span aria-label="Export progress" aria-valuemax={100} aria-valuemin={0} aria-valuenow={percent} role="progressbar">{percent}%</span>
      {state.outputPath ? <code style={wrappingCodeStyle}>{state.outputPath}</code> : null}
      {state.error ? (
        <p role="alert" style={{ margin: 0, color: "#fecaca" }}>
          {errorPhase} failed: {redactLocalPaths(state.error.message)}
        </p>
      ) : null}
      {state.error?.command ? <code style={wrappingCodeStyle}>{state.error.command.command}</code> : null}
    </div>
  );
}

function formatPhase(phase: string) {
  return phase
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function redactLocalPaths(message: string) {
  const redactedPath = "[local path]";

  return redactPosixLocalPaths(message.replace(/file:\/\/\/(?:[^\s'"<>)\],:;!?]+\/)+[^\s'"<>)\],:;!?]+(?=$|[\s'")\],:;!?])/g, redactedPath), redactedPath)
    .replace(/[A-Za-z]:\\(?:[^\\\r\n'"]+\\)+[^\\\r\n'"]+\.[A-Za-z0-9]{1,12}(?=$|[\s'"),:;!?])/g, redactedPath);
}

function redactPosixLocalPaths(message: string, redactedPath: string) {
  let redacted = "";
  let index = 0;

  while (index < message.length) {
    if (message[index] === "/" && isPosixPathStart(message, index) && hasNestedPosixSegment(message, index)) {
      const end = findPosixPathEnd(message, index);
      redacted += redactedPath;
      index = end;
      continue;
    }

    redacted += message[index];
    index += 1;
  }

  return redacted;
}

function isPosixPathStart(message: string, index: number) {
  if (index === 0) {
    return true;
  }

  return /[\s'"([]/.test(message[index - 1]);
}

function hasNestedPosixSegment(message: string, index: number) {
  const nextSlash = message.indexOf("/", index + 1);
  return nextSlash > index + 1;
}

function findPosixPathEnd(message: string, start: number) {
  const englishSeparators = [" before export", " failed", " but ", " was ", " is ", " does ", " could ", " cannot "];
  let index = start;

  while (index < message.length) {
    const remainder = message.slice(index);

    if (index > start && englishSeparators.some((separator) => remainder.startsWith(separator))) {
      break;
    }

    const character = message[index];
    const nextCharacter = message[index + 1];

    if (/[\r\n'"<>,;!?\]}]/.test(character)) {
      break;
    }

    if (character === ")" && (nextCharacter === undefined || /[\s,;:!?]/.test(nextCharacter))) {
      break;
    }

    index += 1;
  }

  return index;
}
