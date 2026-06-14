import { useState, type CSSProperties, type FormEvent } from "react";
import type { TimelineRegistryWindow } from "@tinker/editor";
import type { CompositionGenerationClient } from "../../lib/compositionGenerationClient.js";
import { selectArtifactUrl } from "../../lib/compositionGenerationClient.js";
import { useCompositionGenerationJob } from "../../lib/useCompositionGenerationJob.js";
import { CompositionEditorScreen } from "./CompositionEditorScreen.js";

export type CompositionDemoScreenProps = {
  client: CompositionGenerationClient;
  /** Test seam forwarded to CompositionEditorScreen. */
  resolveWindow?: (iframe: HTMLIFrameElement) => TimelineRegistryWindow | null | undefined;
};

const pageStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 12, height: "100%", minHeight: 0, padding: 24 };
const fieldStyle: CSSProperties = { display: "grid", gap: 4 };

export function CompositionDemoScreen({ client, resolveWindow }: CompositionDemoScreenProps) {
  const job = useCompositionGenerationJob(client);
  const [repoUrl, setRepoUrl] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [prompt, setPrompt] = useState("");

  if (job.phase === "completed" && job.job) {
    const compositionIndexUrl = selectArtifactUrl(job.job, "composition-index");
    if (compositionIndexUrl) {
      return (
        <CompositionEditorScreen
          compositionIndexUrl={compositionIndexUrl}
          outputVideoUrl={selectArtifactUrl(job.job, "output-video")}
          resolveWindow={resolveWindow}
        />
      );
    }
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
      {job.phase === "running" ? (
        <div data-testid="composition-generating" aria-live="polite">
          Generating composition…{" "}
          <button type="button" className="tk-btn" onClick={job.cancel}>
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
          {job.error}
        </div>
      ) : null}
    </div>
  );
}
