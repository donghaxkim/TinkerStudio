import { useCallback, useEffect, useRef, useState } from "react";
import type { DemoProject } from "@tinker/project-schema";
import { ManualFixtureCreateDemoRequestSchema } from "@tinker/generation-contract";
import type { GenerationClient } from "../../lib/generationClient.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

function cd2ParseRepo(raw: string): string | null {
  const t = raw
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^(www\.)?github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
  const m = t.match(/^([\w.-]+)\/([\w.-]+)$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

function cd2Fmt(s: number): string {
  const m = Math.floor(s / 60);
  const ss = Math.round(s % 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
}

/** Derive storyboard scene rows from a real DemoProject */
function deriveSceneRows(project: DemoProject): Array<{ name: string; start: number }> {
  const rows: Array<{ name: string; start: number }> = [];

  for (const track of project.tracks) {
    for (const clip of track.clips) {
      rows.push({
        name: clip.name ?? track.name,
        start: clip.start,
      });
    }
  }

  // Sort by start time
  rows.sort((a, b) => a.start - b.start);

  // If no clips at all, synthesise one row from project-level data
  if (rows.length === 0) {
    rows.push({ name: project.title, start: 0 });
  }

  return rows;
}

// ─── typewriter ghost ─────────────────────────────────────────────────────────

const CD2_GHOSTS = [
  "A 60s launch video — open on the messy standup, end on the invite flow…",
  "Quick tour for the changelog — three features, fast cuts, end on the CTA…",
  "Something calm for the landing page — one feature, let it breathe…",
];

function CD2Ghost({ active, color }: { active: boolean; color: string }) {
  const [txt, setTxt] = useState("");

  useEffect(() => {
    if (!active) {
      setTxt("");
      return;
    }
    let i = 0;
    let pos = 0;
    let dir = 1;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const s = CD2_GHOSTS[i % CD2_GHOSTS.length];
      pos += dir;
      setTxt(s.slice(0, pos));
      let delay = dir > 0 ? 32 + Math.random() * 36 : 11;
      if (dir > 0 && pos >= s.length) {
        dir = -1;
        delay = 2200;
      }
      if (dir < 0 && pos <= 0) {
        dir = 1;
        i++;
        delay = 500;
      }
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, 600);
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
        color,
        pointerEvents: "none",
        whiteSpace: "pre-wrap",
        overflow: "hidden",
      }}
    >
      {txt}
      <span className="tk-caret" />
    </div>
  );
}

// ─── thread message types ─────────────────────────────────────────────────────

type SceneRow = { name: string; start: number };

type UserMessage = { role: "user"; text: string };
type AiMessage = {
  role: "ai";
  text: string;
  storyboard?: { scenes: SceneRow[]; project: DemoProject };
  error?: string;
};
type ThreadMessage = UserMessage | AiMessage;

// ─── props ────────────────────────────────────────────────────────────────────

type CreateDemoScreenProps = {
  generationClient: GenerationClient;
  onProjectGenerated: (project: DemoProject) => void;
  onUseSampleProject?: () => void;
  onReturnToEditor?: () => void;
  hasInProgressProject?: boolean;
};

// ─── screen ──────────────────────────────────────────────────────────────────

export function CreateDemoScreen({
  generationClient,
  onProjectGenerated,
  onUseSampleProject,
  onReturnToEditor,
  hasInProgressProject = false,
}: CreateDemoScreenProps) {
  const [repoDraft, setRepoDraft] = useState("");
  const [repoShake, setRepoShake] = useState(false);
  const [repoFocus, setRepoFocus] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [taFocus, setTaFocus] = useState(false);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [busy, setBusy] = useState(false);

  const repoInputRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Focus repo input on mount
  useEffect(() => {
    if (repoInputRef.current) repoInputRef.current.focus();
  }, []);

  // Scroll thread to bottom
  useEffect(() => {
    const el = endRef.current;
    if (el?.parentElement) {
      el.parentElement.scrollTop = el.parentElement.scrollHeight;
    }
  }, [messages, busy]);

  // Verify repo after typing delay
  useEffect(() => {
    const parsed = cd2ParseRepo(repoDraft);
    if (!parsed) {
      setVerifying(false);
      setVerified(null);
      return;
    }
    if (parsed === verified) return;
    setVerified(null);
    setVerifying(true);
    const id = setTimeout(() => {
      setVerified(parsed);
      setVerifying(false);
    }, 1100);
    return () => clearTimeout(id);
  }, [repoDraft]); // eslint-disable-line react-hooks/exhaustive-deps

  const requireRepo = useCallback(() => {
    setRepoShake(true);
    setTimeout(() => setRepoShake(false), 450);
    if (repoInputRef.current) repoInputRef.current.focus();
  }, []);

  const send = useCallback(
    async (textOverride?: string) => {
      const t = (textOverride ?? draft).trim();
      if (busy) return;
      if (!verified) {
        requireRepo();
        return;
      }
      if (!t) return;

      const submittedPrompt = t;
      setDraft("");
      setMessages((m) => [...m, { role: "user", text: t }]);
      setBusy(true);

      // Build and validate the request
      const requestInput = {
        mode: "manual-fixture" as const,
        repoUrl: `https://github.com/${verified}`,
        prompt: t,
        durationCapSeconds: 60,
        aspectRatio: "16:9" as const,
      };

      const parsed = ManualFixtureCreateDemoRequestSchema.safeParse(requestInput);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => i.message).join("; ");
        setBusy(false);
        setDraft(submittedPrompt);
        setMessages((m) => [
          ...m,
          { role: "ai", text: "", error: `Request validation failed: ${msg}` },
        ]);
        return;
      }

      try {
        const job = await generationClient.createDemo(parsed.data);
        setBusy(false);

        if (job.status === "succeeded" && job.result && "project" in job.result) {
          const project = job.result.project as DemoProject;
          const scenes = deriveSceneRows(project);
          setMessages((m) => [
            ...m,
            {
              role: "ai",
              text: `Read through ${verified} — here's the cut I'd make. ${scenes.length} scene${scenes.length !== 1 ? "s" : ""}, about a minute.`,
              storyboard: { scenes, project },
            },
          ]);
          // Don't auto-navigate; let user click "Record & open in editor"
        } else {
          const errorMsg = job.status === "failed" && job.error ? job.error.message : "Generation failed.";
          setDraft(submittedPrompt);
          setMessages((m) => [...m, { role: "ai", text: "", error: errorMsg }]);
        }
      } catch (err) {
        setBusy(false);
        setDraft(submittedPrompt);
        setMessages((m) => [
          ...m,
          {
            role: "ai",
            text: "",
            error: err instanceof Error ? err.message : "Generation request failed",
          },
        ]);
      }
    },
    [busy, verified, draft, generationClient, requireRepo],
  );

  const empty = messages.length === 0;

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
          justifyContent: empty ? "center" : "flex-end",
          padding: "0 24px",
          boxSizing: "border-box",
        }}
      >
        {/* Hero — only before first message */}
        {empty && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              marginBottom: 28,
            }}
          >
            <h1
              style={{
                margin: 0,
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: "-0.025em",
              }}
            >
              Tinker{" "}
              <span style={{ fontWeight: 400, color: "var(--tk-text-sec)" }}>Studio</span>
            </h1>
            <p
              style={{
                margin: "7px 0 0",
                fontSize: 13.5,
                color: "var(--tk-text-sec)",
                textAlign: "center",
                letterSpacing: "-0.01em",
              }}
            >
              Paste your repo, get the demo video.
            </p>
          </div>
        )}

        {/* Thread */}
        {!empty && (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              padding: "32px 2px 18px",
            }}
          >
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div
                  key={i}
                  style={{
                    alignSelf: "flex-end",
                    maxWidth: "85%",
                    background: "var(--tk-accent-soft)",
                    border: "1px solid var(--tk-accent-line)",
                    fontSize: 13,
                    lineHeight: 1.55,
                    padding: "8px 13px",
                    borderRadius: "10px 10px 4px 10px",
                  }}
                >
                  {m.text}
                </div>
              ) : (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    maxWidth: "92%",
                  }}
                >
                  {m.error ? (
                    <div
                      role="alert"
                      style={{
                        fontSize: 13,
                        lineHeight: 1.6,
                        color: "var(--tk-text-sec)",
                        padding: "8px 12px",
                        background: "var(--tk-raised)",
                        border: "1px solid var(--tk-border)",
                        borderRadius: "var(--tk-radius-md)",
                      }}
                    >
                      <span style={{ color: "var(--tk-text)" }}>Something went wrong: </span>
                      {m.error}
                      <span style={{ display: "block", marginTop: 6, color: "var(--tk-text-ter)", fontSize: 12 }}>
                        Your repo and prompt are preserved — edit them above and try again.
                      </span>
                    </div>
                  ) : (
                    <>
                      {m.text && (
                        <div style={{ fontSize: 13, lineHeight: 1.6 }}>{m.text}</div>
                      )}
                      {m.storyboard && (
                        <div
                          style={{
                            background: "var(--tk-card)",
                            border: "1px solid var(--tk-border)",
                            borderRadius: "var(--tk-radius-md)",
                            boxShadow: "var(--tk-shadow-sm)",
                            overflow: "hidden",
                          }}
                        >
                          {m.storyboard.scenes.map((s, j) => (
                            <div
                              key={j}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 12,
                                padding: "8px 14px",
                                borderTop:
                                  j > 0 ? "1px solid var(--tk-border-soft)" : "none",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 10,
                                  fontFamily: "var(--tk-mono)",
                                  color: "var(--tk-text-ter)",
                                  width: 30,
                                  flexShrink: 0,
                                }}
                              >
                                {cd2Fmt(s.start)}
                              </span>
                              <span style={{ fontSize: 12.5, fontWeight: 500 }}>
                                {s.name}
                              </span>
                            </div>
                          ))}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              padding: "9px 14px",
                              borderTop: "1px solid var(--tk-border-soft)",
                              background: "var(--tk-raised)",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (m.storyboard) {
                                  onProjectGenerated(m.storyboard.project);
                                }
                              }}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                color: "var(--tk-accent)",
                                textDecoration: "none",
                                background: "none",
                                border: "none",
                                padding: 0,
                                cursor: "pointer",
                                fontFamily: "inherit",
                              }}
                            >
                              Record &amp; open in editor
                              <svg
                                width="11"
                                height="11"
                                viewBox="0 0 14 14"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.7"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M2 7h10 M7.8 2.8 12 7l-4.2 4.2" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ),
            )}

            {/* Typing dots */}
            {busy && (
              <div style={{ display: "flex", gap: 4, padding: "2px 2px" }}>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="tk-dot"
                    style={{
                      background: "var(--tk-text-ter)",
                      animationDelay: `${i * 0.18}s`,
                    }}
                  />
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}

        {/* Composer island */}
        <div style={{ flexShrink: 0, paddingBottom: empty ? 0 : 28 }}>
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
            {/* Repo row */}
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
              {/* GitHub mark */}
              <svg
                width="15"
                height="15"
                viewBox="0 0 16 16"
                fill={verified ? "var(--tk-accent)" : "var(--tk-text-sec)"}
                style={{ flexShrink: 0, transition: "fill 0.15s" }}
              >
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
              </svg>

              {/* Input + ghost hint */}
              <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
                {!repoDraft && (
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
                )}
                <input
                  ref={repoInputRef}
                  aria-label="GitHub repo URL"
                  value={repoDraft}
                  spellCheck={false}
                  onFocus={() => setRepoFocus(true)}
                  onBlur={() => setRepoFocus(false)}
                  onChange={(e) => setRepoDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (verified && taRef.current) taRef.current.focus();
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

              {/* Spinner while verifying */}
              {verifying && (
                <span title="Verifying repository" style={{ display: "inline-flex", flexShrink: 0 }}>
                  <svg
                    className="tk-spin"
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="var(--tk-text-sec)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M8 1.5a6.5 6.5 0 1 1-6.5 6.5" opacity="0.9" />
                    <path d="M1.5 8A6.5 6.5 0 0 1 8 1.5" opacity="0.2" />
                  </svg>
                </span>
              )}

              {/* Green check when verified */}
              {!verifying && verified && (
                <span
                  title="Repository verified"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 16,
                    height: 16,
                    borderRadius: 99,
                    background: "var(--tk-ok)",
                    color: "#fff",
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
              )}
            </div>

            {/* Story row */}
            <div style={{ padding: "4px 6px 6px" }}>
              <div style={{ position: "relative" }}>
                <textarea
                  ref={taRef}
                  aria-label="Demo prompt"
                  rows={2}
                  value={draft}
                  onFocus={() => setTaFocus(true)}
                  onBlur={() => setTaFocus(false)}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
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
                <CD2Ghost
                  active={!taFocus && !draft && empty}
                  color="var(--tk-text-ter)"
                />
              </div>

              {/* Send row */}
              <div
                style={{ display: "flex", alignItems: "center", padding: "0 4px" }}
              >
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={busy || !draft.trim() || !verified}
                  title={!verified ? "Enter your repo first" : "Send"}
                  className="tk-send"
                  style={{
                    opacity: busy || !draft.trim() || !verified ? 0.35 : 1,
                  }}
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
              </div>
            </div>
          </div>

          {/* Quiet affordance links */}
          {empty && (onUseSampleProject || (hasInProgressProject && onReturnToEditor)) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
                marginTop: 14,
                flexWrap: "wrap",
              }}
            >
              {onUseSampleProject && (
                <button
                  type="button"
                  onClick={onUseSampleProject}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    fontSize: 12,
                    color: "var(--tk-text-ter)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textDecoration: "underline",
                    textDecorationColor: "transparent",
                    transition: "color 0.15s, text-decoration-color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = "var(--tk-text-sec)";
                    (e.currentTarget as HTMLButtonElement).style.textDecorationColor = "var(--tk-text-sec)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = "var(--tk-text-ter)";
                    (e.currentTarget as HTMLButtonElement).style.textDecorationColor = "transparent";
                  }}
                >
                  or start from a sample project
                </button>
              )}
              {hasInProgressProject && onReturnToEditor && (
                <button
                  type="button"
                  onClick={onReturnToEditor}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    fontSize: 12,
                    color: "var(--tk-text-ter)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textDecoration: "underline",
                    textDecorationColor: "transparent",
                    transition: "color 0.15s, text-decoration-color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = "var(--tk-text-sec)";
                    (e.currentTarget as HTMLButtonElement).style.textDecorationColor = "var(--tk-text-sec)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = "var(--tk-text-ter)";
                    (e.currentTarget as HTMLButtonElement).style.textDecorationColor = "transparent";
                  }}
                >
                  Return to editor
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
