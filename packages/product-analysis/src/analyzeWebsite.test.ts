import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startFixtureServer } from "@tinker/browser-capture";
import { analyzeWebsite } from "./analyzeWebsite.js";

const fixtureUrl = new URL("../../browser-capture/fixtures/manual-demo.html", import.meta.url);
const outputDirectory = await mkdtemp(join(tmpdir(), "tinker-product-analysis-"));
const server = await startFixtureServer(fixtureUrl);

try {
  const analysis = await analyzeWebsite(server.url, {
    outputDirectory,
    screenshotFileName: "analysis.png",
    timeoutMs: 5000,
    headless: true,
  });

  assert.equal(analysis.url, server.url);
  assert.equal(analysis.title, "Browser Capture Manual Demo");
  assert.ok(analysis.headings.includes("Record a deterministic local browser demo."));
  assert.ok(analysis.headings.includes("Export"));
  assert.ok(analysis.bodySnippets.some((snippet) => snippet.includes("editable DemoProject")));
  assert.ok(analysis.buttons.includes("Start demo"));
  assert.ok(analysis.buttons.includes("Export demo"));
  assert.ok(analysis.inputs.some((input) => input.label === "Workspace name"));
  assert.ok(analysis.brandHints.colors.length > 0);
  assert.ok(analysis.brandHints.fontFamilies.length > 0);
  assert.equal(analysis.screenshotPath, join(outputDirectory, "analysis.png"));
  assert.equal(existsSync(join(outputDirectory, "analysis.png")), true);
} finally {
  await server.close();
  await rm(outputDirectory, { recursive: true, force: true });
}

console.log("analyze website tests passed");
