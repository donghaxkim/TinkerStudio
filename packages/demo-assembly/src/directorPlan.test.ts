import assert from "node:assert/strict";
import type { ActionTrace, CapturePlan, RenderPlan } from "@tinker/browser-capture";
import type { ProductAnalysis, RepoAnalysis } from "@tinker/product-analysis";
import { DirectorPlanSchema, buildDirectorPlan } from "./directorPlan.js";
import { deriveDemoStrategy } from "./demoStrategy.js";
import { deriveProductUnderstanding } from "./productUnderstanding.js";

// --- PayKit-like fixture (landing-page / library showcase) ---
const websiteAnalysis: ProductAnalysis = {
  url: "https://paykit.sh/",
  title: "PayKit",
  headings: ["The billing framework for TypeScript", "Add billing in minutes"],
  bodySnippets: ["PayKit is the billing framework for TypeScript apps."],
  links: [],
  buttons: ["Upgrade to Pro", "Manage billing", "Get started"],
  inputs: [],
  brandHints: { colors: ["#111"], fontFamilies: ["Inter"] },
};
const repoAnalysis: RepoAnalysis = {
  repoUrl: "https://github.com/getpaykit/paykit",
  productName: "PayKit",
  summary: "PayKit is the billing framework for TypeScript. Define plans and features in products.ts, then run npx paykitjs init.",
  features: ["Define plans and features in products.ts", "npx paykitjs init", "Free/Pro billing UI", "Upgrade to Pro flow"],
  likelyRoutes: ["/"],
  demoIdeas: ["Show products.ts defining plans, run npx paykitjs init, then show the Free/Pro billing UI and Upgrade to Pro"],
  importantTerms: ["billing"],
  setupNotes: [],
  sourceHints: [],
};

const understanding = deriveProductUnderstanding({
  productUrl: "https://paykit.sh/",
  repoUrl: repoAnalysis.repoUrl,
  prompt: "Show the billing framework: products.ts, npx paykitjs init, and the Free/Pro billing UI.",
  websiteAnalysis,
  repoAnalysis,
});
const { strategy, storyboard } = deriveDemoStrategy({
  understanding,
  prompt: "Show the billing framework: products.ts, npx paykitjs init, and the Free/Pro billing UI.",
  durationCapSeconds: 40,
  aspectRatio: "16:9",
});

const capturePlan: CapturePlan = {
  targetUrl: "https://paykit.sh/",
  viewport: { width: 1280, height: 720 },
  steps: [
    { type: "goto", url: "https://paykit.sh/" },
    { type: "waitForSelector", selector: "[data-testid='hero']" },
    { type: "click", selector: "[data-testid='upgrade']", text: "Upgrade to Pro" },
  ],
  expectedCheckpoints: [],
};

// One interaction, with a big dead gap (0.2s -> 2.0s) and trailing dead time.
const actionTrace: ActionTrace = {
  version: 1,
  targetUrl: "https://paykit.sh/",
  viewport: { width: 1280, height: 720 },
  fps: 25,
  startedAt: "2026-06-17T00:00:00.000Z",
  completedAt: "2026-06-17T00:00:05.000Z",
  actions: [
    { id: "navigation-1", type: "navigation", status: "success", startTime: 0, endTime: 0.2 },
    {
      id: "click-1",
      type: "click",
      status: "success",
      startTime: 2.0,
      endTime: 2.1,
      description: "Upgrade to Pro",
      clickPoint: { x: 580, y: 322 },
      targetBox: { x: 500, y: 300, width: 160, height: 44 },
    },
  ],
};

const renderPlan: RenderPlan = {
  version: 1,
  fps: 25,
  resolution: { width: 1280, height: 720 },
  cursor: { enabled: true, style: "synthetic", smoothing: "minimum-jerk", hideNativeCursor: true, size: 22 },
  zoomSegments: [{ id: "zoom-1", start: 1.8, end: 2.8, scale: 1.3, focus: { x: 0.45, y: 0.42 }, easing: "minimum-jerk", reason: "Interaction" }],
  clickEffects: [],
  scrollSegments: [],
  holds: [],
  notes: [],
};

const plan = buildDirectorPlan({
  productUnderstanding: understanding,
  demoStrategy: strategy,
  storyboard,
  capturePlan,
  actionTrace,
  renderPlan,
  screenshots: { fullPagePath: "playwright/capture/screenshots/final.png" },
  viewport: { width: 1280, height: 720 },
});

DirectorPlanSchema.parse(plan);
assert.equal(plan.version, 1);
assert.equal(plan.page.kind, "landing-showcase", "PayKit is a library showcase page");

// PayKit-like signals produce the full showcase sequence.
const kinds = plan.shots.map((shot) => shot.kind);
for (const expected of ["hero", "code", "terminal", "result", "cta"] as const) {
  assert.ok(kinds.includes(expected), `expected a ${expected} shot, got [${kinds.join(", ")}]`);
}

// Hero leads with the headline; CTA closes.
const hero = plan.shots.find((shot) => shot.kind === "hero");
assert.ok(hero && /billing framework for TypeScript/i.test(hero.caption), `hero caption should be the headline, got "${hero?.caption}"`);
assert.equal(plan.shots[0]?.kind, "hero", "hero is first");
assert.equal(plan.shots[plan.shots.length - 1]?.kind, "cta", "cta is last");

// Terminal/code captions are grounded in real signals.
const terminal = plan.shots.find((shot) => shot.kind === "terminal");
assert.ok(terminal && /npx|init|install/i.test(terminal.caption), `terminal caption should mention setup, got "${terminal?.caption}"`);
const code = plan.shots.find((shot) => shot.kind === "code");
assert.ok(code && /products\.ts|\.ts|define|code/i.test(code.caption), `code caption should mention code, got "${code?.caption}"`);

// Result shot is sourced from the live recording, frames the interaction, and shows the cursor.
const result = plan.shots.find((shot) => shot.kind === "result");
assert.equal(result?.source, "recording");
assert.equal(result?.showCursor, true);
assert.deepEqual(result?.region, { x: 500, y: 300, width: 160, height: 44 });

// Cursor guidance: hidden on static showcase shots; static shots don't show it.
assert.equal(plan.cursor.defaultVisible, true);
for (const kind of ["hero", "code", "terminal", "cta"] as const) {
  assert.ok(plan.cursor.hideDuringKinds.includes(kind));
  assert.equal(plan.shots.find((shot) => shot.kind === kind)?.showCursor, false, `${kind} shot should hide the cursor`);
}

// Dead-time decisions captured (the 1.8s gap + trailing dead time were detected).
assert.ok(plan.deadTime.decisions.length >= 1, "director plan should record dead-time compression decisions");
assert.ok(plan.deadTime.removedSeconds > 0, "dead time should be removed");
assert.ok(plan.deadTime.compressedDurationSeconds < plan.deadTime.sourceDurationSeconds);

// Shots are ordered and within the storyboard duration.
for (let i = 0; i < plan.shots.length; i += 1) {
  const shot = plan.shots[i];
  assert.ok(shot.end > shot.start, `shot ${shot.id} should have positive length`);
  assert.ok(shot.end <= 40 + 1e-6, `shot ${shot.id} should stay within the duration`);
  if (i > 0) assert.ok(shot.start >= plan.shots[i - 1].start, "shots ordered by start");
}

console.log("directorPlan.test PASS");
