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
