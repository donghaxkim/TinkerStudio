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
