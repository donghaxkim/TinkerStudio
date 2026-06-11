import { useState } from "react";
import type { CreateDemoRequest } from "@tinker/generation-contract";

type CreateDemoFormProps = {
  disabled?: boolean;
  onSubmit: (request: CreateDemoRequest) => void;
};

const fieldStyle = { display: "grid", gap: 6 };
const inputStyle = { padding: "9px 10px", borderRadius: 10, border: "1px solid #334155", background: "#020617", color: "white" };

export function CreateDemoForm({ disabled = false, onSubmit }: CreateDemoFormProps) {
  const [repoUrl, setRepoUrl] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [durationCapSeconds, setDurationCapSeconds] = useState(60);
  const [aspectRatio, setAspectRatio] = useState<CreateDemoRequest["aspectRatio"]>("16:9");

  return (
    <form
      aria-label="Create demo form"
      style={{ display: "grid", gap: 12 }}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          repoUrl,
          productUrl,
          prompt,
          durationCapSeconds,
          aspectRatio,
        });
      }}
    >
      <label style={fieldStyle}>
        GitHub repo URL
        <input style={inputStyle} value={repoUrl} disabled={disabled} onChange={(event) => setRepoUrl(event.target.value)} placeholder="https://github.com/acme/app" />
      </label>

      <label style={fieldStyle}>
        Product or local app URL
        <input style={inputStyle} value={productUrl} disabled={disabled} onChange={(event) => setProductUrl(event.target.value)} placeholder="http://localhost:5173" />
      </label>

      <label style={fieldStyle}>
        Demo prompt
        <textarea style={{ ...inputStyle, minHeight: 92 }} value={prompt} disabled={disabled} onChange={(event) => setPrompt(event.target.value)} placeholder="Show why this product is useful in 60 seconds" />
      </label>

      <label style={fieldStyle}>
        Duration cap
        <input style={inputStyle} type="number" min={1} max={600} value={durationCapSeconds} disabled={disabled} onChange={(event) => setDurationCapSeconds(Number(event.target.value))} />
      </label>

      <label style={fieldStyle}>
        Aspect ratio
        <select style={inputStyle} value={aspectRatio} disabled={disabled} onChange={(event) => setAspectRatio(event.target.value as CreateDemoRequest["aspectRatio"])}>
          <option value="16:9">16:9</option>
          <option value="9:16">9:16</option>
          <option value="1:1">1:1</option>
        </select>
      </label>

      <button type="submit" disabled={disabled} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #2563eb", background: disabled ? "#334155" : "#2563eb", color: "white", fontWeight: 800 }}>
        Create demo
      </button>
    </form>
  );
}
