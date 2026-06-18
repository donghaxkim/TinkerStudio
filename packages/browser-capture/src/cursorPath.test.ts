import assert from "node:assert/strict";
import {
  CURSOR_MOVE_MAX_MS,
  CURSOR_MOVE_MIN_MS,
  CURSOR_POST_CLICK_HOLD_MS,
  CURSOR_PRE_CLICK_DWELL_MS,
  cubicBezier,
  cursorMoveDurationMs,
  easeInOutCubic,
  easeOutCubic,
  minimumJerk,
  sampleCursorPath,
} from "./cursorPath.js";

// minimum-jerk: pinned endpoints, symmetric, clamped, monotonic.
assert.equal(minimumJerk(0), 0);
assert.equal(minimumJerk(1), 1);
assert.ok(Math.abs(minimumJerk(0.5) - 0.5) < 1e-9, "minimum-jerk is symmetric at the midpoint");
assert.equal(minimumJerk(-1), 0, "clamps below 0");
assert.equal(minimumJerk(2), 1, "clamps above 1");
for (let i = 1; i <= 10; i += 1) {
  assert.ok(minimumJerk(i / 10) > minimumJerk((i - 1) / 10), "minimum-jerk is monotonically increasing");
}

// cubic easings: pinned endpoints + known midpoints.
assert.equal(easeInOutCubic(0), 0);
assert.equal(easeInOutCubic(1), 1);
assert.ok(Math.abs(easeInOutCubic(0.5) - 0.5) < 1e-9);
assert.equal(easeOutCubic(0), 0);
assert.equal(easeOutCubic(1), 1);

// duration heuristic (Director Mode): clamp(120 + 70*log2(d/w + 1), 120, 380).
assert.equal(cursorMoveDurationMs(0, 100), CURSOR_MOVE_MIN_MS, "tiny moves clamp to the 120ms floor");
assert.equal(cursorMoveDurationMs(1e9, 10), CURSOR_MOVE_MAX_MS, "huge moves clamp to the 380ms ceiling");
// Caps are respected for any distance/width.
for (const distance of [0, 30, 120, 400, 900, 3000, 1e6]) {
  const ms = cursorMoveDurationMs(distance, 80);
  assert.ok(ms >= CURSOR_MOVE_MIN_MS && ms <= CURSOR_MOVE_MAX_MS, `move duration ${ms} out of [120,380] caps`);
}
// A short hop stays snappy (well under the old 450ms feel).
assert.ok(cursorMoveDurationMs(40, 120) <= 180, "short hops are snappy (<=180ms)");
assert.ok(
  cursorMoveDurationMs(800, 100) > cursorMoveDurationMs(200, 100),
  "longer distance yields a longer move",
);
assert.ok(
  cursorMoveDurationMs(400, 200) < cursorMoveDurationMs(400, 50),
  "a wider target is quicker to land than a narrow one",
);

// dwell/hold defaults land inside the requested bands.
assert.ok(CURSOR_PRE_CLICK_DWELL_MS >= 60 && CURSOR_PRE_CLICK_DWELL_MS <= 120, "pre-click dwell in 60-120ms");
assert.ok(CURSOR_POST_CLICK_HOLD_MS >= 150 && CURSOR_POST_CLICK_HOLD_MS <= 250, "post-click hold in 150-250ms");

// bezier endpoints are exact.
const p0 = { x: 0, y: 0 };
const p3 = { x: 10, y: 20 };
assert.deepEqual(cubicBezier(p0, { x: 3, y: 9 }, { x: 7, y: 1 }, p3, 0), p0);
assert.deepEqual(cubicBezier(p0, { x: 3, y: 9 }, { x: 7, y: 1 }, p3, 1), p3);

// sampled path starts at `from`, ends at `to`, has monotonic progress.
const samples = sampleCursorPath({ from: { x: 5, y: 5 }, to: { x: 305, y: 205 }, steps: 12 });
assert.equal(samples.length, 13);
assert.deepEqual({ x: samples[0].x, y: samples[0].y }, { x: 5, y: 5 });
const arrival = samples[samples.length - 1];
assert.ok(Math.abs(arrival.x - 305) < 1e-9 && Math.abs(arrival.y - 205) < 1e-9, "path lands exactly on the target");
for (let i = 1; i < samples.length; i += 1) {
  assert.ok(samples[i].t > samples[i - 1].t, "progress increases monotonically");
}

console.log("cursorPath tests passed");
