import { useCallback, useEffect, useRef, useState } from "react";
import {
  LuArrowUp,
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuCircle,
  LuCircleCheck,
  LuGithub,
  LuGlobe,
  LuListVideo,
  LuLoaderCircle,
  LuMessageSquare,
  LuRefreshCw,
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
import { PublicGithubRepoUrlSchema } from "@tinker/generation-contract";
import { selectPrimaryVideoArtifact, type CompositionGenerationClient } from "../../lib/compositionGenerationClient.js";
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

  // PR43 intentionally validates only explicit github.com links, not owner/repo shorthand.
  if (!/^(https?:\/\/)?(www\.)?github\.com\//i.test(trimmed)) return undefined;

  let url: URL;
  try {
    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = PublicGithubRepoUrlSchema.safeParse(candidate);
    if (!parsed.success) return undefined;
    url = new URL(parsed.data);
  } catch {
    return undefined;
  }

  const pathMatch = /^\/([^/]+)\/([^/]+)$/.exec(url.pathname);
  if (pathMatch === null) return undefined;
  const owner = decodeURIComponent(pathMatch[1]);
  const repoWithGit = decodeURIComponent(pathMatch[2]);
  const repo = repoWithGit.endsWith(".git") ? repoWithGit.slice(0, -4) : repoWithGit;
  return `${owner}/${repo}`;
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

function ThoughtStream({ thoughts }: { thoughts: string[] }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="tk-cd-assistant tk-cd-msg">
      <div className="tk-cd-avatar" aria-hidden="true">
        <LuSparkles size={14} className="tk-spin-slow" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tk-cd-author">
          Tinkering<span className="tk-cd-think-timer">{elapsed}s</span>
        </div>
        <div className="tk-cd-thoughts" aria-live="polite">
          {thoughts.map((thought, index) => (
            <div key={`t-${index}`} className="tk-cd-thought">
              {thought}
            </div>
          ))}
          <div className="tk-cd-thought tk-cd-thought-live" aria-hidden="true">
            <span className="tk-dot" style={{ background: "var(--tk-accent)" }} />
            <span className="tk-dot" style={{ background: "var(--tk-accent)", animationDelay: "0.16s" }} />
            <span className="tk-dot" style={{ background: "var(--tk-accent)", animationDelay: "0.32s" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function TinkeredSummary({ seconds, thoughts }: { seconds: number | undefined; thoughts: string[] }) {
  const [open, setOpen] = useState(false);
  if (thoughts.length === 0) return null;

  const label = seconds === undefined ? "Tinkered for a few seconds" : `Tinkered for ${seconds}s`;

  return (
    <div className={`tk-cd-tinkered${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="tk-cd-tinkered-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <LuSparkles size={13} aria-hidden="true" />
        <span className="tk-cd-tinkered-label">{label}</span>
        <LuChevronDown size={14} className="tk-cd-tinkered-chevron" aria-hidden="true" />
      </button>
      {open ? (
        <div className="tk-cd-tinkered-log">
          {thoughts.map((thought, index) => (
            <div key={`th-${index}`} className="tk-cd-thought">
              {thought}
            </div>
          ))}
        </div>
      ) : null}
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
  const [planningMessage, setPlanningMessage] = useState("");
  const [footerMode, setFooterMode] = useState<"actions" | "confirm">("actions");
  const [repoShake, setRepoShake] = useState(false);
  const [planningAgent, setPlanningAgent] = useState<PlanningAgent>("opencode");

  const repoInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const thinkStartRef = useRef<number | undefined>(undefined);

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
  const thoughts = session?.thoughts ?? [];
  const [tinkerSeconds, setTinkerSeconds] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (planningBusy && !showOutline && thinkStartRef.current === undefined) {
      thinkStartRef.current = Date.now();
    }
    if (showOutline && thinkStartRef.current !== undefined) {
      setTinkerSeconds(Math.max(1, Math.round((Date.now() - thinkStartRef.current) / 1000)));
      thinkStartRef.current = undefined;
    }
  }, [planningBusy, showOutline]);

  const canPlan = !planningBusy && normalizedRepo !== undefined && normalizedProductUrl !== undefined;
  const canGenerate = !planningBusy && !jobRunning && outlineValid;
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

  const sendQuick = useCallback(
    (text: string) => {
      if (!planningBusy) planning.sendMessage(text);
    },
    [planning, planningBusy],
  );

  useEffect(() => {
    if (planningBusy) setFooterMode("actions");
  }, [planningBusy]);

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
      approvedOutline: session.outline,
    } as const;

    void job.start(request);
  }, [job, planningBusy, session]);

  const completedJob = initialCompletedJob ?? (job.phase === "completed" ? job.job : undefined);

  if (completedJob) {
    const videoArtifact = selectPrimaryVideoArtifact(completedJob);
    const repoUrl = "repoUrl" in completedJob.request ? completedJob.request.repoUrl : undefined;
    const repo = typeof repoUrl === "string" ? parseGithubRepo(repoUrl) : undefined;
    if (videoArtifact) {
      return <CompositionEditorScreen standaloneVideoUrl={videoArtifact.url} {...(repo === undefined ? {} : { repo })} onBack={onBack} />;
    }
    return (
      <div className="tk-porcelain" role="alert" style={{ padding: 24 }}>
        Generation completed but returned no published video artifact.
      </div>
    );
  }

  const messages = session?.messages ?? [];
  const generatingBar = (
    <div data-testid="composition-generating">
      <div className="tk-cd-bar">
        <i />
      </div>
      <div className="tk-cd-gen-row">
        <span className="tk-cd-gen-label">Generating your demo video, this usually takes a few minutes.</span>
        <button type="button" className="tk-btn" aria-busy="true" disabled>
          Generating...
        </button>
        <button
          type="button"
          className="tk-btn"
          onClick={() => {
            job.cancel();
            setFooterMode("actions");
          }}
        >
          Cancel
        </button>
      </div>
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
            <LuSparkles className="tk-cd-spark" size={22} aria-hidden="true" />
            Tinker <span>Studio</span>
          </h1>
          <p>Get your demo video instantly.</p>
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
              </div>

              <div className="tk-cd-body" role="log" aria-label="Planning transcript" aria-live="polite">
                {showOutline ? <TinkeredSummary seconds={tinkerSeconds} thoughts={thoughts} /> : null}

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
                  thoughts.length > 0 ? (
                    <ThoughtStream thoughts={thoughts} />
                  ) : (
                    <StageChecklist progress={session?.progress ?? []} includeWebsite={includeWebsite} repo={repoLabel} site={siteLabel} />
                  )
                ) : null}

                {planningBusy && !isInitialWork ? (
                  <div className="tk-cd-assistant tk-cd-msg">
                    <div className="tk-cd-avatar" aria-hidden="true">
                      <LuSparkles size={14} />
                    </div>
                    <div className="tk-cd-revise">
                      Revising the outline
                      <span style={{ display: "inline-flex", gap: 3 }}>
                        <span className="tk-dot" style={{ background: "var(--tk-text-ter)" }} />
                        <span className="tk-dot" style={{ background: "var(--tk-text-ter)", animationDelay: "0.16s" }} />
                        <span className="tk-dot" style={{ background: "var(--tk-text-ter)", animationDelay: "0.32s" }} />
                      </span>
                    </div>
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

              {jobRunning ? (
                <div className="tk-cd-foot tk-cd-generation-bar">{generatingBar}</div>
              ) : showOutline && !planningBusy ? (
                <div className="tk-cd-foot">
                  {footerMode === "confirm" ? (
                    <div className="tk-cd-confirm">
                      <div className="tk-cd-confirm-copy">
                        <span className="tk-cd-confirm-title">Generate this demo video?</span>
                        <span className="tk-cd-confirm-sub">
                          This runs the full capture and render and usually takes a few minutes.
                        </span>
                      </div>
                      <div className="tk-cd-confirm-actions">
                        <button type="button" className="tk-btn" onClick={() => setFooterMode("actions")}>
                          Not yet
                        </button>
                        <button type="button" className="tk-btn tk-btn-accent" onClick={startGeneration} disabled={!canGenerate}>
                          <LuSparkles size={15} aria-hidden="true" />
                          Generate video
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="tk-cd-stack">
                      <button
                        type="button"
                        className="tk-cd-stack-row tk-cd-stack-row-primary"
                        onClick={() => setFooterMode("confirm")}
                        disabled={!canGenerate}
                      >
                        <LuCircleCheck size={16} aria-hidden="true" />
                        <span className="tk-cd-stack-label">Accept &amp; generate</span>
                        <LuChevronRight size={16} className="tk-cd-stack-arrow" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="tk-cd-stack-row"
                        onClick={() => sendQuick("Tell me more about this plan - walk me through why you structured the scenes this way.")}
                      >
                        <LuMessageSquare size={16} aria-hidden="true" />
                        <span className="tk-cd-stack-label">Tell me more</span>
                        <LuChevronRight size={16} className="tk-cd-stack-arrow" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="tk-cd-stack-row"
                        onClick={() => sendQuick("Try a completely different angle for this demo.")}
                      >
                        <LuRefreshCw size={16} aria-hidden="true" />
                        <span className="tk-cd-stack-label">Try a different angle</span>
                        <LuChevronRight size={16} className="tk-cd-stack-arrow" aria-hidden="true" />
                      </button>
                      <div className="tk-cd-chatrow">
                        <textarea
                          ref={composerRef}
                          className="tk-cd-composer-input"
                          aria-label="Planning message"
                          rows={1}
                          value={planningMessage}
                          placeholder="Let's chat - tell me what to change..."
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
                          disabled={planningMessage.trim() === ""}
                        >
                          <LuArrowUp size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
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
                        startPlanning();
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
                  <LuGlobe size={16} style={{ color: normalizedProductUrl ? "var(--tk-accent)" : "var(--tk-text-sec)" }} />
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
                        startPlanning();
                      }
                    }}
                  />
                </div>
                {normalizedProductUrl ? (
                  <span className="tk-cd-check" aria-label="valid product URL">
                    <LuCircleCheck size={16} />
                  </span>
                ) : null}
              </div>

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
                    <label className="tk-cd-agent">
                      Planning agent
                      <select
                        aria-label="Planning agent"
                        value={planningAgent}
                        onChange={(event) => setPlanningAgent(event.currentTarget.value as PlanningAgent)}
                        disabled={planningBusy}
                      >
                        <option value="opencode">OpenCode</option>
                        <option value="claude">Claude Code</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      className="tk-cd-submit"
                      onClick={startPlanning}
                      disabled={!canPlan}
                      aria-label="Plan demo"
                      title="Plan demo"
                    >
                      <LuArrowUp size={16} aria-hidden="true" />
                    </button>
                  </>
                )}
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
