import assert from "node:assert/strict";
import { DemoProjectSchema, PROJECT_SCHEMA_VERSION, type DemoProject } from "@tinker/project-schema";
import { applyEditDecisionList } from "./applyEditDecisionList.js";
import { buildEditDecisionList } from "./editDecisionList.js";
import type { ActionTrace } from "@tinker/browser-capture";

function baseProject(): DemoProject {
  return DemoProjectSchema.parse({
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: "p1",
    title: "Demo",
    duration: 8,
    fps: 25,
    aspectRatio: "16:9",
    createdAt: "2026-06-18T00:00:00.000Z",
    updatedAt: "2026-06-18T00:00:00.000Z",
    assets: [{ id: "vid", uri: "capture/videos/main.webm", type: "video", source: "captured" }],
    tracks: [
      {
        id: "t1",
        type: "video",
        name: "Capture",
        clips: [{ id: "c1", assetId: "vid", start: 0, end: 8, sourceStart: 0, sourceEnd: 8 }],
      },
    ],
    zooms: [
      // A zoom on the late interaction at ~5s (after the big dead gap) — should shift earlier.
      { id: "z1", start: 5.0, end: 6.0, target: { x: 500, y: 300, width: 160, height: 44 }, easing: "easeInOut" },
    ],
    cursorEvents: [{ id: "e1", time: 5.0, type: "click", x: 580, y: 322 }],
  });
}

// Trace driving the EDL: nav at 0-0.2, click at 1.5, a BIG gap, click-2 at 5.0; total 8s
// (so trailing 8-5.1 = 2.9s dead time too).
const trace: ActionTrace = {
  version: 1,
  targetUrl: "https://example.test/",
  viewport: { width: 1280, height: 720 },
  fps: 25,
  startedAt: "2026-06-18T00:00:00.000Z",
  completedAt: "2026-06-18T00:00:08.000Z",
  actions: [
    { id: "navigation-1", type: "navigation", status: "success", startTime: 0, endTime: 0.2 },
    { id: "click-1", type: "click", status: "success", startTime: 1.5, endTime: 1.6 },
    { id: "click-2", type: "click", status: "success", startTime: 5.0, endTime: 5.1 },
  ],
};

const edl = buildEditDecisionList(trace);
assert.ok(edl.cuts.length >= 1, "fixture should yield cuts");

const trimmed = applyEditDecisionList(baseProject(), edl);
DemoProjectSchema.parse(trimmed);

// Timeline got shorter by the removed dead time.
assert.ok(trimmed.duration < 8, `trimmed duration ${trimmed.duration} should be < 8`);
assert.ok(Math.abs(8 - edl.removedSeconds - trimmed.duration) < 0.05, "duration should drop by removedSeconds");

// The single clip was split into multiple editable kept-segments, contiguous on the timeline.
const clips = trimmed.tracks[0].clips;
assert.ok(clips.length >= 2, `expected the clip to split into kept segments, got ${clips.length}`);
let cursor = 0;
for (const clip of clips) {
  assert.equal(clip.assetId, "vid", "segments reference the same source asset");
  assert.ok(Math.abs(clip.start - cursor) < 1e-6, "segments are laid end to end with no timeline gap");
  assert.ok((clip.sourceEnd ?? 0) > (clip.sourceStart ?? 0), "each segment trims a real source window");
  cursor = clip.end;
}
assert.ok(Math.abs(cursor - trimmed.duration) < 1e-6, "last segment ends at the new duration");

// The late zoom (5.0s) shifted earlier by the dead time removed before it, and stays in bounds.
const z = trimmed.zooms[0];
assert.ok(z.start < 5.0, `zoom should shift earlier, was 5.0 now ${z.start}`);
assert.ok(z.end <= trimmed.duration + 1e-6, "zoom stays within the trimmed duration");
assert.ok(z.end > z.start, "zoom keeps positive length");
// Cursor event remapped the same way.
assert.ok(trimmed.cursorEvents[0].time < 5.0, "cursor event shifted earlier too");

// No-op safety: an EDL with no cuts returns the project unchanged (same reference contents).
const noCuts = buildEditDecisionList({
  ...trace,
  completedAt: "2026-06-18T00:00:01.500Z",
  actions: [
    { id: "click-1", type: "click", status: "success", startTime: 0.2, endTime: 0.4 },
    { id: "click-2", type: "click", status: "success", startTime: 0.6, endTime: 0.8 },
  ],
});
assert.equal(noCuts.cuts.length, 0);
const unchanged = applyEditDecisionList(baseProject(), noCuts);
assert.equal(unchanged.duration, 8, "no cuts → duration unchanged");
assert.equal(unchanged.tracks[0].clips.length, 1, "no cuts → clip not split");

console.log("applyEditDecisionList.test PASS");
