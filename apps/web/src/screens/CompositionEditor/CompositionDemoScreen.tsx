import { useCallback, useEffect, useRef, useState } from "react";
import {
  LuArrowUp,
  LuChevronLeft,
  LuCircle,
  LuCircleCheck,
  LuGithub,
  LuGlobe,
  LuListVideo,
  LuLoaderCircle,
  LuSparkles,
} from "react-icons/lu";
import type {
  ApiGenerationJob,
  DemoOutline,
  PlanningAgent,
  PlanningProgressEntry,
  PlanningProgressStatus,
  PlanningStage,
} from "@tinker/generation-contract";
import { DEFAULT_SYSTEM_PROMPT } from "@tinker/generation-contract";
import type { CompositionGenerationClient, CreateCompositionJobRequest } from "../../lib/compositionGenerationClient.js";
import type { CompositionPlanningClient } from "../../lib/compositionPlanningClient.js";
import { useCompositionGenerationJob } from "../../lib/useCompositionGenerationJob.js";
import { useCompositionPlanningSession } from "../../lib/useCompositionPlanningSession.js";
import { CompositionEditorScreen } from "./CompositionEditorScreen.js";

export type CompositionDemoScreenProps = {
  client: CompositionGenerationClient;
  planningClient: CompositionPlanningClient;
  /** Optional: render a Back button that calls this. */
  onBack?: () => void;
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

function hostOf(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

function outlinePrompt(outline: DemoOutline): string {
  return `Use this approved video outline as the product demo brief:\n\n${JSON.stringify(outline, null, 2)}`;
}

const STAGE_LABELS: Record<PlanningStage, (context: { repo?: string; site?: string }) => string> = {
  preparing: () => "Creating the planning workspace",
  "analyzing-repo": ({ repo }) => `Cloning and reading ${repo ?? "the repository"}`,
  "analyzing-website": ({ site }) => `Analyzing ${site ?? "the product site"}`,
  drafting: () => "Drafting the outline",
};

function StageChecklist({
  progress,
  includeWebsite,
  repo,
  site,
}: {
  progress: PlanningProgressEntry[];
  includeWebsite: boolean;
  repo?: string;
  site?: string;
}) {
  const stages: PlanningStage[] = [
    "preparing",
    "analyzing-repo",
    ...(includeWebsite ? (["analyzing-website"] as PlanningStage[]) : []),
    "drafting",
  ];

  function statusFor(stage: PlanningStage): PlanningProgressStatus | "pending" {
    const entry = progress.find((item) => item.stage === stage);
    if (entry !== undefined) return entry.status;
    if (progress.length === 0 && stage === "preparing") return "active";
    return "pending";
  }

  return (
    <div className="tk-cd-assistant tk-cd-msg">
      <div className="tk-cd-avatar" aria-hidden="true">
        <LuSparkles size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tk-cd-author">Planner</div>
        <div className="tk-cd-steps">
          {stages.map((stage) => {
            const state = statusFor(stage);
            return (
              <div key={stage} className="tk-cd-step" data-state={state}>
                <span className="tk-cd-step-icon">
                  {state === "done" ? (
                    <LuCircleCheck size={15} />
                  ) : state === "active" ? (
                    <LuLoaderCircle size={15} className="tk-spin" />
                  ) : (
                    <LuCircle size={15} />
                  )}
                </span>
                <span>{STAGE_LABELS[stage]({ repo, site })}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OutlineStoryboard({ outline }: { outline: DemoOutline }) {
  return (
    <>
      <div className="tk-cd-outline-head">
        <div className="tk-cd-outline-title">
          <LuListVideo size={15} style={{ color: "var(--tk-accent)" }} aria-hidden="true" />
          <h2>{outline.title}</h2>
        </div>
        <p className="tk-cd-outline-summary">{outline.summary}</p>
        <div className="tk-cd-meta">
          <span className="tk-cd-chip">{outline.durationCapSeconds}s cap</span>
          <span className="tk-cd-chip">{outline.aspectRatio}</span>
          <span className="tk-cd-chip">
            {outline.scenes.length} {outline.scenes.length === 1 ? "scene" : "scenes"}
          </span>
        </div>
      </div>
      <div className="tk-cd-scenes">
        {outline.scenes.map((scene, index) => (
          <article key={scene.id} className="tk-cd-scene">
            <span className="tk-cd-scene-num" aria-hidden="true">
              {index + 1}
            </span>
            <div className="tk-cd-scene-goal">{scene.goal}</div>
            <p className="tk-cd-scene-visual">{scene.visual}</p>
            <div className="tk-cd-evidence">
              {scene.evidence.map((kind) => (
                <span key={kind} className="tk-cd-pill" data-kind={kind}>
                  {kind}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

export function CompositionDemoScreen({ client, planningClient, onBack, initialCompletedJob }: CompositionDemoScreenProps) {
  const job = useCompositionGenerationJob(client);
  const planning = useCompositionPlanningSession(planningClient);
  const [repoDraft, setRepoDraft] = useState("");
  const [productDraft, setProductDraft] = useState("");
  const [directError, setDirectError] = useState<string | undefined>(undefined);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [systemPromptDraft, setSystemPromptDraft] = useState(DEFAULT_SYSTEM_PROMPT);
  const [planningMessage, setPlanningMessage] = useState("");
  const [repoShake, setRepoShake] = useState(false);
  const [planningAgent, setPlanningAgent] = useState<PlanningAgent>("opencode");

  const repoInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const session = planning.session;
  const planningBusy = planning.busy;
  const jobRunning = job.phase === "running";
  const isOpen = planningBusy || session !== undefined;
  const isInitialWork = planningBusy && (session === undefined || session.status !== "ready");
  const showOutline = session !== undefined && !isInitialWork;
  const normalizedProductUrl = normalizePublicUrl(productDraft);
  const normalizedRepo = parseGithubRepo(repoDraft);
  const outline = session?.outline;
  const outlineValid = session?.outlineValid === true && outline !== undefined;

  const canPlan = !planningBusy && normalizedRepo !== undefined && normalizedProductUrl !== undefined;
  const canGenerate = !planningBusy && !jobRunning && outlineValid;
  const canGenerateDirect = !planningBusy && !jobRunning && normalizedRepo !== undefined;
  const canUseGlobalNavigation = !planningBusy && !jobRunning;

  const repoLabel = parseGithubRepo(session?.repoUrl ?? "") ?? normalizedRepo;
  const siteLabel = hostOf(session?.productUrl) ?? hostOf(normalizedProductUrl);
  const includeWebsite =
    normalizedProductUrl !== undefined ||
    session?.productUrl !== undefined ||
    (session?.progress ?? []).some((entry) => entry.stage === "analyzing-website");

  useEffect(() => {
    repoInputRef.current?.focus();
    return () => clearTimeout(shakeTimerRef.current);
  }, []);

  useEffect(() => {
    if (isOpen && !planningBusy) composerRef.current?.focus();
  }, [isOpen, planningBusy]);

  const requireRepo = useCallback(() => {
    clearTimeout(shakeTimerRef.current);
    setRepoShake(true);
    shakeTimerRef.current = setTimeout(() => setRepoShake(false), 450);
    repoInputRef.current?.focus();
  }, []);

  const startPlanning = useCallback(() => {
    const repo = parseGithubRepo(repoDraft);
    if (repo === undefined) {
      requireRepo();
      return;
    }
    const productUrl = normalizePublicUrl(productDraft);
    if (productUrl === undefined) {
      setDirectError("Add your product / website URL before planning.");
      return;
    }
    setDirectError(undefined);
    planning.start({ repoUrl: `https://github.com/${repo}`, productUrl, agent: planningAgent });
  }, [planning, planningAgent, productDraft, repoDraft, requireRepo]);

  const submitMessage = useCallback(() => {
    const message = planningMessage.trim();
    if (message === "" || planningBusy) return;
    planning.sendMessage(message);
    setPlanningMessage("");
  }, [planning, planningBusy, planningMessage]);

  const backToUrls = useCallback(() => {
    if (!canUseGlobalNavigation) return;
    planning.reset();
    setPlanningMessage("");
  }, [canUseGlobalNavigation, planning]);

  const startGeneration = useCallback(() => {
    if (planningBusy || session === undefined || session.outlineValid !== true || session.outline === undefined) return;

    const request = {
      mode: "ai-url-planning",
      repoUrl: session.repoUrl,
      ...(session.productUrl === undefined ? {} : { productUrl: session.productUrl }),
      durationCapSeconds: session.outline.durationCapSeconds,
      aspectRatio: session.outline.aspectRatio,
      prompt: outlinePrompt(session.outline),
    } as const;

    void job.start(request);
  }, [job, planningBusy, session]);

  const startDirectGeneration = useCallback(() => {
    const repo = parseGithubRepo(repoDraft);
    if (repo === undefined) {
      requireRepo();
      return;
    }
    const productUrl = normalizePublicUrl(productDraft);
    if (productUrl === undefined) {
      setDirectError("Add your product / website URL - the Playwright capture pipeline records it live.");
      return;
    }
    setDirectError(undefined);
    const trimmedSystemPrompt = systemPromptDraft.trim();
    const request: CreateCompositionJobRequest = {
      mode: "ai-url-planning",
      repoUrl: `https://github.com/${repo}`,
      productUrl,
      durationCapSeconds: 45,
      aspectRatio: "16:9",
      ...(trimmedSystemPrompt === "" ? {} : { systemPrompt: trimmedSystemPrompt }),
    };
    void job.start(request);
  }, [job, productDraft, repoDraft, requireRepo, systemPromptDraft]);

  const completedJob = initialCompletedJob ?? (job.phase === "completed" ? job.job : undefined);

  if (completedJob) {
    const videoArtifact = completedJob.result?.artifacts.find((artifact) => artifact.kind === "playwright-video");
    const repoUrl = "repoUrl" in completedJob.request ? completedJob.request.repoUrl : undefined;
    const repo = typeof repoUrl === "string" ? parseGithubRepo(repoUrl) : undefined;
    if (videoArtifact) {
      return <CompositionEditorScreen standaloneVideoUrl={videoArtifact.url} {...(repo === undefined ? {} : { repo })} onBack={onBack} />;
    }
    return (
      <div className="tk-porcelain" role="alert" style={{ padding: 24 }}>
        Playwright generation completed but returned no preview video artifact.
      </div>
    );
  }

  const messages = session?.messages ?? [];
  const generationControls = jobRunning ? (
    <div data-testid="composition-generating">
      <div className="tk-cd-bar">
        <i />
      </div>
      <div className="tk-cd-gen-row">
        <span className="tk-cd-gen-label">Generating your demo video, this usually takes a few minutes.</span>
        <button type="button" className="tk-btn" aria-busy="true" disabled>
          Generating...
        </button>
        <button type="button" className="tk-btn" onClick={() => job.cancel()}>
          Cancel
        </button>
      </div>
    </div>
  ) : (
    <div className="tk-cd-gen-row">
      <button type="button" className="tk-btn tk-btn-accent" onClick={startGeneration} disabled={!canGenerate} aria-busy={false}>
        Generate video
      </button>
      <span className="tk-cd-gen-hint">{outlineValid ? "Outline approved, ready to render." : "Keep refining the outline in chat."}</span>
    </div>
  );

  return (
    <section className="tk-cd-screen" aria-label="Create demo">
      {onBack ? (
        <div className="tk-cd-top">
          <button type="button" className="tk-btn" onClick={() => canUseGlobalNavigation && onBack()} disabled={!canUseGlobalNavigation}>
            Back
          </button>
        </div>
      ) : null}

      <div className={`tk-cd-stage${isOpen ? " is-open" : ""}`}>
        <div className={`tk-cd-hero${isOpen ? " is-tucked" : ""}`} aria-hidden={isOpen}>
          <h1>
            Tinker <span>Studio</span>
          </h1>
          <p>Drop in your repo. We plan the demo together, then make the video.</p>
        </div>

        <div className={`tk-cd-box${isOpen ? " is-open" : ""}`}>
          {isOpen ? (
            <>
              <div className="tk-cd-head">
                <button type="button" className="tk-cd-back" onClick={backToUrls} disabled={!canUseGlobalNavigation}>
                  <LuChevronLeft size={15} aria-hidden="true" />
                  Back to URLs
                </button>
                {repoLabel ? (
                  <span className="tk-cd-chip">
                    <LuGithub size={13} style={{ color: "var(--tk-text)" }} aria-hidden="true" />
                    {repoLabel}
                  </span>
                ) : null}
                {siteLabel ? (
                  <span className="tk-cd-chip">
                    <LuGlobe size={12} aria-hidden="true" />
                    {siteLabel}
                  </span>
                ) : null}
                <span className={`tk-cd-status${planningBusy ? " is-working" : ""}`}>
                  {planningBusy ? "Planner working" : "Planner ready"}
                </span>
              </div>

              <div className="tk-cd-body" role="log" aria-label="Planning transcript" aria-live="polite">
                {messages.map((message, index) =>
                  message.role === "user" ? (
                    <div key={`m-${index}`} className="tk-cd-user tk-cd-msg">
                      {message.content}
                    </div>
                  ) : (
                    <div key={`m-${index}`} className="tk-cd-assistant tk-cd-msg">
                      <div className="tk-cd-avatar" aria-hidden="true">
                        <LuSparkles size={14} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="tk-cd-author">Planner</div>
                        <div className="tk-cd-assistant-text">{message.content}</div>
                      </div>
                    </div>
                  ),
                )}

                {planningBusy && isInitialWork ? (
                  <StageChecklist progress={session?.progress ?? []} includeWebsite={includeWebsite} repo={repoLabel} site={siteLabel} />
                ) : null}

                {planningBusy && !isInitialWork ? (
                  <div className="tk-cd-assistant tk-cd-msg">
                    <div className="tk-cd-avatar" aria-hidden="true">
                      <LuSparkles size={14} />
                    </div>
                    <div className="tk-cd-revise">Revising the outline</div>
                  </div>
                ) : null}

                {showOutline ? (
                  <div className="tk-cd-outline tk-cd-msg">
                    {outlineValid && outline !== undefined ? <OutlineStoryboard outline={outline} /> : <div className="tk-cd-outline-empty">The agent has not produced a valid outline yet.</div>}
                  </div>
                ) : null}

                {job.phase === "failed" ? (
                  <div role="alert" className="tk-cd-alert">
                    <b>Something went wrong: </b>
                    {job.error ?? "Generation failed."}
                  </div>
                ) : null}
              </div>

              {showOutline ? <div className="tk-cd-outline-foot tk-cd-generation-bar">{generationControls}</div> : null}

              <div className="tk-cd-foot">
                <div className="tk-cd-composer">
                  <textarea
                    ref={composerRef}
                    className="tk-cd-composer-input"
                    aria-label="Planning message"
                    rows={1}
                    value={planningMessage}
                    disabled={planningBusy}
                    placeholder="Ask for a change, e.g. make the hook punchier"
                    onChange={(event) => setPlanningMessage(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        submitMessage();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="tk-cd-send"
                    aria-label="Send planning message"
                    onClick={submitMessage}
                    disabled={planningBusy || planningMessage.trim() === ""}
                  >
                    <LuArrowUp size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className={`tk-cd-form${repoShake ? " tk-shake" : ""}`}>
              <div className="tk-cd-field">
                <span className="tk-cd-field-icon" aria-hidden="true">
                  <LuGithub size={18} style={{ color: normalizedRepo ? "var(--tk-accent)" : "var(--tk-text-sec)" }} />
                </span>
                <div className="tk-cd-input-wrap">
                  <input
                    ref={repoInputRef}
                    className="tk-cd-input"
                    aria-label="GitHub repo URL"
                    placeholder="github.com/owner/repo"
                    spellCheck={false}
                    value={repoDraft}
                    onChange={(event) => setRepoDraft(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        startDirectGeneration();
                      }
                    }}
                  />
                </div>
                {normalizedRepo ? (
                  <span className="tk-cd-check" aria-label="valid repository">
                    <LuCircleCheck size={16} />
                  </span>
                ) : null}
              </div>

              <div className="tk-cd-field">
                <span className="tk-cd-field-icon" aria-hidden="true">
                  <LuGlobe size={16} style={{ color: "var(--tk-text-sec)" }} />
                </span>
                <div className="tk-cd-input-wrap">
                  <input
                    className="tk-cd-input"
                    aria-label="Product URL"
                    placeholder="product.example.com"
                    spellCheck={false}
                    value={productDraft}
                    onChange={(event) => setProductDraft(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        startDirectGeneration();
                      }
                    }}
                  />
                </div>
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--tk-text-sec)", padding: "0 2px" }}>
                Planning agent
                <select
                  aria-label="Planning agent"
                  value={planningAgent}
                  onChange={(event) => setPlanningAgent(event.currentTarget.value as PlanningAgent)}
                  disabled={planningBusy}
                  style={{
                    border: "1px solid var(--tk-border-soft)",
                    borderRadius: "var(--tk-radius-sm)",
                    background: "var(--tk-raised)",
                    color: "var(--tk-text)",
                    padding: "6px 8px",
                  }}
                >
                  <option value="opencode">OpenCode</option>
                  <option value="claude">Claude Code</option>
                </select>
              </label>

              <div className="tk-cd-actions">
                {jobRunning ? (
                  <>
                    <span className="tk-cd-actions-hint" data-testid="composition-generating-direct">
                      Generating your demo video - this usually takes a few minutes...
                    </span>
                    <button type="button" className="tk-btn" aria-busy="true" disabled>
                      Generating...
                    </button>
                    <button type="button" className="tk-btn" onClick={() => job.cancel()}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="tk-cd-actions-hint">Paste repo + product URL, then Generate.</span>
                    <button type="button" className="tk-btn" onClick={startPlanning} disabled={!canPlan}>
                      <LuSparkles size={14} aria-hidden="true" />
                      Plan
                    </button>
                    <button type="button" className="tk-btn tk-btn-accent" onClick={startDirectGeneration} disabled={!canGenerateDirect}>
                      Generate now
                    </button>
                  </>
                )}
              </div>

              <div className="tk-cd-sysprompt" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="tk-cd-shell-link"
                  aria-expanded={showSystemPrompt}
                  onClick={() => setShowSystemPrompt((value) => !value)}
                >
                  {showSystemPrompt ? "Hide system prompt" : "Edit system prompt"}
                </button>
                {showSystemPrompt ? (
                  <textarea
                    className="tk-cd-input"
                    aria-label="System prompt"
                    rows={4}
                    spellCheck={false}
                    value={systemPromptDraft}
                    onChange={(event) => setSystemPromptDraft(event.currentTarget.value)}
                    style={{ resize: "vertical", minHeight: 84, fontFamily: "inherit", marginTop: 8, width: "100%" }}
                  />
                ) : null}
              </div>

              {directError ? (
                <div role="alert" className="tk-cd-alert" style={{ marginTop: 12 }}>
                  {directError}
                </div>
              ) : null}
              {job.phase === "failed" ? (
                <div role="alert" className="tk-cd-alert" style={{ marginTop: 12 }}>
                  <b>Something went wrong: </b>
                  {job.error ?? "Generation failed."}
                </div>
              ) : null}
              {planning.error ? (
                <div role="alert" className="tk-cd-alert" style={{ marginTop: 12 }}>
                  <b>Planning failed: </b>
                  {planning.error}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
