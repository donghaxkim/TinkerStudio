import assert from "node:assert/strict";
import {
  parseNarrativeExploration,
  resolveNarrativeStagehandConfig,
  resolveNarrativeStagehandModel,
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

import type { ExploreNarrativeWebsiteOptions, NarrativeStagehandClient } from "./index.js";
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
      async goto(url: string) {
        calls.push(`goto:${url}`);
      },
    },
    async observe(instruction: string) {
      calls.push(`observe:${instruction.includes("safe same-origin")}`);
      return [{ description: "Start demo button", selector: "button" }];
    },
    async extract<T>(instruction: string) {
      calls.push(`extract:${instruction.includes("NarrativeExploration")}`);
      return extracted as T;
    },
  } as unknown as NarrativeStagehandClient;
}

async function waitForCall(calls: string[], value: string) {
  const startedAt = Date.now();
  while (!calls.includes(value)) {
    if (Date.now() - startedAt > 2_000) {
      throw new Error(`Timed out waiting for ${value}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function expectWithin<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    }),
  ]);
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

const overlongEvidenceCalls: string[] = [];
const overlongEvidenceResult = await exploreNarrativeWebsite(productUrl, {
  enabled: true,
  createStagehand: () =>
    createFakeStagehandClient(
      {
        ...validExploration,
        workflowCandidates: [
          {
            ...validExploration.workflowCandidates[0],
            visibleEvidence: Array.from({ length: 9 }, (_, index) => `Evidence ${index}`),
          },
        ],
      },
      overlongEvidenceCalls,
    ),
});
assert.deepEqual(overlongEvidenceResult?.workflowCandidates[0]?.visibleEvidence, [
  "Evidence 0",
  "Evidence 1",
  "Evidence 2",
  "Evidence 3",
  "Evidence 4",
  "Evidence 5",
  "Evidence 6",
  "Evidence 7",
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
          async goto(url: string) {
            timeoutCalls.push(`goto:${url}`);
          },
        },
        async observe() {
          timeoutCalls.push("observe");
          return new Promise<never>(() => {});
        },
        async extract<T>() {
          timeoutCalls.push("extract");
          return validExploration as T;
        },
      }) as unknown as NarrativeStagehandClient,
    }),
  /Narrative exploration timed out after 1ms/,
);
assert.equal(timeoutCalls.at(-1), "close");

const abortCalls: string[] = [];
const abortController = new AbortController();
const abortPromise = exploreNarrativeWebsite(productUrl, {
  enabled: true,
  signal: abortController.signal,
  createStagehand: () =>
    ({
      async init() {
        abortCalls.push("init");
      },
      async close() {
        abortCalls.push("close");
      },
      page: {
        async goto(url: string) {
          abortCalls.push(`goto:${url}`);
        },
      },
      async observe() {
        abortCalls.push("observe");
        return new Promise<never>(() => {});
      },
      async extract<T>() {
        abortCalls.push("extract");
        return validExploration as T;
      },
    }) as unknown as NarrativeStagehandClient,
});
await waitForCall(abortCalls, "observe");
abortController.abort();
await assert.rejects(expectWithin(abortPromise, 1_000), (error) => error instanceof DOMException && error.name === "AbortError");
assert.equal(abortCalls.at(-1), "close");

assert.deepEqual(
  resolveNarrativeStagehandModel({
    TINKER_NARRATIVE_EXPLORATION_MODEL: "openai/gpt-5",
    TINKER_AI_URL_PLANNER_ENDPOINT: "http://127.0.0.1:8317/v1/chat/completions",
    TINKER_AI_URL_PLANNER_API_KEY: "cliproxy-key",
    OPENAI_API_KEY: "public-openai-key",
    OPENAI_BASE_URL: "https://api.openai.com/v1",
  }),
  {
    modelName: "openai/gpt-5",
    apiKey: "cliproxy-key",
    baseURL: "http://127.0.0.1:8317/v1",
  },
);

assert.deepEqual(
  resolveNarrativeStagehandModel({
    TINKER_AI_URL_PLANNER_MODEL: "gpt-5.5",
    TINKER_AI_URL_PLANNER_ENDPOINT: "http://127.0.0.1:8317/v1/chat/completions",
    TINKER_AI_URL_PLANNER_API_KEY: "planner-key",
  }),
  {
    modelName: "openai/gpt-5.5",
    apiKey: "planner-key",
    baseURL: "http://127.0.0.1:8317/v1",
    reasoningEffort: "high",
  },
);

assert.deepEqual(
  resolveNarrativeStagehandModel({
    TINKER_NARRATIVE_EXPLORATION_MODEL: "gpt-5.5",
    OPENAI_API_KEY: "public-openai-key",
  }),
  {
    modelName: "openai/gpt-5.5",
    apiKey: "public-openai-key",
    reasoningEffort: "high",
  },
);

const browserbaseConfig = resolveNarrativeStagehandConfig({
  BROWSERBASE_API_KEY: "browserbase-key",
  TINKER_AI_URL_PLANNER_MODEL: "gpt-5.5",
  TINKER_AI_URL_PLANNER_ENDPOINT: "http://127.0.0.1:8317/v1/chat/completions",
  TINKER_AI_URL_PLANNER_API_KEY: "planner-key",
});
assert.deepEqual(browserbaseConfig, {
  env: "BROWSERBASE",
  apiKey: "browserbase-key",
  model: {
    modelName: "openai/gpt-5.5",
    apiKey: "planner-key",
    baseURL: "http://127.0.0.1:8317/v1",
    reasoningEffort: "high",
  },
  domSettleTimeout: 5_000,
  disableAPI: true,
});

assert.deepEqual(
  resolveNarrativeStagehandModel({
    TINKER_NARRATIVE_EXPLORATION_MODEL: "openai/gpt-5",
    TINKER_AI_URL_PLANNER_ENDPOINT: "http://127.0.0.1:8317/v1/chat/completions",
    OPENAI_API_KEY: "public-openai-key",
  }),
  {
    modelName: "openai/gpt-5",
    apiKey: "public-openai-key",
  },
);

assert.deepEqual(
  resolveNarrativeStagehandModel({
    TINKER_NARRATIVE_EXPLORATION_MODEL: "openai/gpt-5",
    TINKER_AI_URL_PLANNER_API_KEY: "planner-key",
  }),
  {
    modelName: "openai/gpt-5",
  },
);

const credentialEnvKeys = [
  "BROWSERBASE_API_KEY",
  "TINKER_NARRATIVE_EXPLORATION_API_KEY",
  "TINKER_NARRATIVE_EXPLORATION_BASE_URL",
  "TINKER_NARRATIVE_EXPLORATION_MODEL",
  "TINKER_AI_URL_PLANNER_API_KEY",
  "TINKER_AI_URL_PLANNER_ENDPOINT",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "ANTHROPIC_API_KEY",
] as const;
const savedCredentialEnv = Object.fromEntries(credentialEnvKeys.map((key) => [key, process.env[key]]));
try {
  for (const key of credentialEnvKeys) {
    delete process.env[key];
  }
  process.env.TINKER_AI_URL_PLANNER_API_KEY = "planner-key";

  assert.equal(await exploreNarrativeWebsite(productUrl, { enabled: true }), undefined);
} finally {
  for (const key of credentialEnvKeys) {
    const value = savedCredentialEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

assert.deepEqual(
  resolveNarrativeStagehandModel({
    TINKER_NARRATIVE_EXPLORATION_MODEL: "openai/gpt-5",
    TINKER_NARRATIVE_EXPLORATION_BASE_URL: "http://127.0.0.1:8317/v1",
    TINKER_NARRATIVE_EXPLORATION_API_KEY: "narrative-key",
    TINKER_AI_URL_PLANNER_ENDPOINT: "http://planner.example/v1/chat/completions",
    TINKER_AI_URL_PLANNER_API_KEY: "planner-key",
  }),
  {
    modelName: "openai/gpt-5",
    apiKey: "narrative-key",
    baseURL: "http://127.0.0.1:8317/v1",
  },
);
