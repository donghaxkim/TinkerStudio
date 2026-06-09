import assert from "node:assert/strict";
import type { ProductAnalysis } from "@tinker/product-analysis";
import {
  createEnvironmentAiUrlPlanner,
  createFixtureAiUrlPlanner,
  parseCapturePlanJson,
  parseStoryboardJson,
} from "./aiPlanning.js";
import {
  createEnvironmentAiUrlPlanner as exportedCreateEnvironmentAiUrlPlanner,
  createFixtureAiUrlPlanner as exportedCreateFixtureAiUrlPlanner,
  parseCapturePlanJson as exportedParseCapturePlanJson,
  parseStoryboardJson as exportedParseStoryboardJson,
  type AiUrlPlanner as ExportedAiUrlPlanner,
  type AiUrlPlannerInput as ExportedAiUrlPlannerInput,
  type AiUrlPlannerResult as ExportedAiUrlPlannerResult,
} from "./index.js";

const productAnalysisFixture: ProductAnalysis = {
  url: "http://127.0.0.1:3000/",
  title: "Browser Capture Manual Demo",
  headings: ["Record a deterministic local browser demo.", "Export"],
  bodySnippets: ["Build an editable DemoProject from a deterministic browser capture and storyboard."],
  links: [],
  buttons: ["Start demo", "Export demo"],
  inputs: [{ label: "Workspace name", selectorHint: "[data-testid='workspace-name']" }],
  brandHints: {
    colors: ["#0f172a", "#38bdf8"],
    fontFamilies: ["Inter", "system-ui"],
  },
};

const storyboardFixture = {
  title: "Fixture demo",
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  beats: [
    {
      id: "hook",
      type: "hook",
      goal: "Introduce the deterministic browser demo.",
      narration: "Turn a local product flow into an editable demo.",
      startHint: 0,
      endHint: 3,
    },
    {
      id: "screen-capture",
      type: "screen_capture",
      goal: "Show the captured product workflow.",
      narration: "Capture the hero, interaction, and export moment.",
      startHint: 3,
      endHint: 10,
    },
  ],
} as const;

const capturePlanFixture = {
  targetUrl: "http://127.0.0.1:3000/",
  viewport: { width: 1280, height: 720 },
  steps: [
    { type: "goto", url: "http://127.0.0.1:3000/" },
    { type: "waitForSelector", selector: "[data-testid='hero']" },
    { type: "click", selector: "[data-testid='start-demo']" },
    { type: "pause", ms: 300 },
  ],
  expectedCheckpoints: [{ id: "hero", label: "Hero", selector: "[data-testid='hero']" }],
} as const;

assert.equal(exportedCreateEnvironmentAiUrlPlanner, createEnvironmentAiUrlPlanner);
assert.equal(exportedCreateFixtureAiUrlPlanner, createFixtureAiUrlPlanner);
assert.equal(exportedParseCapturePlanJson, parseCapturePlanJson);
assert.equal(exportedParseStoryboardJson, parseStoryboardJson);
const exportedPlannerTypeCheck: ExportedAiUrlPlanner = createFixtureAiUrlPlanner();
const exportedPlannerInputTypeCheck: ExportedAiUrlPlannerInput = {
  productUrl: "http://127.0.0.1:3000/",
  prompt: "Show the export path.",
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  analysis: productAnalysisFixture,
};
void exportedPlannerTypeCheck;
void exportedPlannerInputTypeCheck;
const exportedPlannerResultTypeCheck: ExportedAiUrlPlannerResult | undefined = undefined;
void exportedPlannerResultTypeCheck;

const parsedStoryboard = parseStoryboardJson(JSON.stringify(storyboardFixture));
assert.equal(parsedStoryboard.title, "Fixture demo");
assert.equal(parsedStoryboard.durationCapSeconds, 10);
assert.equal(parsedStoryboard.aspectRatio, "16:9");
assert.equal(parsedStoryboard.beats.length, 2);

const parsedCapturePlan = parseCapturePlanJson(JSON.stringify(capturePlanFixture));
assert.equal(parsedCapturePlan.targetUrl, "http://127.0.0.1:3000/");
assert.deepEqual(parsedCapturePlan.viewport, { width: 1280, height: 720 });
assert.equal(parsedCapturePlan.steps.length, 4);
assert.equal(parsedCapturePlan.expectedCheckpoints[0]?.id, "hero");

assert.throws(() => parseStoryboardJson("{"), /Planner returned malformed storyboard JSON/);
assert.throws(
  () => parseStoryboardJson(JSON.stringify({ ...storyboardFixture, beats: [] })),
  /Storyboard is invalid/,
);
assert.throws(
  () => parseCapturePlanJson(JSON.stringify({ ...capturePlanFixture, steps: [] })),
  /Capture plan is invalid/,
);
assert.throws(
  () =>
    parseCapturePlanJson(
      JSON.stringify({
        ...capturePlanFixture,
        steps: [{ type: "pressKey", key: "Enter" }],
      }),
    ),
  /Capture plan is invalid/,
);

const fixturePlanner = createFixtureAiUrlPlanner();
const fixtureResult = await fixturePlanner({
  productUrl: "http://127.0.0.1:3000/",
  prompt: "Show the export path.",
  durationCapSeconds: 10,
  aspectRatio: "9:16",
  analysis: productAnalysisFixture,
});

assert.equal(fixtureResult.storyboard.aspectRatio, "9:16");
assert.equal(fixtureResult.capturePlan.targetUrl, "http://127.0.0.1:3000/");
assert.deepEqual(fixtureResult.capturePlan.viewport, { width: 720, height: 1280 });
assert.deepEqual(fixtureResult.capturePlan.steps[0], { type: "goto", url: "http://127.0.0.1:3000/" });

const directCalls: RequestInit[] = [];
const directPlanner = createEnvironmentAiUrlPlanner({
  endpoint: "https://planner.example/v1/chat/completions",
  apiKey: "test-key",
  model: "planner-model",
  fetchImpl: async (_url, init) => {
    directCalls.push(init ?? {});

    return {
      ok: true,
      status: 200,
      json: async () => ({ storyboard: storyboardFixture, capturePlan: capturePlanFixture }),
      text: async () => "",
    } as Response;
  },
});

const directResult = await directPlanner({
  productUrl: "http://127.0.0.1:3000/",
  prompt: "Show the hero.",
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  analysis: productAnalysisFixture,
});

assert.equal(directResult.storyboard.title, "Fixture demo");
assert.equal(directResult.capturePlan.targetUrl, "http://127.0.0.1:3000/");
assert.equal(directCalls.length, 1);
assert.equal(directCalls[0]?.method, "POST");
assert.deepEqual(directCalls[0]?.headers, {
  authorization: "Bearer test-key",
  "content-type": "application/json",
});

const openAiPlanner = createEnvironmentAiUrlPlanner({
  endpoint: "https://planner.example/v1/chat/completions",
  apiKey: "test-key",
  model: "planner-model",
  fetchImpl: async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({ storyboard: storyboardFixture, capturePlan: capturePlanFixture }),
            },
          },
        ],
      }),
      text: async () => "",
    }) as Response,
});

const openAiResult = await openAiPlanner({
  productUrl: "http://127.0.0.1:3000/",
  prompt: "Show the hero.",
  durationCapSeconds: 10,
  aspectRatio: "16:9",
  analysis: productAnalysisFixture,
});

assert.equal(openAiResult.storyboard.title, "Fixture demo");
assert.equal(openAiResult.capturePlan.targetUrl, "http://127.0.0.1:3000/");

await assert.rejects(
  () =>
    createEnvironmentAiUrlPlanner({
      endpoint: "",
      apiKey: "",
      model: "",
      fetchImpl: async () => ({ ok: true }) as Response,
    })({
      productUrl: "http://127.0.0.1:3000/",
      prompt: "Show the hero.",
      durationCapSeconds: 10,
      aspectRatio: "16:9",
      analysis: productAnalysisFixture,
    }),
  /TINKER_AI_URL_PLANNER_ENDPOINT, TINKER_AI_URL_PLANNER_API_KEY, and TINKER_AI_URL_PLANNER_MODEL are required/,
);

await assert.rejects(
  () =>
    createEnvironmentAiUrlPlanner({
      endpoint: "https://planner.example/v1/chat/completions",
      apiKey: "test-key",
      model: "planner-model",
      fetchImpl: async () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError("Unexpected token '<'");
          },
          text: async () => "<html>not json</html>",
        }),
    })({
      productUrl: "http://127.0.0.1:3000/",
      prompt: "Show the hero.",
      durationCapSeconds: 10,
      aspectRatio: "16:9",
      analysis: productAnalysisFixture,
    }),
  /Planner returned malformed planner response JSON/,
);

console.log("ai planning tests passed");
