export type LintResult = { ok: true } | { ok: false; issues: string[] };

/**
 * Structural pre-render guardrail for an edited composition. Static checks only (no
 * browser): the edit must not have removed the timeline registration or the
 * composition-root marker, and must not be empty. Coarse string gate (not a parser) —
 * complements validateHyperframesArtifacts (files/manifests/forbidden) by checking the
 * window.__timelines contract the renderer depends on.
 */
export function lintComposition(html: string): LintResult {
  const issues: string[] = [];
  if (html.trim().length === 0) issues.push("composition is empty");
  if (!html.includes("window.__timelines")) issues.push("composition no longer registers window.__timelines");
  if (!html.includes("data-composition-id")) issues.push("composition no longer has a data-composition-id root marker");
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
