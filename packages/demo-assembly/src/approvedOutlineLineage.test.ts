import assert from "node:assert/strict";
import type { CapturePlan } from "@tinker/browser-capture";
import type { DemoOutline } from "@tinker/generation-contract";
import type { Storyboard } from "./demoStrategy.js";
import { ApprovedOutlineLineageSchema, buildApprovedOutlineLineage } from "./approvedOutlineLineage.js";

const approvedOutline: DemoOutline = {
  title: "Approved flow",
  durationCapSeconds: 20,
  aspectRatio: "16:9",
  summary: "Follow the approved scene order.",
  scenes: [
    { id: "scene-1", goal: "Open with the problem", visual: "Show hero", evidence: ["website"] },
    { id: "scene-2", goal: "Demonstrate the workflow", visual: "Click through the UI", evidence: ["website"] },
    { id: "scene-3", goal: "Unsupported close", visual: "Show a missing result", evidence: ["repo"] },
  ],
  generationNotes: [],
};

const storyboard: Storyboard = {
  version: 1,
  title: "Approved flow",
  durationTargetSeconds: 20,
  aspectRatio: "16:9",
  beats: [
    { id: "scene-1", type: "hook", goal: "Open with the problem", visual: "Hero", narrative: "Hero", strategyMessageId: "message-1", proofPointId: "capability-1", expectedUserAction: null, importance: "high" },
    { id: "scene-2", type: "screen_capture", goal: "Demonstrate the workflow", visual: "Workflow", narrative: "Workflow", strategyMessageId: "message-2", proofPointId: "capability-1", expectedUserAction: "Click", importance: "high" },
  ],
};

const capturePlan: CapturePlan = {
  targetUrl: "https://example.com",
  viewport: { width: 1280, height: 720 },
  steps: [
    { type: "goto", url: "https://example.com" },
    { type: "pause", ms: 100 },
    { type: "click", selector: "[data-testid='start']" },
    { type: "pause", ms: 300 },
  ],
  expectedCheckpoints: [],
};

const lineage = buildApprovedOutlineLineage({ approvedOutline, storyboard, capturePlan, finalVideoProduced: true });
ApprovedOutlineLineageSchema.parse(lineage);
assert.equal(lineage.approvedOutlinePresent, true);
assert.equal(lineage.items.length, 3);
assert.equal(lineage.items[0]?.status, "captured");
assert.equal(lineage.items[1]?.status, "captured");
assert.equal(lineage.items[2]?.status, "unsupported");
assert.ok(lineage.warnings.some((warning) => warning.includes("scene-3")));

const mismatchedStoryboard: Storyboard = {
  ...storyboard,
  beats: storyboard.beats.map((beat, index) => ({ ...beat, id: `beat-${index + 1}` })),
};
const inferred = buildApprovedOutlineLineage({ approvedOutline, storyboard: mismatchedStoryboard, capturePlan, finalVideoProduced: false });
assert.deepEqual(inferred.items[0]?.storyboardBeatIds, ["beat-1"]);
assert.ok(inferred.warnings.some((warning) => warning.includes("mapped to storyboard beat beat-1 by order")));

console.log("approvedOutlineLineage.test PASS");
