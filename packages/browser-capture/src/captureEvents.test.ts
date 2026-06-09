import assert from "node:assert/strict";
import {
  createClickEvent,
  createCursorEvent,
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

console.log("captureEvents tests passed");
