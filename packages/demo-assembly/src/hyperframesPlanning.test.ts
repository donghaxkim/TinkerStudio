import assert from "node:assert/strict";
import type { ProductAnalysis, RepoAnalysis } from "@tinker/product-analysis";
import { createOpencodeHyperframesGenerator, createOpencodeHyperframesRepairer } from "./hyperframesPlanning.js";

const productAnalysis: ProductAnalysis = {
  url: "https://example.com",
  title: "Fixture Product",
  headings: ["Turn source into demos"],
  bodySnippets: ["Create polished workflow videos."],
  links: [],
  buttons: ["Start"],
  inputs: [],
  brandHints: { colors: ["#111827"], fontFamilies: ["Inter"] },
  screenshotPath: "/tmp/product-analysis.png",
};

const repoAnalysis: RepoAnalysis = {
  repoUrl: "https://github.com/example/product",
  commit: "abcdef1",
  productName: "Fixture Product",
  summary: "Repo-backed product demos.",
  features: ["Source-aware rendering"],
  likelyRoutes: ["/"],
  demoIdeas: ["Show source-aware generated UI."],
  importantTerms: ["Hyperframes"],
  setupNotes: [],
  sourceHints: [{ path: "README.md", reason: "Product copy." }],
};

const calls: { prompt: string; cwd: string }[] = [];
const generator = createOpencodeHyperframesGenerator({
  runOpencode: async (prompt, options) => {
    calls.push({ prompt, cwd: options.cwd });
    return "ok";
  },
});

await generator({
  productUrl: "https://example.com",
  repoUrl: "https://github.com/example/product",
  prompt: "Create a workflow demo.",
  durationCapSeconds: 12,
  aspectRatio: "16:9",
  websiteAnalysis: productAnalysis,
  repoAnalysis,
  repoCheckoutDirectory: "/tmp/repo-checkout",
  hyperframesDir: "/tmp/job/hyperframes",
});

assert.equal(calls.length, 1);
assert.equal(calls[0]?.cwd, "/tmp/repo-checkout");
assert.match(calls[0]?.prompt ?? "", /Create a Hyperframes project/);
assert.match(calls[0]?.prompt ?? "", /\/tmp\/job\/hyperframes/);
assert.match(calls[0]?.prompt ?? "", /index.html/);
assert.match(calls[0]?.prompt ?? "", /asset-manifest.json/);
assert.match(calls[0]?.prompt ?? "", /generation-manifest.json/);
assert.match(calls[0]?.prompt ?? "", /Do not include secrets/);
assert.match(calls[0]?.prompt ?? "", /Do not write outside/);
assert.match(calls[0]?.prompt ?? "", /website screenshots as fallback/);

await assert.rejects(
  () =>
    generator({
      productUrl: "https://example.com",
      repoUrl: "https://github.com/example/product",
      prompt: "Create a workflow demo.",
      durationCapSeconds: 12,
      aspectRatio: "16:9",
      websiteAnalysis: productAnalysis,
      repoAnalysis,
      repoCheckoutDirectory: "",
      hyperframesDir: "/tmp/job/hyperframes",
    }),
  /repoCheckoutDirectory is required/,
);

const repairCalls: { prompt: string; cwd: string }[] = [];
const repairer = createOpencodeHyperframesRepairer({
  runOpencode: async (prompt, options) => {
    repairCalls.push({ prompt, cwd: options.cwd });
    return "ok";
  },
});

await repairer({
  repoCheckoutDirectory: "/tmp/repo-checkout",
  hyperframesDir: "/tmp/job/hyperframes",
  failureStage: "lint",
  logText: "line 1\nline 2",
});
assert.equal(repairCalls[0]?.cwd, "/tmp/repo-checkout");
assert.match(repairCalls[0]?.prompt ?? "", /Fix only the generated Hyperframes project/);
assert.match(repairCalls[0]?.prompt ?? "", /failureStage/);
assert.match(repairCalls[0]?.prompt ?? "", /line 1/);

console.log("hyperframes planning tests passed");
