import assert from "node:assert/strict";
import { easedScrollPosition, scrollDurationMs } from "./smoothScroll.js";

// duration heuristic clamps to [320, 1400] and grows with distance.
assert.equal(scrollDurationMs(0, 0), 320, "no-op scroll clamps to the floor");
assert.equal(scrollDurationMs(0, 1e9), 1400, "huge scroll clamps to the ceiling");
assert.ok(scrollDurationMs(0, 800) > scrollDurationMs(0, 200), "longer scroll takes longer");

// eased position pins endpoints and hits the midpoint at t=0.5 (easeInOutCubic).
const from = { x: 0, y: 100 };
const to = { x: 0, y: 900 };
assert.deepEqual(easedScrollPosition(from, to, 0), from);
assert.deepEqual(easedScrollPosition(from, to, 1), to);
const mid = easedScrollPosition(from, to, 0.5);
assert.ok(Math.abs(mid.y - 500) < 1e-9, "easeInOutCubic is symmetric at the midpoint");

console.log("smoothScroll tests passed");
