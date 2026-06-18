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
