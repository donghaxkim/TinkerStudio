import assert from "node:assert/strict";
import { assertValidCapturePlan, verifyCapturePlan } from "./verifyCapturePlan.js";
import type { CapturePlan } from "./types.js";

const validPlan: CapturePlan = {
  targetUrl: "http://127.0.0.1:4173/",
  viewport: { width: 1280, height: 720 },
  steps: [
    { type: "goto", url: "http://127.0.0.1:4173/" },
    { type: "waitForSelector", selector: "[data-testid='hero']" },
    { type: "click", selector: "[data-testid='start-demo']", label: "Start demo" },
    { type: "type", selector: "[data-testid='workspace-name']", text: "Acme Launch" },
    { type: "scroll", y: 400 },
    { type: "hover", text: "Export" },
    { type: "pause", ms: 250 },
  ],
  expectedCheckpoints: [
    { id: "hero-visible", label: "Hero visible", selector: "[data-testid='hero']" },
    { id: "export-visible", label: "Export visible", text: "Export" },
  ],
};

assert.deepEqual(verifyCapturePlan(validPlan), { valid: true, issues: [] });
assert.doesNotThrow(() => assertValidCapturePlan(validPlan));

assert.deepEqual(verifyCapturePlan({ ...validPlan, steps: [{ type: "scroll", selector: "[data-testid='hero']" }] }), {
  valid: true,
  issues: [],
});

const invalidPlan: CapturePlan = {
  targetUrl: "",
  viewport: { width: 0, height: -1 },
  steps: [
    { type: "click" },
    { type: "type", selector: "", text: "" },
    { type: "waitForSelector", selector: "", timeoutMs: -1 },
    { type: "pause", ms: -5 },
  ],
  expectedCheckpoints: [{ id: "", label: "" }],
};

const result = verifyCapturePlan(invalidPlan);
assert.equal(result.valid, false);
assert.match(
  result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"),
  /targetUrl: targetUrl is required/,
);
assert.match(
  result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"),
  /steps\.0: click step requires selector or text/,
);
assert.throws(() => assertValidCapturePlan(invalidPlan), /Invalid capture plan/);

const invalidUrlPlan: CapturePlan = {
  ...validPlan,
  targetUrl: "file:///tmp/demo.html",
  steps: [{ type: "goto", url: "not a url" }],
};

const invalidUrlResult = verifyCapturePlan(invalidUrlPlan);
assert.equal(invalidUrlResult.valid, false);
assert.deepEqual(invalidUrlResult.issues, [
  { path: "targetUrl", message: "targetUrl must be an http or https URL" },
  { path: "steps.0.url", message: "goto url must be an http or https URL" },
]);

const unknownStepPlan = {
  ...validPlan,
  steps: [{ type: "drag" }],
} as unknown as CapturePlan;

const unknownStepResult = verifyCapturePlan(unknownStepPlan);
assert.equal(unknownStepResult.valid, false);
assert.deepEqual(unknownStepResult.issues, [
  { path: "steps.0.type", message: "unknown step type 'drag'" },
]);

const nonFiniteScrollPlan: CapturePlan = {
  ...validPlan,
  steps: [{ type: "scroll", x: Number.NaN, y: Number.POSITIVE_INFINITY }],
};

const nonFiniteScrollResult = verifyCapturePlan(nonFiniteScrollPlan);
assert.equal(nonFiniteScrollResult.valid, false);
assert.deepEqual(nonFiniteScrollResult.issues, [
  { path: "steps.0.x", message: "scroll x must be finite" },
  { path: "steps.0.y", message: "scroll y must be finite" },
]);

const emptyScrollResult = verifyCapturePlan({ ...validPlan, steps: [{ type: "scroll" }] });
assert.equal(emptyScrollResult.valid, false);
assert.deepEqual(emptyScrollResult.issues, [{ path: "steps.0", message: "scroll step requires x, y, or selector" }]);

const oversizedTimingPlan: CapturePlan = {
  ...validPlan,
  steps: [
    { type: "waitForSelector", selector: "[data-testid='hero']", timeoutMs: 10_001 },
    { type: "pause", ms: 5_001 },
  ],
};

const oversizedTimingResult = verifyCapturePlan(oversizedTimingPlan);
assert.equal(oversizedTimingResult.valid, false);
assert.deepEqual(oversizedTimingResult.issues, [
  { path: "steps.0.timeoutMs", message: "timeoutMs must be at most 10000" },
  { path: "steps.1.ms", message: "pause ms must be at most 5000" },
]);

const oversizedPlan: CapturePlan = {
  ...validPlan,
  steps: Array.from({ length: 51 }, () => ({ type: "pause", ms: 0 })),
  expectedCheckpoints: Array.from({ length: 21 }, (_, index) => ({
    id: `checkpoint-${index}`,
    label: `Checkpoint ${index}`,
    selector: "body",
  })),
};

const oversizedPlanResult = verifyCapturePlan(oversizedPlan);
assert.equal(oversizedPlanResult.valid, false);
assert.deepEqual(oversizedPlanResult.issues.slice(0, 2), [
  { path: "steps", message: "capture plan must have at most 50 steps" },
  { path: "expectedCheckpoints", message: "capture plan must have at most 20 expected checkpoints" },
]);

console.log("verifyCapturePlan tests passed");
