import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
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
  LuUpload,
} from "react-icons/lu";
import type {
  ApiGenerationJob,
  DemoOutline,
  PlanningAgent,
  PlanningProgressEntry,
  PlanningProgressStatus,
  PlanningStage,
} from "@tinker/generation-contract";
import type { TimelineRegistryWindow } from "@tinker/editor";
import type { CompositionEditClient } from "../../lib/compositionEditClient.js";
import type { CompositionGenerationClient } from "../../lib/compositionGenerationClient.js";
import type { CompositionImportClient } from "../../lib/compositionImportClient.js";
import type { CompositionPlanningClient } from "../../lib/compositionPlanningClient.js";
import { selectCanonicalBundleFiles } from "../../lib/bundleFiles.js";
import { useCompositionGenerationJob } from "../../lib/useCompositionGenerationJob.js";
import { useCompositionPlanningSession } from "../../lib/useCompositionPlanningSession.js";
import { CompositionEditorScreen } from "./CompositionEditorScreen.js";

const PREVIEW_COMPOSITION_URL = "/demo-composition/index.html";

export type CompositionDemoScreenProps = {
  client: CompositionGenerationClient;
  planningClient: CompositionPlanningClient;
  editClient?: CompositionEditClient;
  /** Enables the "Edit an existing demo" upload flow when provided. */
  importClient?: CompositionImportClient;
  /** Optional: render a Back button that calls this. */
  onBack?: () => void;
  /** Test seam forwarded to CompositionEditorScreen. */
  resolveWindow?: (iframe: HTMLIFrameElement) => TimelineRegistryWindow | null | undefined;
  initialCompletedJob?: ApiGenerationJob;
};

function parseGithubRepo(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;

  // Require an explicit github.com link — shorthand like "owner/repo" no longer counts,
  // so the field only validates (blue icon + checkmark) once github.com is in the link.
  if (!/^(https?:\/\/)?(www\.)?github\.com\//i.test(trimmed)) return undefined;

  let path: string;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return undefined;
    path = url.pathname;
  } catch {
    return undefined;
  }

  const [owner, repoWithGit] = path.replace(/^\/+/, "").split("/").filter(Boolean);
  const repo = repoWithGit?.replace(/\.git$/, "");
  return owner && repo && /^[\w.-]+$/.test(owner) && /^[\w.-]+$/.test(repo) ? `${owner}/${repo}` : undefined;
}

/** Recursively reads a dropped folder entry into a flat list of files with their relative paths. */
function walkEntry(entry: FileSystemEntry, prefix: string, out: Array<{ relativePath: string; file: File }>): Promise<void> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      (entry as FileSystemFileEntry).file(
        (file) => {
          out.push({ relativePath: `${prefix}${entry.name}`, file });
          resolve();
        },
        () => resolve(),
      );
    });
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  return new Promise((resolve) => {
    reader.readEntries(
      (entries) => {
        void Promise.all(entries.map((child) => walkEntry(child, `${prefix}${entry.name}/`, out))).then(() => resolve());
      },
      () => resolve(),
    );
  });
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

// Live agent thought-stream shown while the planner is thinking: scripted reasoning
// lines stream in one at a time, with a running timer, until the outline is ready.
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

// Collapsed "Tinkered for Xs" disclosure shown once the outline is ready; clicking it
// reveals the full reasoning history the planner streamed while thinking.
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

export function CompositionDemoScreen({
  client,
  planningClient,
  editClient,
  importClient,
  onBack,
  resolveWindow,
  initialCompletedJob,
}: CompositionDemoScreenProps) {
  const job = useCompositionGenerationJob(client);
  const planning = useCompositionPlanningSession(planningClient);
  const [showEmptyEditor, setShowEmptyEditor] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [importedJob, setImportedJob] = useState<ApiGenerationJob | undefined>(undefined);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | undefined>(undefined);
  const [repoDraft, setRepoDraft] = useState("");
  const [productDraft, setProductDraft] = useState("");
  const [directError, setDirectError] = useState<string | undefined>(undefined);
  const [planningMessage, setPlanningMessage] = useState("");
  // Drives the planning footer once a plan is ready: the stacked action list (which
  // includes the inline "let's chat" input), or the final "ready to generate?" confirm.
  const [footerMode, setFooterMode] = useState<"actions" | "confirm">("actions");
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
  const thoughts = session?.thoughts ?? [];

  // Track how long the planner "tinkered" so the collapsed summary can report it.
  const thinkStartRef = useRef<number | undefined>(undefined);
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
    planning.start({
      repoUrl: `https://github.com/${repo}`,
      productUrl,
      agent: planningAgent,
    });
  }, [planning, planningAgent, productDraft, repoDraft, requireRepo]);

  const submitMessage = useCallback(() => {
    const message = planningMessage.trim();
    if (message === "" || planningBusy) return;
    planning.sendMessage(message);
    setPlanningMessage("");
  }, [planning, planningBusy, planningMessage]);

  // Fires a canned suggestion (Tell me more / Try a different angle) as the user's turn.
  const sendQuick = useCallback(
    (text: string) => {
      if (!planningBusy) planning.sendMessage(text);
    },
    [planning, planningBusy],
  );

  // Each new agent turn returns the footer to the stacked action list.
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
      renderer: "playwright",
    } as const;

    void job.start(request);
  }, [job, planningBusy, session]);

  const startImport = useCallback(
    (collected: Array<{ relativePath: string; file: File }>) => {
      if (importClient === undefined) return;
      const selected = selectCanonicalBundleFiles(collected);
      if (selected.length === 0) {
        setImportError("Couldn't find hyperframes/index.html in that folder. Pick the generated demo folder.");
        return;
      }
      setImportBusy(true);
      setImportError(undefined);
      void importClient
        .importComposition(selected.map((s) => ({ relativePath: s.relativePath, data: s.source.file })))
        .then((imported) => setImportedJob(imported))
        .catch((error: unknown) => setImportError(error instanceof Error ? error.message : String(error)))
        .finally(() => setImportBusy(false));
    },
    [importClient],
  );

  const handleImportFiles = useCallback(
    (fileList: FileList | null) => {
      if (fileList === null) return;
      startImport(Array.from(fileList).map((file) => ({ relativePath: file.webkitRelativePath || file.name, file })));
    },
    [startImport],
  );

  const handleImportDrop = useCallback(
    async (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      if (importBusy) return;
      const entries = Array.from(event.dataTransfer.items)
        .map((item) => item.webkitGetAsEntry())
        .filter((entry): entry is FileSystemEntry => entry !== null);
      const collected: Array<{ relativePath: string; file: File }> = [];
      await Promise.all(entries.map((entry) => walkEntry(entry, "", collected)));
      startImport(collected);
    },
    [importBusy, startImport],
  );

  // "Edit an existing demo" lands the user directly in the editor shell. The preview/video
  // stage IS the dropzone — they drag the generated demo folder onto exactly where the video
  // will appear, and on import the real editor loads in place.
  if (showUpload && importedJob === undefined) {
    return (
      <div className="tk-porcelain tk-composition-shell" aria-label="Edit an existing demo">
        <header className="tk-composition-header">
          <button
            type="button"
            onClick={() => {
              if (importBusy) return;
              setShowUpload(false);
              setImportError(undefined);
            }}
            disabled={importBusy}
            aria-label="Back to create"
            title="Back to create"
            style={{
              display: "inline-flex",
              alignItems: "baseline",
              gap: 6,
              border: "none",
              background: "transparent",
              padding: "4px 2px",
              borderRadius: "var(--tk-radius-sm)",
              cursor: importBusy ? "default" : "pointer",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--tk-text)" }}>Tinker</span>
            <span style={{ fontSize: 14, fontWeight: 400, color: "var(--tk-text-sec)" }}>Studio</span>
          </button>
          <div className="tk-composition-status" aria-label="Editor status">
            {importBusy ? "Importing demo…" : "Drop a demo to edit"}
          </div>
          <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>
            <button type="button" className="tk-btn tk-btn-accent" aria-label="Export" title="Import a demo to export" disabled>
              Export
            </button>
          </div>
        </header>

        <div className="tk-composition-body">
          <div className="tk-composition-main">
            <section aria-label="Preview stage" className="tk-composition-stage">
              <label
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => void handleImportDrop(event)}
                style={{
                  position: "absolute",
                  inset: 12,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 14,
                  padding: 24,
                  textAlign: "center",
                  border: "1.5px dashed rgba(255, 255, 255, 0.2)",
                  borderRadius: "var(--tk-radius-md)",
                  color: "rgba(255, 255, 255, 0.92)",
                  cursor: importBusy ? "default" : "pointer",
                }}
              >
                {importBusy ? (
                  <LuLoaderCircle size={28} className="tk-spin" style={{ color: "rgba(255, 255, 255, 0.55)" }} aria-hidden="true" />
                ) : (
                  <LuUpload size={28} style={{ color: "rgba(255, 255, 255, 0.55)" }} aria-hidden="true" />
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={{ fontSize: 14.5, color: "rgba(255, 255, 255, 0.92)" }}>
                    {importBusy ? "Importing demo…" : "Drag your HyperFrames demo here"}
                  </span>
                  {importBusy ? null : (
                    <span style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.5)" }}>
                      the generated folder with hyperframes/index.html and output.mp4 — or click to choose
                    </span>
                  )}
                </div>
                <input
                  aria-label="Choose demo folder"
                  type="file"
                  disabled={importBusy}
                  onChange={(event) => handleImportFiles(event.currentTarget.files)}
                  ref={(node) => {
                    if (node) {
                      node.setAttribute("webkitdirectory", "");
                      node.setAttribute("directory", "");
                    }
                  }}
                  style={{ display: "none" }}
                />
              </label>
            </section>
            {importError ? (
              <div role="alert" style={{ fontSize: 13, color: "var(--tk-text-sec)", padding: "4px 2px" }}>
                <span style={{ color: "var(--tk-text)" }}>Import failed: </span>
                {importError}
              </div>
            ) : null}
          </div>

          <aside
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 10,
              padding: 18,
              border: "1px solid var(--tk-border)",
              borderRadius: "var(--tk-radius-lg)",
              background: "var(--tk-card)",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 14, display: "inline-flex", alignItems: "center", gap: 7 }}>
              <LuSparkles size={14} style={{ color: "var(--tk-accent)" }} aria-hidden="true" />
              Edit an existing demo
            </h2>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "var(--tk-text-sec)" }}>
              Drop a HyperFrames demo you already generated onto the preview to open it here — then tighten the
              pacing, add zooms, and re-export. No re-generation needed.
            </p>
          </aside>
        </div>
      </div>
    );
  }
  if (showEmptyEditor) {
    return (
      <CompositionEditorScreen
        compositionIndexUrl={PREVIEW_COMPOSITION_URL}
        onBack={() => setShowEmptyEditor(false)}
        resolveWindow={resolveWindow}
      />
    );
  }

  const completedJob = importedJob ?? initialCompletedJob ?? (job.phase === "completed" ? job.job : undefined);

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
      const videoArtifact = completedJob.result.artifacts.find((artifact) => artifact.kind === "playwright-video");
      const repoUrl = "repoUrl" in completedJob.request ? completedJob.request.repoUrl : undefined;
      const repo = typeof repoUrl === "string" ? parseGithubRepo(repoUrl) : undefined;
      if (videoArtifact) {
        return (
          <CompositionEditorScreen
            standaloneVideoUrl={videoArtifact.url}
            {...(repo === undefined ? {} : { repo })}
            onBack={onBack}
            resolveWindow={resolveWindow}
          />
        );
      }
      return (
        <div className="tk-porcelain" role="alert" style={{ padding: 24 }}>
          Playwright generation completed but returned no preview video artifact.
        </div>
      );
    }
    return (
      <div className="tk-porcelain" role="alert" style={{ padding: 24 }}>
        Generation completed but produced no supported result to open.
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
        <button type="button" className="tk-btn" onClick={() => job.cancel()}>
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
                    {outlineValid && outline !== undefined ? (
                      <OutlineStoryboard outline={outline} />
                    ) : (
                      <div className="tk-cd-outline-empty">The agent has not produced a valid outline yet.</div>
                    )}
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
                          This runs the full capture + render and usually takes a few minutes.
                        </span>
                      </div>
                      <div className="tk-cd-confirm-actions">
                        <button type="button" className="tk-btn" onClick={() => setFooterMode("actions")}>
                          Not yet
                        </button>
                        <button
                          type="button"
                          className="tk-btn tk-btn-accent"
                          onClick={startGeneration}
                          disabled={!canGenerate}
                        >
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
                        onClick={() =>
                          sendQuick("Tell me more about this plan — walk me through why you structured the scenes this way.")
                        }
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
                          placeholder="Let's chat — tell me what to change…"
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
                      Generating your demo video — this usually takes a few minutes…
                    </span>
                    <button type="button" className="tk-btn" aria-busy="true" disabled>
                      Generating…
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

        {!isOpen ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <button type="button" className="tk-cd-shell-link" onClick={() => setShowEmptyEditor(true)}>
              Open empty editor shell
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
