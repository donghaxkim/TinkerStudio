import assert from "node:assert/strict";
import {
  createClickEvent,
  createCursorEvent,
  createCursorPathEvents,
  createScrollEvent,
  createZoomTargetEvent,
  secondsSince,
} from "./captureEvents.js";

assert.equal(secondsSince(1_000, 2_234.567), 1.235);
assert.equal(secondsSince(2_000, 2_000), 0);

assert.deepEqual(createClickEvent({ startedAtMs: 1_000, nowMs: 2_250, x: 10, y: 20, label: "Start demo" }), {
  time: 1.25,
  type: "click",
  x: 10,
  y: 20,
  label: "Start demo",
});

assert.deepEqual(createCursorEvent({ startedAtMs: 1_000, nowMs: 2_500, x: 30, y: 40 }), {
  time: 1.5,
  type: "cursor",
  x: 30,
  y: 40,
});

assert.deepEqual(createScrollEvent({ startedAtMs: 1_000, nowMs: 3_000, x: 0, y: 400, deltaX: 0, deltaY: 400 }), {
  time: 2,
  type: "scroll",
  x: 0,
  y: 400,
  deltaX: 0,
  deltaY: 400,
});

assert.deepEqual(
  createZoomTargetEvent({ startedAtMs: 1_000, nowMs: 3_500, x: 50, y: 60, width: 120, height: 32, label: "Export" }),
  {
  time: 2.5,
  type: "zoomTarget",
  x: 50,
  y: 60,
  width: 120,
  height: 32,
  label: "Export",
  },
);

// Eased cursor path ending at the action moment.
const path = createCursorPathEvents({
  startedAtMs: 1_000,
  nowMs: 1_500,
  from: { x: 0, y: 0 },
  to: { x: 100, y: 200 },
  durationMs: 400,
  stepMs: 100,
});

assert.equal(path.length, 5);
assert.deepEqual(
  path.map((event) => event.time),
  [0.1, 0.2, 0.3, 0.4, 0.5],
);
assert.deepEqual(path[0], { time: 0.1, type: "cursor", x: 0, y: 0 });
assert.deepEqual(path[1], { time: 0.2, type: "cursor", x: 13, y: 25 });
assert.deepEqual(path[2], { time: 0.3, type: "cursor", x: 50, y: 100 });
assert.deepEqual(path[4], { time: 0.5, type: "cursor", x: 100, y: 200 });

// Path start clamps to capture start while still arriving on time.
const clamped = createCursorPathEvents({
  startedAtMs: 1_000,
  nowMs: 1_200,
  from: { x: 0, y: 0 },
  to: { x: 100, y: 200 },
  durationMs: 400,
  stepMs: 100,
});

assert.equal(clamped.length, 3);
assert.equal(clamped[0]?.time, 0);
assert.deepEqual(clamped[2], { time: 0.2, type: "cursor", x: 100, y: 200 });

// Defaults produce a path dense enough for 30fps camera-follow export.
const defaults = createCursorPathEvents({
  startedAtMs: 1_000,
  nowMs: 2_000,
  from: { x: 0, y: 0 },
  to: { x: 90, y: 0 },
});

assert.equal(defaults.length, 15);
assert.equal(defaults[0]?.time, 0.55);
assert.equal(defaults[14]?.time, 1);
for (let index = 1; index < defaults.length; index += 1) {
  const previous = defaults[index - 1]!;
  const current = defaults[index]!;
  assert.ok(
    current.time - previous.time <= 1 / 30,
    `cursor sample gap must stay within 30fps, got ${current.time - previous.time}`,
  );
}

// A stationary cursor collapses to a single arrival sample.
const stationary = createCursorPathEvents({
  startedAtMs: 1_000,
  nowMs: 1_500,
  from: { x: 40, y: 40 },
  to: { x: 40, y: 40 },
});

assert.deepEqual(stationary, [{ time: 0.5, type: "cursor", x: 40, y: 40 }]);

console.log("captureEvents tests passed");
