import assert from "node:assert/strict";
import {
  parseNarrativeExploration,
  type NarrativeExploration as ExportedNarrativeExploration,
} from "./index.js";

const productUrl = "https://product.example/app";

const validExploration = {
  productSummary: "Fixture Product turns source and website context into clearer product demos.",
  bestDemoAngle: "Show the user turning a live product URL into an editable demo video.",
  userProblem: "Teams need a short demo but do not know which workflow tells the story best.",
  promisedOutcome: "The user gets a deterministic capture plan grounded in the product workflow.",
  workflowCandidates: [
    {
      name: "Generate demo from URL",
      whyItMatters: "It connects the product promise to an outcome users can see quickly.",
      routeHints: ["/", "/app", "Dashboard"],
      visibleEvidence: ["Hero says Build demos faster", "Start demo button is visible"],
      storyboardUse: "main-demo",
    },
  ],
  strongestCopy: ["Build demos faster", "Export polished videos"],
  avoidNarratives: ["Do not frame this as generic screen recording."],
  explorationNotes: ["Observed only same-origin public pages."],
};

const parsed: ExportedNarrativeExploration = parseNarrativeExploration(validExploration, productUrl);
assert.deepEqual(parsed, validExploration);

assert.throws(
  () => parseNarrativeExploration({ ...validExploration, productSummary: "" }, productUrl),
  /productSummary is required/,
);

assert.throws(
  () => parseNarrativeExploration({ ...validExploration, bestDemoAngle: "x".repeat(501) }, productUrl),
  /bestDemoAngle must be at most 500 characters/,
);

assert.throws(
  () =>
    parseNarrativeExploration(
      {
        ...validExploration,
        workflowCandidates: Array.from({ length: 7 }, (_, index) => ({
          name: `Workflow ${index}`,
          whyItMatters: "Evidence-backed workflow.",
          routeHints: ["/"],
          visibleEvidence: ["Visible UI evidence."],
          storyboardUse: "main-demo",
        })),
      },
      productUrl,
    ),
  /workflowCandidates must contain at most 6 entries/,
);

assert.throws(
  () =>
    parseNarrativeExploration(
      {
        ...validExploration,
        workflowCandidates: [
          {
            ...validExploration.workflowCandidates[0],
            routeHints: ["https://evil.example/phishing"],
          },
        ],
      },
      productUrl,
    ),
  /workflowCandidates.0.routeHints.0 must be a same-origin path or short route label/,
);

assert.throws(
  () =>
    parseNarrativeExploration(
      {
        ...validExploration,
        workflowCandidates: [
          {
            ...validExploration.workflowCandidates[0],
            visibleEvidence: ["x".repeat(181)],
          },
        ],
      },
      productUrl,
    ),
  /workflowCandidates.0.visibleEvidence.0 must be at most 180 characters/,
);

import type {
  ExploreNarrativeWebsiteOptions,
  NarrativeStagehandClient,
  NarrativeStagehandExtractInput,
  NarrativeStagehandObserveInput,
} from "./index.js";
import { exploreNarrativeWebsite } from "./index.js";

function createFakeStagehandClient(extracted: unknown, calls: string[]): NarrativeStagehandClient {
  return {
    async init() {
      calls.push("init");
    },
    async close() {
      calls.push("close");
    },
    page: {
      async goto(url) {
        calls.push(`goto:${url}`);
      },
      async observe(input: NarrativeStagehandObserveInput) {
        calls.push(`observe:${input.instruction.includes("safe same-origin")}`);
        return [{ description: "Start demo button", selector: "button" }];
      },
      async extract<T>(input: NarrativeStagehandExtractInput<T>) {
        calls.push(`extract:${input.instruction.includes("NarrativeExploration")}`);
        return extracted as T;
      },
    },
  };
}

const disabledCalls: string[] = [];
const disabledResult = await exploreNarrativeWebsite(productUrl, {
  enabled: false,
  createStagehand: () => createFakeStagehandClient(validExploration, disabledCalls),
});
assert.equal(disabledResult, undefined);
assert.deepEqual(disabledCalls, []);

const enabledCalls: string[] = [];
const enabledResult = await exploreNarrativeWebsite(productUrl, {
  enabled: true,
  prompt: "Show the clearest workflow.",
  productAnalysis: {
    url: productUrl,
    title: "Fixture Product",
    headings: ["Build demos faster"],
    bodySnippets: ["Export polished videos."],
    links: [],
    buttons: ["Start demo"],
    inputs: [],
    brandHints: { colors: [], fontFamilies: [] },
  },
  createStagehand: () => createFakeStagehandClient(validExploration, enabledCalls),
});
assert.deepEqual(enabledResult, validExploration);
assert.deepEqual(enabledCalls, [
  "init",
  `goto:${productUrl}`,
  "observe:true",
  "extract:true",
  "close",
]);

const invalidCalls: string[] = [];
await assert.rejects(
  () =>
    exploreNarrativeWebsite(productUrl, {
      enabled: true,
      createStagehand: () => createFakeStagehandClient({ ...validExploration, strongestCopy: ["x".repeat(181)] }, invalidCalls),
    }),
  /strongestCopy.0 must be at most 180 characters/,
);
assert.equal(invalidCalls.at(-1), "close");

const noFactoryOptions: ExploreNarrativeWebsiteOptions = { enabled: false };
assert.equal(await exploreNarrativeWebsite(productUrl, noFactoryOptions), undefined);

const timeoutCalls: string[] = [];
await assert.rejects(
  () =>
    exploreNarrativeWebsite(productUrl, {
      enabled: true,
      timeoutMs: 1,
      createStagehand: () => ({
        async init() {
          timeoutCalls.push("init");
        },
        async close() {
          timeoutCalls.push("close");
        },
        page: {
          async goto(url) {
            timeoutCalls.push(`goto:${url}`);
          },
          async observe() {
            timeoutCalls.push("observe");
            return new Promise<never>(() => {});
          },
          async extract<T>() {
            timeoutCalls.push("extract");
            return validExploration as T;
          },
        },
      }),
    }),
  /Narrative exploration timed out after 1ms/,
);
assert.equal(timeoutCalls.at(-1), "close");
