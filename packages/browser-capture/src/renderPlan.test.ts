import assert from "node:assert/strict";
import type { ActionTrace } from "./actionTrace.js";
import { buildRenderPlan, clusterActions, zoomScaleForTarget } from "./renderPlan.js";

const viewport = { width: 1280, height: 720 };

// zoomScaleForTarget: tiny targets zoom harder than large ones, always within [1.2, 1.5].
const tiny = zoomScaleForTarget({ x: 0, y: 0, width: 24, height: 24 }, viewport);
const large = zoomScaleForTarget({ x: 0, y: 0, width: 900, height: 500 }, viewport);
assert.ok(tiny >= 1.2 && tiny <= 1.5, `tiny zoom in band, got ${tiny}`);
assert.ok(large >= 1.2 && large <= 1.5, `large zoom in band, got ${large}`);
assert.ok(tiny > large, "smaller targets get a tighter zoom");
assert.equal(large, 1.2, "a target filling ~half a dimension gets the minimum zoom");

// clustering: two nearby clicks merge; a far one splits off.
const nearby = clusterActions(
  [
    { id: "click-1", type: "click", status: "success", startTime: 1, endTime: 1, clickPoint: { x: 100, y: 100 } },
    { id: "click-2", type: "click", status: "success", startTime: 1.5, endTime: 1.5, clickPoint: { x: 120, y: 130 } },
    { id: "click-3", type: "click", status: "success", startTime: 6, endTime: 6, clickPoint: { x: 1100, y: 650 } },
  ],
  viewport,
  { clusterRadiusFraction: 0.22, clusterGapSeconds: 1.5 },
);
assert.equal(nearby.length, 2, "two clusters: a nearby pair and a distant single");
assert.equal(nearby[0].length, 2);
assert.equal(nearby[1].length, 1);

// full plan over a click + scroll + navigation trace.
const trace: ActionTrace = {
  version: 1,
  targetUrl: "https://example.test/",
  viewport,
  fps: 25,
  startedAt: "2026-06-09T00:00:00.000Z",
  completedAt: "2026-06-09T00:00:08.000Z",
  actions: [
    { id: "navigation-1", type: "navigation", status: "success", startTime: 0, endTime: 0.8 },
    {
      id: "scroll-1",
      type: "scroll",
      status: "success",
      startTime: 1,
      endTime: 1.6,
      scrollPosition: { x: 0, y: 600 },
    },
    {
      id: "click-1",
      type: "click",
      status: "success",
      startTime: 3,
      endTime: 3.2,
      clickPoint: { x: 320, y: 240 },
      targetBox: { x: 300, y: 220, width: 40, height: 30 },
      description: "Get started",
    },
  ],
};

const plan = buildRenderPlan(trace);
assert.equal(plan.version, 1);
assert.equal(plan.resolution.width, 1280);
assert.equal(plan.cursor.smoothing, "minimum-jerk");
assert.equal(plan.cursor.hideNativeCursor, true);

// one interaction zoom (1.2-1.5) plus one gentle scroll zoom (~1.05).
const clickZoom = plan.zoomSegments.find((segment) => segment.reason.includes("Interaction"));
assert.ok(clickZoom, "expected an interaction zoom segment");
assert.ok(clickZoom!.scale >= 1.2 && clickZoom!.scale <= 1.5);
const scrollZoom = plan.zoomSegments.find((segment) => segment.id.startsWith("scroll-zoom"));
assert.ok(scrollZoom && scrollZoom.scale > 1 && scrollZoom.scale <= 1.1, "scroll zoom is gentle");

// click ripple + holds for click (500-1000ms) and navigation (1000-1500ms).
assert.equal(plan.clickEffects.length, 1);
assert.equal(plan.clickEffects[0].effect, "ripple");
const clickHold = plan.holds.find((hold) => hold.id === "click-1-hold");
assert.ok(clickHold && clickHold.durationMs >= 500 && clickHold.durationMs <= 1000);
const navHold = plan.holds.find((hold) => hold.id === "navigation-1-hold");
assert.ok(navHold && navHold.durationMs >= 1000 && navHold.durationMs <= 1500);

// scroll segment carries the eased from/to offsets.
assert.equal(plan.scrollSegments.length, 1);
assert.deepEqual(plan.scrollSegments[0].to, { x: 0, y: 600 });

console.log("renderPlan tests passed");
