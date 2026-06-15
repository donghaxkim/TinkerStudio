import { useState, type CSSProperties, type FormEvent } from "react";
import type { ApiGenerationJob } from "@tinker/generation-contract";
import type { TimelineRegistryWindow } from "@tinker/editor";
import type { CompositionEditClient } from "../../lib/compositionEditClient.js";
import type { CompositionGenerationClient } from "../../lib/compositionGenerationClient.js";
import { selectArtifactUrl } from "../../lib/compositionGenerationClient.js";
import { useCompositionGenerationJob } from "../../lib/useCompositionGenerationJob.js";
import { CompositionEditorScreen } from "./CompositionEditorScreen.js";

export type CompositionDemoScreenProps = {
  client: CompositionGenerationClient;
  editClient?: CompositionEditClient;
  /** Optional: render a Back button that calls this. */
  onBack?: () => void;
  /** Test seam forwarded to CompositionEditorScreen. */
  resolveWindow?: (iframe: HTMLIFrameElement) => TimelineRegistryWindow | null | undefined;
  initialCompletedJob?: ApiGenerationJob;
};

const pageStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 12, height: "100%", minHeight: 0, padding: 24 };
const fieldStyle: CSSProperties = { display: "grid", gap: 4 };

export function CompositionDemoScreen({ client, editClient, onBack, resolveWindow, initialCompletedJob }: CompositionDemoScreenProps) {
  const job = useCompositionGenerationJob(client);
  const [repoUrl, setRepoUrl] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [prompt, setPrompt] = useState("");

  const backButton = onBack ? (
    <button type="button" className="tk-btn" onClick={onBack} style={{ alignSelf: "flex-start" }}>
      Back
    </button>
  ) : null;

  const completedJob = initialCompletedJob ?? (job.phase === "completed" ? job.job : undefined);

  if (completedJob) {
    const compositionIndexUrl = selectArtifactUrl(completedJob, "composition-index");
    if (compositionIndexUrl) {
      // Full-bleed: the editor carries its own porcelain app bar (with a Back
      // affordance), so it is not wrapped in the request-form page chrome.
      return (
        <CompositionEditorScreen
          compositionIndexUrl={compositionIndexUrl}
          outputVideoUrl={selectArtifactUrl(completedJob, "output-video")}
          jobId={completedJob.id}
          {...(editClient ? { editClient } : {})}
          onBack={onBack}
          resolveWindow={resolveWindow}
        />
      );
    }
    return (
      <div className="tk-porcelain" style={pageStyle} role="alert">
        Generation completed but produced no composition to open.
      </div>
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void job.start({
      mode: "ai-url-planning",
      repoUrl,
      productUrl,
      durationCapSeconds: 60,
      aspectRatio: "16:9",
      ...(prompt.trim() === "" ? {} : { prompt }),
    });
  }

  return (
    <div className="tk-porcelain" style={pageStyle}>
      {backButton}
      <div aria-live="polite" aria-atomic="true">
        {job.phase === "running" ? "Generating composition…" : ""}
      </div>
      {job.phase === "running" ? (
        <div data-testid="composition-generating">
          <button type="button" className="tk-btn" onClick={() => job.cancel()}>
            Cancel
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, maxWidth: 460 }}>
          <label style={fieldStyle}>
            Repo URL
            <input className="tk-input" value={repoUrl} onChange={(e) => setRepoUrl(e.currentTarget.value)} />
          </label>
          <label style={fieldStyle}>
            Product URL
            <input className="tk-input" value={productUrl} onChange={(e) => setProductUrl(e.currentTarget.value)} />
          </label>
          <label style={fieldStyle}>
            Prompt
            <input className="tk-input" value={prompt} onChange={(e) => setPrompt(e.currentTarget.value)} />
          </label>
          <button type="submit" className="tk-btn tk-btn-accent">
            Generate
          </button>
        </form>
      )}
      {job.phase === "failed" ? (
        <div role="alert" style={{ color: "var(--tk-danger, #C0392B)" }}>
          {job.error ?? "Generation failed."}
        </div>
      ) : null}
    </div>
  );
}
