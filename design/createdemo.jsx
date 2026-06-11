// Tinker Studio — "New demo" start screen, v2 (porcelain, minimal).
// One chat composer: attach a repo, say what the video should be. Tinker
// replies with a drafted cut you can take into the editor.

// ------------------------------------------------------------ fake analysis

const CD2_FEATURE_SETS = [
  { match: /board|kanban|task|drift|stand/i, features: ["Auto-standup board", "Drag & drop columns", "Invite teammates"] },
  { match: /chat|message|inbox|mail/i, features: ["Unified inbox", "Threaded replies", "Live presence"] },
  { match: /doc|note|write|wiki/i, features: ["Realtime editing", "Comments & mentions", "Publish to web"] },
  { match: /.*/, features: ["Onboarding flow", "Main dashboard", "Share & export"] },
];

function cd2ParseRepo(raw) {
  const t = raw.trim().replace(/^https?:\/\//, "").replace(/^(www\.)?github\.com\//, "").replace(/\.git$/, "").replace(/\/+$/, "");
  const m = t.match(/^([\w.-]+)\/([\w.-]+)$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

function cd2Fmt(s) {
  const m = Math.floor(s / 60), ss = Math.round(s % 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
}

function cd2Storyboard(repo) {
  const name = repo.split("/")[1];
  const features = CD2_FEATURE_SETS.find((s) => s.match.test(name)).features;
  const len = 60, hook = 9, cta = 8;
  const per = (len - hook - cta) / features.length;
  const scenes = [{ name: "Open on the problem", start: 0 }];
  let t = hook;
  features.forEach((f) => { scenes.push({ name: f, start: t }); t += per; });
  scenes.push({ name: `Wrap-up — try ${name}`, start: t });
  return { scenes, len };
}

const CD2_FOLLOWUPS = [
  "Reworked it — the opening is shorter now and the first feature lands inside the first ten seconds.",
  "Done. I swapped the scene order so the strongest moment comes right after the hook.",
  "Adjusted — tightened the pacing and gave the wrap-up a beat more room.",
];

// typewriter examples — ghost-typed inside the empty composer
const CD2_GHOSTS = [
  "A 60s launch video — open on the messy standup, end on the invite flow…",
  "Quick tour for the changelog — three features, fast cuts, end on the CTA…",
  "Something calm for the landing page — one feature, let it breathe…",
];

function CD2Ghost({ active, color }) {
  const [txt, setTxt] = React.useState("");
  React.useEffect(() => {
    if (!active) { setTxt(""); return; }
    let i = 0, pos = 0, dir = 1, timer;
    const tick = () => {
      const s = CD2_GHOSTS[i % CD2_GHOSTS.length];
      pos += dir;
      setTxt(s.slice(0, pos));
      let delay = dir > 0 ? 32 + Math.random() * 36 : 11;
      if (dir > 0 && pos >= s.length) { dir = -1; delay = 2200; }
      if (dir < 0 && pos <= 0) { dir = 1; i++; delay = 500; }
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, 600);
    return () => clearTimeout(timer);
  }, [active]);
  if (!active) return null;
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, padding: "10px 10px 4px", fontSize: 13, lineHeight: 1.55, color: color, pointerEvents: "none", whiteSpace: "pre-wrap", overflow: "hidden" }}>
      {txt}<span className="tk-caret"></span>
    </div>
  );
}

// ------------------------------------------------------------------- screen

function CreateDemo({ theme }) {
  const v = theme;
  const [repoDraft, setRepoDraft] = React.useState("");
  const [repoShake, setRepoShake] = React.useState(false);
  const [repoFocus, setRepoFocus] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
  const [verified, setVerified] = React.useState(null); // parsed "owner/repo" once “validated”
  const [draft, setDraft] = React.useState("");
  const [taFocus, setTaFocus] = React.useState(false);
  const [messages, setMessages] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [followIdx, setFollowIdx] = React.useState(0);
  const repoInputRef = React.useRef(null);
  const taRef = React.useRef(null);
  const endRef = React.useRef(null);

  const repo = verified; // only a verified repo counts

  // verify the pasted repo — brief loading, then a check
  React.useEffect(() => {
    const parsed = cd2ParseRepo(repoDraft);
    if (!parsed) { setVerifying(false); setVerified(null); return; }
    if (parsed === verified) return;
    setVerified(null);
    setVerifying(true);
    const id = setTimeout(() => { setVerified(parsed); setVerifying(false); }, 1100);
    return () => clearTimeout(id);
  }, [repoDraft]);

  // the repo is the front door — focus it first
  React.useEffect(() => {
    if (repoInputRef.current) repoInputRef.current.focus();
  }, []);

  React.useEffect(() => {
    const el = endRef.current;
    if (el && el.parentNode) el.parentNode.scrollTop = el.parentNode.scrollHeight;
  }, [messages, busy]);

  const requireRepo = () => {
    setRepoShake(true);
    setTimeout(() => setRepoShake(false), 450);
    if (repoInputRef.current) repoInputRef.current.focus();
  };

  const send = (text) => {
    const t = (text || draft).trim();
    if (busy) return;
    if (!repo) { requireRepo(); return; }
    if (!t) return;
    setDraft("");
    const first = messages.length === 0;
    setMessages((m) => [...m, { role: "user", text: t }]);
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      if (first) {
        const sb = cd2Storyboard(repo);
        setMessages((m) => [...m, {
          role: "ai",
          text: `Read through ${repo} — here's the cut I'd make. ${sb.scenes.length} scenes, about a minute.`,
          storyboard: sb,
        }]);
      } else {
        const sb = cd2Storyboard(repo);
        setMessages((m) => [...m, { role: "ai", text: CD2_FOLLOWUPS[followIdx % CD2_FOLLOWUPS.length], storyboard: sb }]);
        setFollowIdx((i) => i + 1);
      }
    }, 1500);
  };

  const empty = messages.length === 0;

  const vars = {
    "--tk-accent": v.accent, "--tk-accent-text": v.accentText, "--tk-accent-soft": v.accentSoft, "--tk-accent-line": v.accentLine,
    "--tk-text": v.text, "--tk-text-sec": v.textSec, "--tk-text-ter": v.textTer,
    "--tk-btn-bg": v.btnBg, "--tk-btn-border": v.btnBorder, "--tk-hover": v.hoverBg,
    "--tk-border": v.border, "--tk-radius-sm": `${v.radiusSm}px`, "--tk-card": v.cardBg,
    "--tk-mono": v.mono,
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", background: v.appBg, fontFamily: v.font, color: v.text, overflow: "hidden", ...vars }} data-screen-label="New demo">
      <div style={{ width: "100%", maxWidth: 580, flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: empty ? "center" : "flex-end", padding: "0 24px", boxSizing: "border-box" }}>

        {/* hero — only before the first message */}
        {empty && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: "-0.025em" }}>Tinker <span style={{ fontWeight: 400, color: v.textSec }}>Studio</span></h1>
            <p style={{ margin: "7px 0 0", fontSize: 13.5, color: v.textSec, textAlign: "center", letterSpacing: "-0.01em" }}>Paste your repo, get the demo video.</p>
          </div>
        )}

        {/* thread */}
        {!empty && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, padding: "32px 2px 18px" }}>
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} style={{ alignSelf: "flex-end", maxWidth: "85%", background: v.accentSoft, border: `1px solid ${v.accentLine}`, fontSize: 13, lineHeight: 1.55, padding: "8px 13px", borderRadius: `${v.radiusSm + 4}px ${v.radiusSm + 4}px 4px ${v.radiusSm + 4}px` }}>{m.text}</div>
              ) : (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: "92%" }}>
                  <div style={{ fontSize: 13, lineHeight: 1.6 }}>{m.text}</div>
                  {m.storyboard && (
                    <div style={{ background: v.cardBg, border: `1px solid ${v.border}`, borderRadius: v.radiusSm + 4, boxShadow: v.shadow, overflow: "hidden" }}>
                      {m.storyboard.scenes.map((s, j) => (
                        <div key={j} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 14px", borderTop: j ? `1px solid ${v.borderSoft}` : "none" }}>
                          <span style={{ fontSize: 10, fontFamily: v.mono, color: v.textTer, width: 30, flexShrink: 0 }}>{cd2Fmt(s.start)}</span>
                          <span style={{ fontSize: 12.5, fontWeight: 500 }}>{s.name}</span>
                        </div>
                      ))}
                      <div style={{ display: "flex", alignItems: "center", padding: "9px 14px", borderTop: `1px solid ${v.borderSoft}`, background: v.panelHeaderBg }}>
                        <a href="Tinker Studio.html" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: v.accent, textDecoration: "none" }}>
                          Record &amp; open in editor
                          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7h10 M7.8 2.8 12 7l-4.2 4.2"></path></svg>
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )
            )}
            {busy && (
              <div style={{ display: "flex", gap: 4, padding: "2px 2px" }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="tk-dot" style={{ background: v.textTer, animationDelay: `${i * 0.18}s` }}></span>
                ))}
              </div>
            )}
            <div ref={endRef}></div>
          </div>
        )}

        {/* composer — repo row is structural, not an attachment */}
        <div style={{ flexShrink: 0, paddingBottom: empty ? 0 : 28 }}>
          <div className={repoShake ? "tk-shake" : ""} style={{ background: v.cardBg, border: `1px solid ${v.border}`, borderRadius: v.radiusLg - 2, boxShadow: v.islandShadow, overflow: "hidden" }}>
            {/* repo row — paste a full link; the ghost clears on click */}
            <div
              onClick={() => repoInputRef.current && repoInputRef.current.focus()}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: v.panelHeaderBg, borderBottom: `1px solid ${repoFocus ? v.accentLine : v.borderSoft}`, cursor: "text", transition: "border-color 0.15s" }}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill={repo ? v.accent : v.textSec} style={{ flexShrink: 0, transition: "fill 0.15s" }}><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"></path></svg>
              <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
                {/* ghost hint — full link; hides on focus or any input */}
                {!repoDraft && (
                  <span style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", fontSize: 12, fontFamily: v.mono, color: v.textTer, pointerEvents: "none", whiteSpace: "nowrap" }}>github.com/owner/repo</span>
                )}
                <input
                  ref={repoInputRef}
                  value={repoDraft}
                  spellCheck={false}
                  onFocus={() => setRepoFocus(true)}
                  onBlur={() => setRepoFocus(false)}
                  onChange={(e) => setRepoDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (repo && taRef.current) taRef.current.focus(); } }}
                  style={{ width: "100%", border: "none", outline: "none", background: "transparent", color: v.text, fontSize: 12, fontFamily: v.mono, padding: 0, display: "block" }}
                ></input>
              </div>
              {verifying && (
                <span title="Verifying repository" style={{ display: "inline-flex", flexShrink: 0 }}>
                  <svg className="tk-spin" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={v.textSec} strokeWidth="2" strokeLinecap="round"><path d="M8 1.5a6.5 6.5 0 1 1-6.5 6.5" opacity="0.9"></path><path d="M1.5 8A6.5 6.5 0 0 1 8 1.5" opacity="0.2"></path></svg>
                </span>
              )}
              {!verifying && repo && (
                <span title="Repository verified" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: 99, background: v.ok, color: "#fff", flexShrink: 0 }}>
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 6.5 2.8 2.8L10 3.5"></path></svg>
                </span>
              )}
            </div>
            {/* story row — ghost example types itself until you click in */}
            <div style={{ padding: "4px 6px 6px" }}>
              <div style={{ position: "relative" }}>
                <textarea
                  ref={taRef}
                  rows={2}
                  value={draft}
                  onFocus={() => setTaFocus(true)}
                  onBlur={() => setTaFocus(false)}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  style={{ width: "100%", boxSizing: "border-box", resize: "none", border: "none", outline: "none", background: "transparent", color: v.text, fontSize: 13, lineHeight: 1.55, padding: "10px 10px 4px", fontFamily: "inherit", position: "relative", zIndex: 1 }}
                ></textarea>
                <CD2Ghost active={!taFocus && !draft && empty} color={v.textTer} />
              </div>
              <div style={{ display: "flex", alignItems: "center", padding: "0 4px" }}>
                <div style={{ flex: 1 }}></div>
                <button
                  onClick={() => send()}
                  disabled={busy}
                  title={!repo ? "Enter your repo first" : "Send"}
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 99, border: "none", cursor: "pointer", background: v.accent, color: v.accentText, opacity: busy || !draft.trim() || !repo ? 0.35 : 1, transition: "opacity 0.15s" }}
                >
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M7 12V2 M2.8 6.2 7 2l4.2 4.2"></path></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CreateDemo });
