import type { DemoProject } from "@tinker/project-schema";
import type { GenerationClient } from "../../lib/generationClient.js";
import { CreateDemoForm } from "./CreateDemoForm.js";
import { GenerationErrorView } from "./GenerationErrorView.js";
import { GenerationProgressPanel } from "./GenerationProgressPanel.js";
import { useCreateDemoJob } from "./useCreateDemoJob.js";

type CreateDemoScreenProps = {
  generationClient: GenerationClient;
  onProjectGenerated: (project: DemoProject) => void;
};

export function CreateDemoScreen({ generationClient, onProjectGenerated }: CreateDemoScreenProps) {
  const { state, submit } = useCreateDemoJob({ generationClient, onProjectGenerated });
  const isSubmitting = state.status === "submitting";

  return (
    <section aria-label="Create demo" style={{ display: "grid", gap: 18, padding: 20, border: "1px solid #1d4ed8", borderRadius: 16, background: "#08111f" }}>
      <header>
        <p style={{ margin: 0, color: "#60a5fa", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Create Demo</p>
        <h1 style={{ margin: "6px 0 0", fontSize: 32 }}>Generate an editable demo project</h1>
        <p style={{ margin: "8px 0 0", color: "#94a3b8" }}>
          Submit through the shared generation contract. No Person A internals are imported here.
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 22rem", gap: 18, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 12 }}>
          <CreateDemoForm disabled={isSubmitting} onSubmit={submit} />
          {state.status === "succeeded" ? <p style={{ margin: 0, color: "#bbf7d0" }}>Generation succeeded. Opening editor…</p> : null}
          {state.error ? <GenerationErrorView message={state.error} /> : null}
        </div>
        <GenerationProgressPanel events={state.progressEvents} />
      </div>
    </section>
  );
}
