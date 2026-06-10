import { GENERATION_PHASE_LABELS, type GenerationPhase, type GenerationProgressEvent } from "@tinker/generation-contract";

const phaseOrder = Object.keys(GENERATION_PHASE_LABELS) as GenerationPhase[];

type GenerationProgressPanelProps = {
  events: GenerationProgressEvent[];
};

export function GenerationProgressPanel({ events }: GenerationProgressPanelProps) {
  const assistedEvents = events.filter(
    (event): event is Extract<GenerationProgressEvent, { phase: GenerationPhase }> => "phase" in event,
  );
  const completed = new Set(assistedEvents.map((event) => event.phase));

  return (
    <section aria-label="Generation progress" style={{ display: "grid", gap: 10, padding: 16, border: "1px solid #334155", borderRadius: 12, background: "#0f172a" }}>
      <h3 style={{ margin: 0 }}>Progress</h3>
      <ol style={{ display: "grid", gap: 8, listStyle: "none", padding: 0, margin: 0 }}>
        {phaseOrder.map((phase) => {
          const event = assistedEvents.find((candidate) => candidate.phase === phase);
          return (
            <li key={phase} style={{ display: "grid", gap: 2, color: completed.has(phase) ? "#bfdbfe" : "#64748b" }}>
              <strong>{GENERATION_PHASE_LABELS[phase]}</strong>
              <span>{event?.message ?? "Waiting"}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
