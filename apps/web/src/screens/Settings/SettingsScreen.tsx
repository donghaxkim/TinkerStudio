import { useState } from "react";
import { LOCAL_PROJECT_STORAGE_KEY, clearProjectStorage } from "../../lib/projectStorage.js";

type SettingsStatus =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export function SettingsScreen() {
  const [status, setStatus] = useState<SettingsStatus>({ kind: "idle" });

  function resetStorage() {
    const result = clearProjectStorage();

    if (!result.ok) {
      setStatus({ kind: "error", message: result.error.message });
      return;
    }

    setStatus({ kind: "success", message: "Saved project snapshot cleared." });
  }

  return (
    <section aria-label="Settings" style={{ display: "grid", gap: 14, padding: 16, border: "1px solid #334155", borderRadius: 12, background: "#0f172a" }}>
      <div>
        <p style={{ margin: 0, color: "#60a5fa", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Settings</p>
        <h2 style={{ margin: "4px 0 0" }}>Local prototype</h2>
      </div>

      <dl style={{ display: "grid", gridTemplateColumns: "12rem minmax(0, 1fr)", gap: "8px 16px", margin: 0 }}>
        <dt style={{ color: "#94a3b8" }}>Generation mode</dt>
        <dd style={{ margin: 0 }}>Mock local client</dd>
        <dt style={{ color: "#94a3b8" }}>Project storage key</dt>
        <dd style={{ margin: 0 }}><code>{LOCAL_PROJECT_STORAGE_KEY}</code></dd>
        <dt style={{ color: "#94a3b8" }}>Default output directory</dt>
        <dd style={{ margin: 0 }}><code>generated/local-job/&lt;jobId&gt;</code></dd>
      </dl>

      <button type="button" onClick={resetStorage} style={{ justifySelf: "start", padding: "8px 12px", borderRadius: 10, border: "1px solid #334155", background: "#111827", color: "white", fontWeight: 800 }}>
        Reset saved project
      </button>

      {status.kind === "success" ? <p role="status" style={{ margin: 0, color: "#bbf7d0" }}>{status.message}</p> : null}
      {status.kind === "error" ? <p role="alert" style={{ margin: 0, color: "#fecaca" }}>{status.message}</p> : null}
    </section>
  );
}
