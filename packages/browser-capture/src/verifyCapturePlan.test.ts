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

console.log("verifyCapturePlan tests passed");
