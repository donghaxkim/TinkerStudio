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
