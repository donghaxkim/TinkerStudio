import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiGenerationJob, DemoOutline } from "@tinker/generation-contract";
import type { TimelineRegistryWindow } from "@tinker/editor";
import type { CompositionEditClient } from "../../lib/compositionEditClient.js";
import type { CompositionGenerationClient } from "../../lib/compositionGenerationClient.js";
import type { CompositionPlanningClient, CompositionPlanningSession } from "../../lib/compositionPlanningClient.js";
import { useCompositionGenerationJob } from "../../lib/useCompositionGenerationJob.js";
import { CompositionEditorScreen } from "./CompositionEditorScreen.js";

const PREVIEW_COMPOSITION_URL = "/demo-composition/index.html";

export type CompositionDemoScreenProps = {
  client: CompositionGenerationClient;
  planningClient: CompositionPlanningClient;
  editClient?: CompositionEditClient;
  /** Optional: render a Back button that calls this. */
  onBack?: () => void;
  /** Test seam forwarded to CompositionEditorScreen. */
  resolveWindow?: (iframe: HTMLIFrameElement) => TimelineRegistryWindow | null | undefined;
  initialCompletedJob?: ApiGenerationJob;
};

function parseGithubRepo(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;

  let path = trimmed;
  if (/^https?:\/\//i.test(trimmed) || /^(www\.)?github\.com\//i.test(trimmed)) {
    try {
      const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
      if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return undefined;
      path = url.pathname;
    } catch {
      return undefined;
    }
  }

  const [owner, repoWithGit] = path.replace(/^\/+/, "").split("/").filter(Boolean);
  const repo = repoWithGit?.replace(/\.git$/, "");
  return owner && repo && /^[\w.-]+$/.test(owner) && /^[\w.-]+$/.test(repo) ? `${owner}/${repo}` : undefined;
}

function normalizePublicUrl(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;

  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    if (url.pathname === "/" && url.search === "" && url.hash === "") return url.origin;
    return url.toString();
  } catch {
    return undefined;
  }
}

function outlinePrompt(outline: DemoOutline): string {
  return `Use this approved video outline as the product demo brief:\n\n${JSON.stringify(outline, null, 2)}`;
}

function OutlineView({ outline }: { outline: DemoOutline }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 22, letterSpacing: "-0.02em" }}>{outline.title}</h2>
        <p style={{ margin: "8px 0 0", color: "var(--tk-text-sec)", lineHeight: 1.5 }}>{outline.summary}</p>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12, color: "var(--tk-text-sec)" }}>
        <span>{outline.durationCapSeconds}s cap</span>
        <span>{outline.aspectRatio}</span>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {outline.scenes.map((scene, index) => (
          <article
            key={scene.id}
            style={{
              padding: 14,
              border: "1px solid var(--tk-border-soft)",
              borderRadius: "var(--tk-radius-md)",
              background: "var(--tk-raised)",
            }}
          >
            <div style={{ fontSize: 11, color: "var(--tk-text-ter)", marginBottom: 6 }}>Scene {index + 1}</div>
            <h3 style={{ margin: 0, fontSize: 15 }}>{scene.goal}</h3>
            <p style={{ margin: "7px 0 0", color: "var(--tk-text-sec)", lineHeight: 1.45 }}>{scene.visual}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function PlaywrightResultView({ job }: { job: ApiGenerationJob }) {
  const artifacts = job.result?.artifacts ?? [];
  const projectArtifact = artifacts.find((artifact) => artifact.kind === "playwright-demo-project");
  const videoArtifact = artifacts.find((artifact) => artifact.kind === "playwright-video");

  return (
    <section className="tk-porcelain" aria-label="Playwright result" style={{ minHeight: "100vh", padding: 24 }}>
      <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <h1 style={{ margin: 0, fontSize: 26, letterSpacing: "-0.02em" }}>Playwright demo ready</h1>
        <p style={{ margin: 0, color: "var(--tk-text-sec)", lineHeight: 1.5 }}>
          Generated DemoProject and capture artifacts from the Playwright pipeline.
        </p>
        {videoArtifact ? (
          <video
            data-testid="playwright-result-video"
            aria-label="Playwright capture preview"
            src={videoArtifact.url}
            controls
            style={{ width: "100%", borderRadius: "var(--tk-radius-lg)", border: "1px solid var(--tk-border)" }}
          >
            <track kind="captions" label="No captions available" src="data:text/vtt,WEBVTT%0A" default />
          </video>
        ) : (
          <output
            style={{ padding: 12, border: "1px solid var(--tk-border)", borderRadius: "var(--tk-radius-md)", color: "var(--tk-text-sec)" }}
          >
            No Playwright preview video artifact was returned.
          </output>
        )}
        {projectArtifact ? (
          <a className="tk-btn" href={projectArtifact.url} target="_blank" rel="noreferrer" style={{ alignSelf: "flex-start" }}>
            Open DemoProject JSON
          </a>
        ) : null}
      </div>
    </section>
  );
}

export function CompositionDemoScreen({ client, planningClient, editClient, onBack, resolveWindow, initialCompletedJob }: CompositionDemoScreenProps) {
  const job = useCompositionGenerationJob(client);
  const [showEmptyEditor, setShowEmptyEditor] = useState(false);
  const [repoDraft, setRepoDraft] = useState("");
  const [productDraft, setProductDraft] = useState("");
  const [planningSession, setPlanningSession] = useState<CompositionPlanningSession | undefined>(undefined);
  const [planningMessage, setPlanningMessage] = useState("");
  const [planningBusy, setPlanningBusy] = useState(false);
  const [planningError, setPlanningError] = useState<string | undefined>(undefined);
  const [productFocus, setProductFocus] = useState(false);
  const [repoFocus, setRepoFocus] = useState(false);
  const [repoShake, setRepoShake] = useState(false);

  const productInputRef = useRef<HTMLInputElement>(null);
  const repoInputRef = useRef<HTMLInputElement>(null);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const normalizedProductUrl = normalizePublicUrl(productDraft);
  const normalizedRepo = parseGithubRepo(repoDraft);
  const canPlan = !planningBusy && normalizedProductUrl !== undefined && normalizedRepo !== undefined;
  const canGenerate = job.phase !== "running" && planningSession?.outlineValid === true && planningSession.outline !== undefined;

  useEffect(() => {
    productInputRef.current?.focus();
    return () => clearTimeout(shakeTimerRef.current);
  }, []);

  const requireRepo = useCallback(() => {
    clearTimeout(shakeTimerRef.current);
    setRepoShake(true);
    shakeTimerRef.current = setTimeout(() => setRepoShake(false), 450);
    repoInputRef.current?.focus();
  }, []);

  const startPlanning = useCallback(() => {
    const productUrl = normalizePublicUrl(productDraft);
    const repo = parseGithubRepo(repoDraft);
    if (productUrl === undefined) {
      productInputRef.current?.focus();
      return;
    }
    if (repo === undefined) {
      requireRepo();
      return;
    }

    setPlanningBusy(true);
    setPlanningError(undefined);
    void planningClient
      .createSession({ productUrl, repoUrl: `https://github.com/${repo}`, agent: "claude" })
      .then((session) => setPlanningSession(session))
      .catch((error: unknown) => setPlanningError(error instanceof Error ? error.message : String(error)))
      .finally(() => setPlanningBusy(false));
  }, [planningClient, productDraft, repoDraft, requireRepo]);

  const sendPlanningMessage = useCallback(() => {
    const sessionId = planningSession?.id;
    const message = planningMessage.trim();
    if (sessionId === undefined || message === "" || planningBusy) return;

    setPlanningBusy(true);
    setPlanningError(undefined);
    void planningClient
      .sendMessage(sessionId, message)
      .then((session) => {
        setPlanningSession(session);
        setPlanningMessage("");
      })
      .catch((error: unknown) => setPlanningError(error instanceof Error ? error.message : String(error)))
      .finally(() => setPlanningBusy(false));
  }, [planningBusy, planningClient, planningMessage, planningSession?.id]);

  const startGeneration = useCallback(() => {
    const session = planningSession;
    if (session?.outlineValid !== true || session.outline === undefined) return;

    const request = {
      mode: "ai-url-planning",
      repoUrl: session.repoUrl,
      productUrl: session.productUrl,
      durationCapSeconds: session.outline.durationCapSeconds,
      aspectRatio: session.outline.aspectRatio,
      prompt: outlinePrompt(session.outline),
      renderer: "hyperframes",
      hyperframesAgent: "claude",
    } as const;

    void job.start(request);
  }, [job, planningSession]);

  if (showEmptyEditor) {
    return (
      <CompositionEditorScreen
        compositionIndexUrl={PREVIEW_COMPOSITION_URL}
        onBack={() => setShowEmptyEditor(false)}
        resolveWindow={resolveWindow}
      />
    );
  }

  const completedJob = initialCompletedJob ?? (job.phase === "completed" ? job.job : undefined);

  if (completedJob) {
    if (completedJob.result?.method === "hyperframes") {
      const { composition } = completedJob.result;
      const repoUrl = "repoUrl" in completedJob.request ? completedJob.request.repoUrl : undefined;
      const repo = typeof repoUrl === "string" ? parseGithubRepo(repoUrl) : undefined;
      return (
        <CompositionEditorScreen
          compositionIndexUrl={composition.indexArtifact.url}
          outputVideoUrl={composition.outputVideoArtifact.url}
          {...(repo === undefined ? {} : { repo })}
          jobId={completedJob.id}
          editClient={editClient}
          onBack={onBack}
          resolveWindow={resolveWindow}
        />
      );
    }
    if (completedJob.result?.method === "playwright") {
      return <PlaywrightResultView job={completedJob} />;
    }
    return (
      <div className="tk-porcelain" role="alert" style={{ padding: 24 }}>
        Generation completed but produced no supported result to open.
      </div>
    );
  }

  return (
    <section
      aria-label="Create demo"
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        background: "var(--tk-app-bg)",
        fontFamily: "var(--tk-font)",
        color: "var(--tk-text)",
        overflow: "auto",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: planningSession === undefined ? 580 : 1120,
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: planningSession === undefined ? "center" : "flex-start",
          padding: planningSession === undefined ? "0 24px" : "28px 24px",
          boxSizing: "border-box",
        }}
      >
        {onBack ? (
          <button type="button" className="tk-btn" onClick={onBack} style={{ alignSelf: "flex-start", marginBottom: 24 }}>
            Back
          </button>
        ) : null}

        {planningSession === undefined ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>
                Tinker <span style={{ fontWeight: 400, color: "var(--tk-text-sec)" }}>Studio</span>
              </h1>
              <p style={{ margin: "7px 0 0", fontSize: 13.5, color: "var(--tk-text-sec)", textAlign: "center" }}>
                Paste product and repo URLs, plan the demo, then generate the video.
              </p>
            </div>

            <div style={{ flexShrink: 0 }}>
              <div
                className={repoShake ? "tk-shake" : undefined}
                style={{
                  background: "var(--tk-card)",
                  border: "1px solid var(--tk-border)",
                  borderRadius: "var(--tk-radius-lg)",
                  boxShadow: "var(--tk-shadow-md)",
                  overflow: "hidden",
                }}
              >
                <div
                  onClick={() => productInputRef.current?.focus()}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    background: "var(--tk-raised)",
                    borderBottom: `1px solid ${productFocus ? "var(--tk-accent-line)" : "var(--tk-border-soft)"}`,
                    cursor: "text",
                    transition: "border-color 0.15s",
                  }}
                >
                  <span style={{ width: 15, color: normalizedProductUrl ? "var(--tk-accent)" : "var(--tk-text-sec)", flexShrink: 0 }}>URL</span>
                  <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
                    {productDraft === "" ? (
                      <span
                        style={{
                          position: "absolute",
                          left: 0,
                          top: "50%",
                          transform: "translateY(-50%)",
                          fontSize: 12,
                          fontFamily: "var(--tk-mono)",
                          color: "var(--tk-text-ter)",
                          pointerEvents: "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        product.example.com
                      </span>
                    ) : null}
                    <input
                      ref={productInputRef}
                      aria-label="Product URL"
                      value={productDraft}
                      spellCheck={false}
                      onFocus={() => setProductFocus(true)}
                      onBlur={() => setProductFocus(false)}
                      onChange={(event) => setProductDraft(event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          repoInputRef.current?.focus();
                        }
                      }}
                      style={{
                        width: "100%",
                        border: "none",
                        outline: "none",
                        background: "transparent",
                        color: "var(--tk-text)",
                        fontSize: 12,
                        fontFamily: "var(--tk-mono)",
                        padding: 0,
                        display: "block",
                      }}
                    />
                  </div>
                </div>

                <div
                  onClick={() => repoInputRef.current?.focus()}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    background: "var(--tk-raised)",
                    borderBottom: `1px solid ${repoFocus ? "var(--tk-accent-line)" : "var(--tk-border-soft)"}`,
                    cursor: "text",
                    transition: "border-color 0.15s",
                  }}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 16 16"
                    fill={normalizedRepo ? "var(--tk-accent)" : "var(--tk-text-sec)"}
                    style={{ flexShrink: 0, transition: "fill 0.15s" }}
                  >
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                  </svg>
                  <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
                    {repoDraft === "" ? (
                      <span
                        style={{
                          position: "absolute",
                          left: 0,
                          top: "50%",
                          transform: "translateY(-50%)",
                          fontSize: 12,
                          fontFamily: "var(--tk-mono)",
                          color: "var(--tk-text-ter)",
                          pointerEvents: "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        github.com/owner/repo
                      </span>
                    ) : null}
                    <input
                      ref={repoInputRef}
                      aria-label="GitHub repo URL"
                      value={repoDraft}
                      spellCheck={false}
                      onFocus={() => setRepoFocus(true)}
                      onBlur={() => setRepoFocus(false)}
                      onChange={(event) => setRepoDraft(event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          startPlanning();
                        }
                      }}
                      style={{
                        width: "100%",
                        border: "none",
                        outline: "none",
                        background: "transparent",
                        color: "var(--tk-text)",
                        fontSize: 12,
                        fontFamily: "var(--tk-mono)",
                        padding: 0,
                        display: "block",
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px" }}>
                  <div aria-live="polite" aria-atomic="true" style={{ flex: 1, fontSize: 12, color: "var(--tk-text-ter)" }}>
                    {planningBusy ? "Planning demo..." : ""}
                  </div>
                  <button
                    type="button"
                    onClick={startPlanning}
                    disabled={!canPlan}
                    className="tk-btn"
                    style={{ opacity: canPlan ? 1 : 0.45, cursor: canPlan ? "pointer" : "not-allowed" }}
                  >
                    {planningBusy ? "Planning..." : "Plan demo"}
                  </button>
                </div>

                {planningError ? (
                  <div role="alert" style={{ padding: "0 14px 12px", fontSize: 13, color: "var(--tk-text-sec)" }}>
                    <span style={{ color: "var(--tk-text)" }}>Planning failed: </span>
                    {planningError}
                  </div>
                ) : null}
              </div>
            </div>

            {job.phase !== "running" ? (
              <button
                type="button"
                className="tk-btn"
                onClick={() => setShowEmptyEditor(true)}
                style={{ alignSelf: "center", marginTop: 14, fontSize: 12.5, color: "var(--tk-text-sec)", background: "transparent" }}
              >
                Open empty editor shell
              </button>
            ) : null}
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <button
              type="button"
              className="tk-btn"
              onClick={() => {
                setPlanningSession(undefined);
                setPlanningError(undefined);
              }}
              style={{ alignSelf: "flex-start", color: "var(--tk-text-sec)", background: "transparent" }}
            >
              Back to URLs
            </button>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
                gap: 18,
                alignItems: "start",
              }}
            >
              <section
                aria-label="Planning workspace"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  padding: 18,
                  background: "var(--tk-card)",
                  border: "1px solid var(--tk-border)",
                  borderRadius: "var(--tk-radius-lg)",
                  boxShadow: "var(--tk-shadow-md)",
                }}
              >
                <div>
                  <h1 style={{ margin: 0, fontSize: 26, letterSpacing: "-0.02em" }}>Plan demo</h1>
                  <p style={{ margin: "7px 0 0", color: "var(--tk-text-sec)", fontSize: 13 }}>
                    {planningSession.productUrl} / {planningSession.repoUrl}
                  </p>
                </div>

                <div aria-label="Planning transcript" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {planningSession.messages.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      style={{
                        alignSelf: message.role === "user" ? "flex-end" : "flex-start",
                        maxWidth: "88%",
                        padding: "9px 11px",
                        borderRadius: "var(--tk-radius-md)",
                        background: message.role === "user" ? "var(--tk-accent)" : "var(--tk-raised)",
                        color: message.role === "user" ? "white" : "var(--tk-text)",
                        lineHeight: 1.45,
                        fontSize: 13,
                      }}
                    >
                      {message.content}
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <textarea
                    aria-label="Planning message"
                    value={planningMessage}
                    rows={2}
                    onChange={(event) => setPlanningMessage(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        sendPlanningMessage();
                      }
                    }}
                    style={{
                      flex: 1,
                      resize: "vertical",
                      minHeight: 42,
                      border: "1px solid var(--tk-border-soft)",
                      borderRadius: "var(--tk-radius-md)",
                      background: "var(--tk-raised)",
                      color: "var(--tk-text)",
                      padding: "9px 10px",
                      fontFamily: "inherit",
                      fontSize: 13,
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Send planning message"
                    className="tk-btn"
                    onClick={sendPlanningMessage}
                    disabled={planningBusy || planningMessage.trim() === ""}
                    style={{ opacity: planningBusy || planningMessage.trim() === "" ? 0.45 : 1 }}
                  >
                    Send
                  </button>
                </div>

                {planningError ? (
                  <div role="alert" style={{ fontSize: 13, color: "var(--tk-text-sec)" }}>
                    <span style={{ color: "var(--tk-text)" }}>Planning failed: </span>
                    {planningError}
                  </div>
                ) : null}
              </section>

              <section
                aria-label="Approved outline"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                  padding: 18,
                  background: "var(--tk-card)",
                  border: "1px solid var(--tk-border)",
                  borderRadius: "var(--tk-radius-lg)",
                  boxShadow: "var(--tk-shadow-md)",
                }}
              >
                {planningSession.outlineValid && planningSession.outline !== undefined ? (
                  <OutlineView outline={planningSession.outline} />
                ) : (
                  <div style={{ color: "var(--tk-text-sec)", lineHeight: 1.5 }}>
                    The agent has not produced a valid outline yet.
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    aria-label="Generate video"
                    className="tk-btn"
                    onClick={startGeneration}
                    disabled={!canGenerate}
                    style={{ opacity: canGenerate ? 1 : 0.45, cursor: canGenerate ? "pointer" : "not-allowed" }}
                  >
                    {job.phase === "running" ? "Generating..." : "Generate video"}
                  </button>
                  {job.phase === "running" ? (
                    <div data-testid="composition-generating" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        {[0, 1, 2].map((index) => (
                          <span
                            key={index}
                            className="tk-dot"
                            data-testid="typing-dot"
                            style={{ background: "var(--tk-text-ter)", animationDelay: `${index * 0.18}s` }}
                          />
                        ))}
                      </div>
                      <button type="button" className="tk-btn" onClick={() => job.cancel()}>
                        Cancel
                      </button>
                    </div>
                  ) : null}
                </div>

                {job.phase === "failed" ? (
                  <div
                    role="alert"
                    style={{
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: "var(--tk-text-sec)",
                      background: "var(--tk-raised)",
                      border: "1px solid var(--tk-border)",
                      borderRadius: "var(--tk-radius-md)",
                      padding: "9px 12px",
                    }}
                  >
                    <span style={{ color: "var(--tk-text)" }}>Something went wrong: </span>
                    {job.error ?? "Generation failed."}
                  </div>
                ) : null}
              </section>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
