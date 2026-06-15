# Phase 3b-2 — Edit-method primitives (search/replace parse + fuzzy apply + structural lint) — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** The pure, CI-testable core of the diff-based edit method: parse the agent's
**search/replace blocks**, **fuzzy-apply** them to the composition `index.html`
(whitespace-tolerant, no line numbers — the research's #1 reliability lever), and a
**structural lint** that gates a revision before render. No agent, no I/O — pure
functions the 3b-4 worker composes.

**Architecture:** New `apps/api/src/edit/` dir with three pure modules:
`searchReplace.ts` (parse + apply), `compositionLint.ts` (structural checks). The
3b-4 real worker will call: `parseSearchReplaceBlocks(agentText)` →
`applySearchReplace(html, blocks)` → `lintComposition(patchedHtml)`.

**Tech stack:** TypeScript (strict), Vitest. Spec:
`docs/superpowers/specs/2026-06-14-composition-ai-edit-phase3-real-pipeline.md` (3b-2).
Research basis: Aider search/replace + flexible apply (9× fewer apply errors).

---

## File Structure
**Create:** `apps/api/src/edit/searchReplace.ts` (+ test), `apps/api/src/edit/compositionLint.ts` (+ test).
**Commands:** `pnpm --filter @tinker/api exec vitest run src/edit/...`, `pnpm --filter @tinker/api typecheck`.

---

## Task 1: `parseSearchReplaceBlocks` + `applySearchReplace` (fuzzy)

**Files:** `apps/api/src/edit/searchReplace.ts` + `searchReplace.test.ts`.

- [ ] **Step 1: Failing test** `searchReplace.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseSearchReplaceBlocks, applySearchReplace } from "./searchReplace.js";

const BLOCK = `Sure, here is the edit:
<<<<<<< SEARCH
  duration: 1.0,
=======
  duration: 2.0,
>>>>>>> REPLACE
done.`;

describe("parseSearchReplaceBlocks", () => {
  it("extracts search/replace pairs, ignoring surrounding prose + fences", () => {
    expect(parseSearchReplaceBlocks(BLOCK)).toEqual([{ search: "  duration: 1.0,", replace: "  duration: 2.0," }]);
  });
  it("extracts multiple blocks", () => {
    const t = "<<<<<<< SEARCH\na\n=======\nA\n>>>>>>> REPLACE\n<<<<<<< SEARCH\nb\n=======\nB\n>>>>>>> REPLACE";
    expect(parseSearchReplaceBlocks(t)).toEqual([{ search: "a", replace: "A" }, { search: "b", replace: "B" }]);
  });
  it("returns [] when there are no blocks", () => {
    expect(parseSearchReplaceBlocks("no edits here")).toEqual([]);
  });
});

describe("applySearchReplace", () => {
  const src = "function scene() {\n  gsap.to(box, {\n    duration: 1.0,\n    x: 100,\n  });\n}\n";
  it("applies an exact-match block", () => {
    const r = applySearchReplace(src, [{ search: "    duration: 1.0,", replace: "    duration: 2.0," }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result).toContain("duration: 2.0,");
  });
  it("fuzzy-matches despite trailing-whitespace + indentation drift", () => {
    // search has different indentation + trailing spaces vs the source
    const r = applySearchReplace(src, [{ search: "duration: 1.0,   ", replace: "duration: 3.0," }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result).toContain("duration: 3.0,");
  });
  it("returns an error when a block does not match", () => {
    const r = applySearchReplace(src, [{ search: "nonexistent line", replace: "x" }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/did not match/i);
  });
  it("refuses an empty / whitespace-only SEARCH (no silent insertion)", () => {
    expect(applySearchReplace(src, [{ search: "", replace: "X" }]).ok).toBe(false);
    expect(applySearchReplace(src, [{ search: "   ", replace: "X" }]).ok).toBe(false);
  });
  it("applies multiple blocks sequentially", () => {
    const r = applySearchReplace("a\nb\n", [{ search: "a", replace: "A" }, { search: "b", replace: "B" }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result).toBe("A\nB\n");
  });
});
```

- [ ] **Step 2: Run → FAIL.** `pnpm --filter @tinker/api exec vitest run src/edit/searchReplace.test.ts`

- [ ] **Step 3: Implement** `apps/api/src/edit/searchReplace.ts`:

```ts
export type SearchReplaceBlock = { search: string; replace: string };
export type ApplyResult = { ok: true; result: string } | { ok: false; error: string };

const SEARCH = "<<<<<<< SEARCH";
const DIVIDER = "=======";
const REPLACE = ">>>>>>> REPLACE";

/** Parse Aider-style search/replace blocks from agent text, ignoring surrounding prose/fences. */
export function parseSearchReplaceBlocks(text: string): SearchReplaceBlock[] {
  const lines = text.split("\n");
  const blocks: SearchReplaceBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i]?.trim() === SEARCH) {
      const search: string[] = [];
      const replace: string[] = [];
      i++;
      while (i < lines.length && lines[i]?.trim() !== DIVIDER) search.push(lines[i++] ?? "");
      i++; // skip divider
      while (i < lines.length && lines[i]?.trim() !== REPLACE) replace.push(lines[i++] ?? "");
      i++; // skip replace marker
      blocks.push({ search: search.join("\n"), replace: replace.join("\n") });
    } else {
      i++;
    }
  }
  return blocks;
}

/** Apply blocks to source. Exact match first, then whitespace-tolerant line matching (no line numbers). */
export function applySearchReplace(source: string, blocks: SearchReplaceBlock[]): ApplyResult {
  let current = source;
  for (let n = 0; n < blocks.length; n++) {
    const applied = applyOne(current, blocks[n]!);
    if (applied === null) {
      return { ok: false, error: `Search/replace block ${n + 1} did not match the composition source` };
    }
    current = applied;
  }
  return { ok: true, result: current };
}

function applyOne(source: string, block: SearchReplaceBlock): string | null {
  // Guard: an empty / whitespace-only SEARCH must NOT match (it would otherwise
  // insert at the top via includes("") or match a blank line) — fail cleanly instead.
  if (block.search.trim().length === 0) return null;
  // 1) exact substring
  if (source.includes(block.search)) {
    return source.replace(block.search, () => block.replace);
  }
  // 2) whitespace-tolerant, line-based: match a contiguous run of source lines whose
  //    trimmed form equals the trimmed search lines; replace that run with the replacement.
  const srcLines = source.split("\n");
  const searchLines = block.search.split("\n");
  const norm = (s: string) => s.trim();
  const needle = searchLines.map(norm);
  for (let start = 0; start + needle.length <= srcLines.length; start++) {
    let match = true;
    for (let k = 0; k < needle.length; k++) {
      if (norm(srcLines[start + k] ?? "") !== needle[k]) { match = false; break; }
    }
    if (match) {
      const replaced = [...srcLines.slice(0, start), ...block.replace.split("\n"), ...srcLines.slice(start + needle.length)];
      return replaced.join("\n");
    }
  }
  return null;
}
```

- [ ] **Step 4: Run → PASS. Step 5: typecheck + commit.**
```bash
pnpm --filter @tinker/api typecheck
git add apps/api/src/edit/searchReplace.ts apps/api/src/edit/searchReplace.test.ts
git commit -m "feat(api): search/replace block parser + fuzzy (whitespace-tolerant) applier"
```

---

## Task 2: `lintComposition` (structural pre-render guardrail)

**Files:** `apps/api/src/edit/compositionLint.ts` + `compositionLint.test.ts`.

The pre-render guardrail (the spec's NEW structural lint — `validateHyperframesArtifacts`
covers files/manifests/forbidden but NOT the timeline contract). Pure string/structural
checks (no browser): the patched HTML must still register a timeline and keep the
composition-root marker, and not be empty/truncated.

- [ ] **Step 1: Failing test** `compositionLint.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { lintComposition } from "./compositionLint.js";

const ok = `<!DOCTYPE html><html><body>
  <div data-composition-id="demo" data-width="1280" data-height="720"></div>
  <script>window.__timelines = { demo: gsap.timeline() };</script>
</body></html>`;

describe("lintComposition", () => {
  it("passes a composition that registers a timeline + has the root marker", () => {
    expect(lintComposition(ok)).toEqual({ ok: true });
  });
  it("fails when window.__timelines registration is gone", () => {
    const r = lintComposition(ok.replace("window.__timelines", "window.__nope"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.join(" ")).toMatch(/__timelines/);
  });
  it("fails when the data-composition-id root marker is gone", () => {
    const r = lintComposition(ok.replace("data-composition-id", "data-x"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.join(" ")).toMatch(/data-composition-id/);
  });
  it("fails on empty/whitespace input", () => {
    expect(lintComposition("   ").ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** `apps/api/src/edit/compositionLint.ts`:

```ts
export type LintResult = { ok: true } | { ok: false; issues: string[] };

/**
 * Structural pre-render guardrail for an edited composition. Static checks only (no
 * browser): the edit must not have removed the timeline registration or the
 * composition-root marker, and must not be empty. Complements
 * validateHyperframesArtifacts (files/manifests/forbidden) — this checks the
 * window.__timelines contract the renderer depends on.
 */
export function lintComposition(html: string): LintResult {
  const issues: string[] = [];
  if (html.trim().length === 0) issues.push("composition is empty");
  if (!html.includes("window.__timelines")) issues.push("composition no longer registers window.__timelines");
  if (!html.includes("data-composition-id")) issues.push("composition no longer has a data-composition-id root marker");
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
```

- [ ] **Step 4: Run → PASS. Step 5: typecheck + commit.**
```bash
pnpm --filter @tinker/api typecheck
git add apps/api/src/edit/compositionLint.ts apps/api/src/edit/compositionLint.test.ts
git commit -m "feat(api): structural composition lint (window.__timelines contract) pre-render guardrail"
```

---

## Self-Review (plan author)

**Spec coverage (3b-2):** search/replace parse + **fuzzy apply with no line numbers**
(Task 1 — the research's reliability lever); the **NEW structural lint** for the
`window.__timelines` contract that `validateHyperframesArtifacts` doesn't cover (Task 2,
spec §"Lint guardrail"). Both pure + CI-tested, no agent.

**Placeholder scan:** none — complete code + tests.

**Type consistency:** `SearchReplaceBlock`, `ApplyResult`, `LintResult` are
self-contained. The 3b-4 worker will consume `parseSearchReplaceBlocks` →
`applySearchReplace` → `lintComposition` in that order.

**Known limitation (documented, acceptable for v1):** the fuzzy matcher handles
trailing-whitespace + leading-indentation drift via trimmed line matching, and replaces
the first match. It does not do token-level fuzzy alignment (Aider's full hunk
re-diffing). If a block fails to match, the worker (3b-4) surfaces the error and the
user can Reprompt — consistent with the spec's self-repair/Reprompt design.

**Out of scope (later):** `buildEditPrompt` + the real `RunEdit` composing
`defaultRunOpencode` + writing the revision dir + indexing revision artifacts +
`classifyArtifact` revision support + artifacts-route revision serving (3b-4);
`HttpCompositionEditClient` + bounded replay + Reprompt UI (3b-5); export (3c).
