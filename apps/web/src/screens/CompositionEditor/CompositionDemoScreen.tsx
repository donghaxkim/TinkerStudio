import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiGenerationJob } from "@tinker/generation-contract";
import type { TimelineRegistryWindow } from "@tinker/editor";
import type { CompositionEditClient } from "../../lib/compositionEditClient.js";
import type { CompositionGenerationClient } from "../../lib/compositionGenerationClient.js";
import type { CompositionPlanningClient } from "../../lib/compositionPlanningClient.js";
import { useCompositionGenerationJob } from "../../lib/useCompositionGenerationJob.js";
import { CompositionEditorScreen } from "./CompositionEditorScreen.js";

const PREVIEW_COMPOSITION_URL = "/demo-composition/index.html";

export type CompositionDemoScreenProps = {
  client: CompositionGenerationClient;
  planningClient?: CompositionPlanningClient;
  editClient?: CompositionEditClient;
  /** Optional: render a Back button that calls this. */
  onBack?: () => void;
  /** Test seam forwarded to CompositionEditorScreen. */
  resolveWindow?: (iframe: HTMLIFrameElement) => TimelineRegistryWindow | null | undefined;
  initialCompletedJob?: ApiGenerationJob;
};

const GHOSTS = [
  "A 60s launch video, open on the messy standup, end on the invite flow...",
  "Quick tour for the changelog, three features, fast cuts, end on the CTA...",
  "Something calm for the landing page, one feature, let it breathe...",
];

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

function GhostText({ active }: { active: boolean }) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (!active) {
      setText("");
      return;
    }

    let phraseIndex = 0;
    let position = 0;
    let direction = 1;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const phrase = GHOSTS[phraseIndex % GHOSTS.length]!;
      position += direction;
      setText(phrase.slice(0, position));
      let delay = direction > 0 ? 42 : 14;
      if (direction > 0 && position >= phrase.length) {
        direction = -1;
        delay = 2200;
      }
      if (direction < 0 && position <= 0) {
        direction = 1;
        phraseIndex += 1;
        delay = 500;
      }
      timer = setTimeout(tick, delay);
    };

    timer = setTimeout(tick, 500);
    return () => clearTimeout(timer);
  }, [active]);

  if (!active) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        padding: "10px 10px 4px",
        fontSize: 13,
        lineHeight: 1.55,
        color: "var(--tk-text-ter)",
        pointerEvents: "none",
        whiteSpace: "pre-wrap",
        overflow: "hidden",
      }}
    >
      {text}
      <span className="tk-caret" />
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

export function CompositionDemoScreen({ client, editClient, onBack, resolveWindow, initialCompletedJob }: CompositionDemoScreenProps) {
  const job = useCompositionGenerationJob(client);
  const [showEmptyEditor, setShowEmptyEditor] = useState(false);
  const [repoDraft, setRepoDraft] = useState("");
  const [description, setDescription] = useState("");
  const [renderer, setRenderer] = useState<"hyperframes" | "playwright">("hyperframes");
  const [repoFocus, setRepoFocus] = useState(false);
  const [descriptionFocus, setDescriptionFocus] = useState(false);
  const [repoShake, setRepoShake] = useState(false);

  const repoInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const normalizedRepo = parseGithubRepo(repoDraft);
  const canGenerate = job.phase !== "running" && normalizedRepo !== undefined && description.trim() !== "";

  useEffect(() => {
    repoInputRef.current?.focus();
    return () => clearTimeout(shakeTimerRef.current);
  }, []);

  const requireRepo = useCallback(() => {
    clearTimeout(shakeTimerRef.current);
    setRepoShake(true);
    shakeTimerRef.current = setTimeout(() => setRepoShake(false), 450);
    repoInputRef.current?.focus();
  }, []);

  const startGeneration = useCallback(() => {
    const repo = parseGithubRepo(repoDraft);
    const prompt = description.trim();
    if (repo === undefined) {
      requireRepo();
      return;
    }
    if (prompt === "") {
      descriptionRef.current?.focus();
      return;
    }

    void job.start({
      mode: "ai-url-planning",
      repoUrl: `https://github.com/${repo}`,
      durationCapSeconds: 60,
      aspectRatio: "16:9",
      prompt,
      renderer,
    });
  }, [description, job, renderer, repoDraft, requireRepo]);

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
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 580,
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 24px",
          boxSizing: "border-box",
        }}
      >
        {onBack ? (
          <button type="button" className="tk-btn" onClick={onBack} style={{ alignSelf: "flex-start", marginBottom: 24 }}>
            Back
          </button>
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>
            Tinker <span style={{ fontWeight: 400, color: "var(--tk-text-sec)" }}>Studio</span>
          </h1>
          <p style={{ margin: "7px 0 0", fontSize: 13.5, color: "var(--tk-text-sec)", textAlign: "center" }}>
            Paste your repo, get the demo video.
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
                      descriptionRef.current?.focus();
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

              {normalizedRepo ? (
                <span
                  title="Repository URL looks valid"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 16,
                    height: 16,
                    borderRadius: 99,
                    background: "var(--tk-ok)",
                    color: "oklch(0.99 0.006 90)",
                    flexShrink: 0,
                  }}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m2 6.5 2.8 2.8L10 3.5" />
                  </svg>
                </span>
              ) : null}
            </div>

            <div style={{ padding: "4px 6px 6px" }}>
              <div style={{ position: "relative" }}>
                <textarea
                  ref={descriptionRef}
                  aria-label="Demo description"
                  rows={2}
                  value={description}
                  onFocus={() => setDescriptionFocus(true)}
                  onBlur={() => setDescriptionFocus(false)}
                  onChange={(event) => setDescription(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      startGeneration();
                    }
                  }}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    resize: "none",
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    color: "var(--tk-text)",
                    fontSize: 13,
                    lineHeight: 1.55,
                    padding: "10px 10px 4px",
                    fontFamily: "inherit",
                    position: "relative",
                    zIndex: 1,
                  }}
                />
                <GhostText active={!descriptionFocus && description === ""} />
              </div>

              <div style={{ display: "flex", alignItems: "center", padding: "0 4px" }}>
                <div
                  role="radiogroup"
                  aria-label="Generation method"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    marginRight: 10,
                    padding: 2,
                    border: "1px solid var(--tk-border-soft)",
                    borderRadius: "var(--tk-radius-sm)",
                    background: "var(--tk-raised)",
                  }}
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={renderer === "hyperframes"}
                    onClick={() => setRenderer("hyperframes")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "4px 7px",
                      border: "none",
                      borderRadius: "var(--tk-radius-xs)",
                      fontSize: 11.5,
                      color: "var(--tk-text)",
                      background: renderer === "hyperframes" ? "var(--tk-card)" : "transparent",
                      boxShadow: renderer === "hyperframes" ? "inset 0 0 0 1px var(--tk-border-soft)" : "none",
                      cursor: "pointer",
                    }}
                  >
                    HyperFrames
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={renderer === "playwright"}
                    onClick={() => setRenderer("playwright")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "4px 7px",
                      border: "none",
                      borderRadius: "var(--tk-radius-xs)",
                      fontSize: 11.5,
                      color: "var(--tk-text)",
                      background: renderer === "playwright" ? "var(--tk-card)" : "transparent",
                      boxShadow: renderer === "playwright" ? "inset 0 0 0 1px var(--tk-border-soft)" : "none",
                      cursor: "pointer",
                    }}
                  >
                    Playwright
                  </button>
                </div>
                <div aria-live="polite" aria-atomic="true" style={{ flex: 1, fontSize: 12, color: "var(--tk-text-ter)" }}>
                  {job.phase === "running" ? "Generating composition..." : ""}
                </div>
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
                ) : (
                  <button
                    type="button"
                    onClick={startGeneration}
                    disabled={!canGenerate}
                    title={!normalizedRepo ? "Enter your repo first" : description.trim() === "" ? "Describe the demo first" : "Generate"}
                    aria-label="Generate"
                    className="tk-send"
                    style={{ opacity: canGenerate ? 1 : 0.35 }}
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 14 14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M7 12V2 M2.8 6.2 7 2l4.2 4.2" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {job.phase !== "running" ? (
          <button
            type="button"
            className="tk-btn"
            onClick={() => setShowEmptyEditor(true)}
            style={{
              alignSelf: "center",
              marginTop: 14,
              fontSize: 12.5,
              color: "var(--tk-text-sec)",
              background: "transparent",
            }}
          >
            Open empty editor shell
          </button>
        ) : null}

        {job.phase === "failed" ? (
          <div
            role="alert"
            style={{
              marginTop: 14,
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
      </div>
    </section>
  );
}
