import assert from "node:assert/strict";
import { parseRepoAnalysis } from "./analyzeRepo.js";
import { parseRepoAnalysis as exportedParseRepoAnalysis, type RepoAnalysis as ExportedRepoAnalysis } from "./index.js";

const repoUrl = "https://github.com/example/product";

const validAnalysis = {
  repoUrl,
  commit: "abcdef1",
  productName: "Fixture Product",
  summary: "Fixture Product turns product URLs and source context into editable demos.",
  features: ["AI storyboard planning", "Deterministic browser capture"],
  likelyRoutes: ["/", "/pricing"],
  demoIdeas: ["Show a repo-informed hero-to-export workflow."],
  importantTerms: ["storyboard", "capture plan"],
  setupNotes: ["Next.js app with app routes."],
  sourceHints: [{ path: "README.md", reason: "Describes the product value proposition." }],
};

assert.equal(exportedParseRepoAnalysis, parseRepoAnalysis);
const exportedTypeCheck: ExportedRepoAnalysis = parseRepoAnalysis(validAnalysis, repoUrl);
assert.equal(exportedTypeCheck.productName, "Fixture Product");

const parsed = parseRepoAnalysis(validAnalysis, repoUrl);
assert.deepEqual(parsed, validAnalysis);

assert.throws(
  () => parseRepoAnalysis({ ...validAnalysis, repoUrl: "https://github.com/example/other" }, repoUrl),
  /repoUrl must match requested repository URL/,
);
assert.throws(() => parseRepoAnalysis({ ...validAnalysis, summary: "" }, repoUrl), /summary is required/);
assert.throws(() => parseRepoAnalysis({ ...validAnalysis, summary: "x".repeat(1201) }, repoUrl), /summary must be at most 1200 characters/);
assert.throws(
  () => parseRepoAnalysis({ ...validAnalysis, features: Array.from({ length: 13 }, (_, index) => `Feature ${index}`) }, repoUrl),
  /features must contain at most 12 entries/,
);
assert.throws(
  () => parseRepoAnalysis({ ...validAnalysis, features: ["x".repeat(161)] }, repoUrl),
  /features.0 must be at most 160 characters/,
);
assert.throws(
  () => parseRepoAnalysis({ ...validAnalysis, sourceHints: [{ path: "../README.md", reason: "Escapes root." }] }, repoUrl),
  /sourceHints.0.path must be a relative repository path/,
);
assert.throws(
  () => parseRepoAnalysis({ ...validAnalysis, sourceHints: [{ path: "/README.md", reason: "Absolute path." }] }, repoUrl),
  /sourceHints.0.path must be a relative repository path/,
);

console.log("analyze repo tests passed");
