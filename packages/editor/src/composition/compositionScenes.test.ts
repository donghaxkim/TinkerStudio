import { describe, expect, it } from "vitest";
import { readSceneClipsFromDocument } from "./compositionTimelineModel.js";

function docFrom(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("readSceneClipsFromDocument", () => {
  it("reads scene clips from a flat composition's DOM sections (the real pipeline shape)", () => {
    const doc = docFrom(`
      <main data-composition-id="longcut-demo">
        <section class="scene clip" id="s1" data-start="0" data-duration="5"></section>
        <section class="scene clip" id="s2" data-start="4.6" data-duration="4.2"></section>
        <section class="scene clip" id="s3" data-start="8.4" data-duration="7"></section>
        <section class="scene clip" id="s4" data-start="15" data-duration="5"></section>
      </main>
    `);

    const clips = readSceneClipsFromDocument(doc, "longcut-demo");

    expect(clips).toHaveLength(4);
    expect(clips[0]).toMatchObject({ id: "s1", start: 0, end: 5 });
    expect(clips[1]).toMatchObject({ id: "s2", start: 4.6, end: 8.8 });
    expect(clips[3]).toMatchObject({ id: "s4", start: 15, end: 20 });
  });

  it("prefers a human data-label, falling back to Scene N", () => {
    const doc = docFrom(`
      <main data-composition-id="c">
        <section class="scene" id="s1" data-start="0" data-duration="6" data-label="Open dashboard"></section>
        <section class="scene" id="s2" data-start="6" data-duration="7"></section>
      </main>
    `);

    const clips = readSceneClipsFromDocument(doc, "c");
    expect(clips[0]!.label).toBe("Open dashboard");
    expect(clips[1]!.label).toBe("Scene 2");
  });

  it("reads the sole composition root when no id is given", () => {
    const doc = docFrom(`
      <main data-composition-id="only">
        <section class="scene" data-start="0" data-duration="3"></section>
      </main>
    `);
    expect(readSceneClipsFromDocument(doc)).toHaveLength(1);
  });

  it("returns no clips when the requested composition is absent or has no scenes", () => {
    const doc = docFrom(`<main data-composition-id="a"></main>`);
    expect(readSceneClipsFromDocument(doc, "missing")).toEqual([]);
    expect(readSceneClipsFromDocument(doc, "a")).toEqual([]);
  });

  it("ignores sections with a non-numeric or missing start", () => {
    const doc = docFrom(`
      <main data-composition-id="c">
        <section class="scene" data-start="nope" data-duration="2"></section>
        <section class="scene" data-start="1" data-duration="2"></section>
      </main>
    `);
    const clips = readSceneClipsFromDocument(doc, "c");
    expect(clips).toHaveLength(1);
    expect(clips[0]).toMatchObject({ start: 1, end: 3 });
  });
});
