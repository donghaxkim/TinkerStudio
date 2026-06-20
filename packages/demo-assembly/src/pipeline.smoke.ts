// End-to-end pipeline smoke test (Testreel path)
//
// Runs the FULL multi-phase pipeline (`runAiUrlDemo`, Testreel renderer) against a
// local fixture product page with a fixture website/repo analysis and a fixture planner,
// but a REAL Testreel recording. It verifies the entire artifact chain exists:
//
//   input.json
//   product-understanding.json
//   demo-strategy.json
//   storyboard.json
//   testreel/recording-plan.json
//   testreel/recording.json
//   testreel/output/output.json
//   testreel/final.mp4
//   run-summary.json
//
// Deterministic + offline (no opencode, no live network). Requires Testreel's browser
// runtime (and ffprobe for duration probing). Run via:
//   pnpm --filter @tinker/demo-assembly smoke:pipeline

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProductAnalysis, RepoAnalysis } from "@tinker/product-analysis";
import { runAiUrlDemo } from "./runAiUrlDemo.js";
import type { TestreelGenerationPlan } from "./testreelPlan.js";

const FIXTURE_HTML = `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Tinker Pipeline Smoke</title></head>
  <body style="margin:0;font-family:system-ui,sans-serif">
    <header style="height:140px;display:flex;align-items:center;justify-content:center;background:#0b1220;color:#fff">
      <h1 style="margin:0">Tinker Pipeline Smoke</h1>
    </header>
    <div style="height:900px;background:linear-gradient(#fff,#eef)"></div>
    <section style="padding:40px;display:flex;flex-direction:column;gap:16px;align-items:flex-start">
      <button data-testid="cta" style="padding:12px 20px;font-size:16px"
        onclick="document.querySelector('[data-testid=state]').textContent='Started';">Get started</button>
      <input data-testid="email" placeholder="you@example.com" style="padding:10px;font-size:16px;width:280px" />
      <main data-testid="state">Idle</main>
    </section>
  </body>
</html>`;

async function startServer(html: string): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });
  const url = await new Promise<string>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
    });
  });
  return {
    url,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

function ffprobeDuration(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      path,
    ]);
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(Number(out.trim())) : reject(new Error(`ffprobe exited ${code}`))));
  });
}

async function nonEmpty(path: string): Promise<void> {
  assert.ok(existsSync(path), `expected artifact to exist: ${path}`);
  assert.ok((await stat(path)).size > 0, `expected non-empty artifact: ${path}`);
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outputRoot = join(repoRoot, "generated", "smoke-pipeline");
const repoUrl = "https://github.com/tinker/pipeline-smoke";

await rm(outputRoot, { recursive: true, force: true });

const server = await startServer(FIXTURE_HTML);
try {
  const websiteAnalysis: ProductAnalysis = {
    url: server.url,
    title: "Tinker Pipeline Smoke",
    headings: ["Turn product URLs into editable demos", "Click Get started to begin"],
    bodySnippets: ["Tinker captures a smooth product demo from a URL and a repo."],
    links: [],
    buttons: ["Get started"],
    inputs: [{ label: "Email", placeholder: "you@example.com", selectorHint: "[data-testid='email']" }],
    brandHints: { colors: ["#0b1220"], fontFamilies: ["system-ui"] },
  };

  const repoAnalysis: RepoAnalysis = {
    repoUrl,
    productName: "Tinker",
    summary: "Tinker turns a product URL plus a repo into a smooth, editable demo video.",
    features: ["Smooth Testreel recording", "Synthetic cursor and click ripple"],
    likelyRoutes: ["/"],
    demoIdeas: ["Click Get started and enter an email to begin the flow"],
    importantTerms: ["demo"],
    setupNotes: [],
    sourceHints: [{ path: "README.md", reason: "Product summary." }],
  };

  const recordingPlan: TestreelGenerationPlan = {
    engine: "testreel",
    definition: {
      url: server.url,
      viewport: { width: 1280, height: 720 },
      outputSize: { width: 1920, height: 1080 },
      outputFormat: "mp4",
      cursor: { enabled: true },
      chrome: { enabled: true, url: true },
      background: { enabled: true, gradient: { from: "#0b1220", to: "#eef" } },
      steps: [
        { action: "wait", ms: 500 },
        { action: "scroll", y: 400 },
        { action: "click", selector: "[data-testid='cta']", zoom: 2 },
        { action: "type", selector: "[data-testid='email']", text: "demo@tinker.dev" },
        { action: "zoom", selector: "[data-testid='email']", scale: 1.5, duration: 600 },
        { action: "zoom", scale: 1, duration: 400 },
        { action: "wait", ms: 200 },
        { action: "screenshot", name: "final" },
      ],
    },
    expectedCheckpoints: [{ id: "started", label: "Started", text: "Started" }],
  };

  console.log("[smoke] running full pipeline (understanding -> strategy -> Testreel recording)...");
  const result = await runAiUrlDemo({
    outputRoot,
    projectId: "smoke-pipeline",
    createdAt: "2026-06-17T00:00:00.000Z",
    productUrl: server.url,
    repoUrl,
    prompt: "Show how a user clicks Get started and enters an email.",
    durationCapSeconds: 12,
    aspectRatio: "16:9",
    analyzeWebsite: async () => websiteAnalysis,
    analyzeRepo: async (_url, options) => {
      await mkdir(options.checkoutDirectory, { recursive: true });
      return repoAnalysis;
    },
    planner: async () => ({
      storyboard: {
        title: "Tinker Pipeline Smoke demo",
        durationCapSeconds: 12,
        aspectRatio: "16:9",
        beats: [
          { id: "hook", type: "hook", goal: "Introduce Tinker.", startHint: 0, endHint: 4 },
          { id: "demo", type: "screen_capture", goal: "Click Get started.", startHint: 4, endHint: 10 },
          { id: "cta", type: "cta", goal: "Invite the viewer to try Tinker.", startHint: 10, endHint: 12 },
        ],
      },
      recordingPlan,
    }),
  });

  // ---- Artifact chain ----
  await nonEmpty(join(outputRoot, "input.json"));
  await nonEmpty(join(outputRoot, "product-understanding.json"));
  await nonEmpty(join(outputRoot, "demo-strategy.json"));
  await nonEmpty(join(outputRoot, "storyboard.json"));
  await nonEmpty(join(outputRoot, "run-summary.json"));
  await nonEmpty(join(outputRoot, "testreel", "recording-plan.json"));
  await nonEmpty(join(outputRoot, "testreel", "recording.json"));
  await nonEmpty(join(outputRoot, "testreel", "output", "output.json"));

  assert.equal(result.renderer, "testreel");
  assert.equal(result.publishedVideoPath, join(outputRoot, "testreel", "final.mp4"));
  assert.equal(result.rendererResults.testreel.finalVideoPath, join(outputRoot, "testreel", "final.mp4"));
  assert.equal(result.pipeline.runSummaryPath, join(outputRoot, "run-summary.json"));

  // ---- final.mp4 ----
  const finalPath = join(outputRoot, "testreel", "final.mp4");
  await nonEmpty(finalPath);
  const duration = await ffprobeDuration(finalPath);
  assert.ok(Number.isFinite(duration) && duration > 0, `final.mp4 should have a positive duration, got ${duration}`);
  const finalVideoLine = `final.mp4         (${duration.toFixed(2)}s)`;

  console.log("\n[smoke] PASS");
  console.log(`  run folder            : ${outputRoot}`);
  console.log(`  product-understanding : ${join(outputRoot, "product-understanding.json")}`);
  console.log(`  demo-strategy         : ${join(outputRoot, "demo-strategy.json")}`);
  console.log(`  storyboard            : ${join(outputRoot, "storyboard.json")}`);
  console.log(`  recording-plan        : ${join(outputRoot, "testreel", "recording-plan.json")}`);
  console.log(`  recording             : ${join(outputRoot, "testreel", "recording.json")}`);
  console.log(`  testreel manifest     : ${join(outputRoot, "testreel", "output", "output.json")}`);
  console.log(`  run-summary           : ${join(outputRoot, "run-summary.json")}`);
  console.log(`  ${finalVideoLine}`);
} finally {
  await server.close();
}
