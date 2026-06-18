import assert from "node:assert/strict";
import type { ActionTrace } from "@tinker/browser-capture";
import { EditDecisionListSchema, buildEditDecisionList } from "./editDecisionList.js";

// A trace with: a long lead-in (0 -> 1.2s), a snappy gap (no cut), a big mid gap
// (1.5 -> 4.0 = 2.5s), and trailing dead time.
const trace: ActionTrace = {
  version: 1,
  targetUrl: "https://example.test/",
  viewport: { width: 1280, height: 720 },
  fps: 25,
  startedAt: "2026-06-17T00:00:00.000Z",
  completedAt: "2026-06-17T00:00:08.000Z", // 8s total
  actions: [
    { id: "navigation-1", type: "navigation", status: "success", startTime: 1.2, endTime: 1.4 },
    { id: "click-1", type: "click", status: "success", startTime: 1.5, endTime: 1.6 }, // 0.1s gap → no cut
    { id: "click-2", type: "click", status: "success", startTime: 4.0, endTime: 4.2 }, // 2.4s gap → cut
    // trailing: 8.0 - 4.2 = 3.8s → cut
  ],
};

const edl = buildEditDecisionList(trace);
EditDecisionListSchema.parse(edl);
assert.equal(edl.version, 1);
assert.equal(edl.gapThresholdSeconds, 0.8);
assert.equal(edl.sourceDurationSeconds, 8);

// Dead gaps detected: lead-in, the 2.4s mid gap, and the trailing dead time. NOT the 0.1s gap.
const kinds = edl.cuts.map((cut) => cut.kind);
assert.ok(kinds.includes("trim-lead"), "should trim the 1.2s lead-in");
assert.ok(kinds.includes("compress-gap"), "should compress the 2.4s mid gap");
assert.ok(kinds.includes("trim-tail"), "should trim the trailing dead time");

// Every cut targets a gap that actually exceeds the threshold...
for (const cut of edl.cuts) {
  assert.ok(cut.originalGapSeconds > 0.8, `cut ${cut.id} should only fire on a >0.8s gap, got ${cut.originalGapSeconds}`);
  // ...and is compressed into the 0.25-0.5s band, never longer than the original.
  assert.ok(
    cut.compressedGapSeconds >= 0.25 && cut.compressedGapSeconds <= 0.5,
    `cut ${cut.id} compressed gap ${cut.compressedGapSeconds} out of [0.25,0.5]`,
  );
  assert.ok(cut.compressedGapSeconds < cut.originalGapSeconds, "compression must shorten the gap");
  assert.ok(cut.removedSeconds > 0, "a compression removes time");
}

// The snappy 0.1s gap (navigation-1 → click-1) is NOT compressed.
assert.ok(
  !edl.cuts.some((cut) => cut.afterActionId === "navigation-1" && cut.beforeActionId === "click-1"),
  "the 0.1s gap should be left alone",
);

// Compression actually shortens the timeline.
assert.ok(edl.removedSeconds > 0, "should remove dead time overall");
assert.ok(edl.compressedDurationSeconds < edl.sourceDurationSeconds, "compressed timeline is shorter");

// No dead gaps → no cuts.
const tight: ActionTrace = {
  ...trace,
  completedAt: "2026-06-17T00:00:01.400Z", // 1.4s total → trailing 1.4-0.8=0.6 < 0.8
  actions: [
    { id: "click-1", type: "click", status: "success", startTime: 0.2, endTime: 0.4 },
    { id: "click-2", type: "click", status: "success", startTime: 0.6, endTime: 0.8 },
  ],
};
const tightEdl = buildEditDecisionList(tight);
assert.equal(tightEdl.cuts.length, 0, "a tight trace yields no compression cuts");

console.log("editDecisionList.test PASS");
