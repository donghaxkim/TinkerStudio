import assert from "node:assert/strict";
import {
  assertTestreelPlanMatchesProductUrl,
  createFixtureTestreelGenerationPlan,
  parseTestreelGenerationPlanJson,
} from "./testreelPlan.js";

const plan = {
  engine: "testreel",
  definition: {
    url: "https://example.com/app",
    viewport: { width: 1280, height: 720 },
    outputSize: { width: 1920, height: 1080 },
    outputFormat: "mp4",
    cursor: { enabled: true, size: 48, rippleSize: 100 },
    chrome: { enabled: true, url: true },
    background: { enabled: true, gradient: { from: "#0f172a", to: "#38bdf8" }, padding: 60, borderRadius: 18 },
    steps: [
      { action: "wait", ms: 500 },
      { action: "click", selector: "[data-testid='start-demo']", zoom: 2 },
      { action: "type", selector: "[data-testid='workspace-name']", text: "Fixture workspace" },
      { action: "keyboard", key: "Enter" },
      { action: "scroll", y: 720 },
      { action: "zoom", selector: "[data-testid='export-card']", scale: 1.5, duration: 600 },
      { action: "zoom", scale: 1, duration: 400 },
      { action: "screenshot", name: "final" },
    ],
  },
  expectedCheckpoints: [{ id: "final", label: "Final screen", selector: "[data-testid='export-card']" }],
  notes: ["Fixture note"],
} as const;

const parsed = parseTestreelGenerationPlanJson(JSON.stringify(plan));
assert.equal(parsed.engine, "testreel");
assert.equal(parsed.definition.outputFormat, "mp4");
assert.equal(parsed.definition.steps.length, 8);
assert.equal(parsed.definition.steps[1]?.action, "click");
assert.equal(parsed.definition.steps[1]?.action === "click" ? parsed.definition.steps[1].zoom : undefined, 2);
assertTestreelPlanMatchesProductUrl(parsed, "https://example.com/app");

assert.throws(
  () =>
    parseTestreelGenerationPlanJson(
      JSON.stringify({
        ...plan,
        definition: {
          ...plan.definition,
          steps: [{ action: "click", text: "Start demo" }],
        },
      }),
    ),
  /selector/,
);

assert.throws(
  () =>
    parseTestreelGenerationPlanJson(
      JSON.stringify({
        targetUrl: "https://example.com/app",
        viewport: { width: 1280, height: 720 },
        steps: [{ type: "goto", url: "https://example.com/app" }],
        expectedCheckpoints: [],
      }),
    ),
  /Testreel generation plan is invalid/,
);

assert.throws(
  () => parseTestreelGenerationPlanJson(JSON.stringify({ ...plan, definition: { ...plan.definition, url: "https://${HOST}/app" } })),
  /environment variable substitution is not allowed/,
);

assert.throws(
  () => assertTestreelPlanMatchesProductUrl({ ...parsed, definition: { ...parsed.definition, url: "https://evil.example/app" } }, "https://example.com/app"),
  /recording URL must stay on product origin/,
);

assert.throws(
  () =>
    parseTestreelGenerationPlanJson(
      JSON.stringify({
        ...plan,
        definition: {
          ...plan.definition,
          steps: [
            { action: "hover", selector: "body", text: "Body" },
            { action: "scroll", selector: "body", y: 720 },
            { action: "zoom", selector: "body", scale: 1.5 },
          ],
        },
      }),
    ),
  /Unrecognized key/,
);

assert.throws(
  () =>
    parseTestreelGenerationPlanJson(
      JSON.stringify({
        ...plan,
        definition: {
          ...plan.definition,
          steps: [
            { action: "wait", ms: 500 },
            { action: "scroll", y: 720 },
            { action: "zoom", selector: "body", scale: 1.5 },
            { action: "screenshot", name: "final" },
          ],
        },
      }),
    ),
  /cursor-producing action/,
);

assert.throws(
  () =>
    parseTestreelGenerationPlanJson(
      JSON.stringify({
        ...plan,
        definition: {
          ...plan.definition,
          steps: [
            { action: "wait", ms: 500 },
            { action: "hover", selector: "body" },
            { action: "scroll", y: 720 },
            { action: "screenshot", name: "final" },
          ],
        },
      }),
    ),
  /zoom-producing step/,
);

assert.equal(
  parseTestreelGenerationPlanJson(
    JSON.stringify({
      ...plan,
      definition: {
        ...plan.definition,
        steps: [
          { action: "wait", ms: 500 },
          { action: "hover", selector: "body" },
          { action: "zoom", selector: "body" },
          { action: "screenshot", name: "final" },
        ],
      },
    }),
  ).definition.steps[2]?.action,
  "zoom",
);

const fixture = createFixtureTestreelGenerationPlan({
  productUrl: "https://example.com/app",
  aspectRatio: "9:16",
  title: "Fixture Product",
});
assert.deepEqual(fixture.definition.viewport, { width: 720, height: 1280 });
assert.deepEqual(fixture.definition.outputSize, { width: 1080, height: 1920 });
assert.equal(fixture.definition.outputFormat, "mp4");
assert.equal(fixture.definition.steps.some((step) => ["click", "hover", "type", "fill"].includes(step.action)), true);
assert.equal(fixture.definition.steps.some((step) => step.action === "zoom" || (step.action === "click" && step.zoom !== undefined)), true);

console.log("testreel plan tests passed");
