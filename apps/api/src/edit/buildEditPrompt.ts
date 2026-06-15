import type { EditContextRef } from "@tinker/generation-contract";

export function buildEditPrompt(input: { instruction: string; context: EditContextRef[]; indexHtml: string }): string {
  const scope = input.context.length === 0
    ? "Apply the change to the whole composition."
    : "Scope your change to:\n" + input.context.map((c) =>
        c.kind === "clip"
          ? `- clip "${c.label ?? c.clipId ?? "scene"}" (id ${c.clipId ?? "?"}) spanning ${c.start.toFixed(1)}s–${c.end.toFixed(1)}s`
          : `- the time range ${c.start.toFixed(1)}s–${c.end.toFixed(1)}s`,
      ).join("\n");
  return [
    "You are editing an existing animated HTML composition (CSS/SVG + a GSAP timeline registered at window.__timelines, rendered to video).",
    "",
    `User instruction: ${input.instruction}`,
    "",
    scope,
    "",
    "Rules:",
    "- Respond with ONE OR MORE search/replace blocks ONLY. No prose, no explanation.",
    "- Each block MUST be exactly this shape:",
    "<<<<<<< SEARCH",
    "<exact lines to find in index.html, including full leading indentation>",
    "=======",
    "<replacement lines, including full leading indentation>",
    ">>>>>>> REPLACE",
    "- Keep the change minimal and scoped. Do NOT rewrite the whole file.",
    "- The composition MUST still register window.__timelines and keep its data-composition-id root.",
    "- Do NOT create or reference new files (no package.json, node_modules, etc.) and do not read the repository/ folder.",
    "",
    "Current index.html:",
    "```html",
    input.indexHtml,
    "```",
  ].join("\n");
}
