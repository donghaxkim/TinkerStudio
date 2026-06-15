import { describe, expect, it } from "vitest";
import { buildEditPrompt } from "./buildEditPrompt.js";

describe("buildEditPrompt", () => {
  it("includes the instruction, clip scope, search/replace format, the contract reminder, and the html", () => {
    const p = buildEditPrompt({
      instruction: "punch in on the modal",
      context: [{ kind: "clip", clipId: "scene-feature", label: "feature", start: 4.2, end: 7.8 }],
      indexHtml: "<html>__MARKER__</html>",
    });
    expect(p).toContain("punch in on the modal");
    expect(p).toContain("feature");
    expect(p).toContain("<<<<<<< SEARCH");
    expect(p).toContain(">>>>>>> REPLACE");
    expect(p).toContain("window.__timelines");
    expect(p).toContain("__MARKER__");
  });
  it("says whole-composition when context is empty", () => {
    expect(buildEditPrompt({ instruction: "x", context: [], indexHtml: "" })).toMatch(/whole composition/i);
  });
});
