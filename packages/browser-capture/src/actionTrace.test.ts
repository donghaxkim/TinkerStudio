import assert from "node:assert/strict";
import { createActionTraceRecorder, deriveActionTraceFromCapture } from "./actionTrace.js";
import type { CapturePlan, CaptureResult } from "./types.js";

// recorder: ids increment per type; build emits a stable shape.
const recorder = createActionTraceRecorder({
  targetUrl: "https://example.test/",
  viewport: { width: 1280, height: 720 },
  fps: 25,
  startedAtMs: 1_000,
});
assert.equal(recorder.nextId("click"), "click-1");
assert.equal(recorder.nextId("click"), "click-2");
assert.equal(recorder.nextId("scroll"), "scroll-1");
recorder.record({ id: "click-1", type: "click", status: "success", startTime: 0.5, endTime: 0.6, clickPoint: { x: 4, y: 8 } });

const built = recorder.build(3_000);
assert.equal(built.version, 1);
assert.equal(built.targetUrl, "https://example.test/");
assert.equal(built.fps, 25);
assert.equal(built.actions.length, 1);
assert.equal(built.startedAt, new Date(1_000).toISOString());
assert.equal(built.completedAt, new Date(3_000).toISOString());

// deriveActionTraceFromCapture maps each step to an entry and enriches clicks from events.
const plan: CapturePlan = {
  targetUrl: "https://example.test/",
  viewport: { width: 1280, height: 720 },
  steps: [
    { type: "goto", url: "https://example.test/" },
    { type: "scroll", y: 600 },
    { type: "click", selector: "[data-testid='cta']", label: "Get started" },
  ],
  expectedCheckpoints: [],
};
const capture: CaptureResult = {
  clips: [],
  screenshots: [],
  events: [
    { time: 1.2, type: "scroll", x: 0, y: 600, deltaX: 0, deltaY: 600 },
    { time: 2.4, type: "click", x: 320, y: 240, label: "Get started" },
  ],
  checkpoints: [],
  metadata: {
    startedAt: "2026-06-09T00:00:00.000Z",
    completedAt: "2026-06-09T00:00:05.000Z",
    targetUrl: "https://example.test/",
    viewport: { width: 1280, height: 720 },
  },
};

const derived = deriveActionTraceFromCapture(plan, capture);
assert.deepEqual(
  derived.actions.map((action) => action.type),
  ["navigation", "scroll", "click"],
);
const click = derived.actions.find((action) => action.type === "click");
assert.deepEqual(click?.clickPoint, { x: 320, y: 240 });
assert.equal(click?.description, "Get started");
const scroll = derived.actions.find((action) => action.type === "scroll");
assert.deepEqual(scroll?.scrollPosition, { x: 0, y: 600 });

// ActionTraceEntry carries first-class (optional) storyboard-beat lineage fields, and they
// round-trip through JSON unchanged.
const lineageRecorder = createActionTraceRecorder({
  targetUrl: "https://example.test/",
  viewport: { width: 1280, height: 720 },
  fps: 30,
  startedAtMs: 0,
});
lineageRecorder.record({
  id: "click-1",
  type: "click",
  status: "success",
  startTime: 0.5,
  endTime: 0.6,
  beatId: "beat-2",
  intent: "Demonstrate the core flow",
});
const lineageTrace = lineageRecorder.build(1_000);
const roundTripped = JSON.parse(JSON.stringify(lineageTrace)) as typeof lineageTrace;
assert.equal(roundTripped.actions[0]?.beatId, "beat-2");
assert.equal(roundTripped.actions[0]?.intent, "Demonstrate the core flow");

console.log("actionTrace tests passed");
