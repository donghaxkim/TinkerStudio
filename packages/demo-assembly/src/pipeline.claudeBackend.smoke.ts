// Claude Code backend smoke (requires the `claude` CLI to be logged in)
//
// Proves the full pipeline runs with the LOCAL Claude Code planner instead of opencode:
// real `claude -p` planning -> schema-valid capture plan -> real smooth Playwright capture
// -> final.mp4. Website/repo analysis are fixtures (so no live site / git clone), but the
// PLANNER is the real Claude Code backend selected via TINKER_AGENT_BACKEND=claude-code.
//
//   pnpm --filter @tinker/demo-assembly smoke:pipeline:claude

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

process.env.TINKER_AGENT_BACKEND = "claude-code";

const FIXTURE_HTML = `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Tinker Claude Backend Smoke</title></head>
  <body style="margin:0;font-family:system-ui,sans-serif">
    <header style="height:160px;display:flex;align-items:center;justify-content:center;background:#0b1220;color:#fff">
      <h1 data-testid="hero">Turn product URLs into editable demos</h1>
    </header>
    <div style="height:700px;background:linear-gradient(#fff,#eef)"></div>
    <section style="padding:40px;display:flex;flex-direction:column;gap:16px;align-items:flex-start">
      <button data-testid="cta" style="padding:12px 20px;font-size:16px"
        onclick="document.querySelector('[data-testid=state]').textContent='Started';">Get started</button>
      <input data-testid="email" placeholder="you@example.com" style="padding:10px;font-size:16px;width:280px" />
      <main data-testid="state">Idle</main>
    </section>
  </body>
</html>`;

async function startServer(html: string) {
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
  return { url, close: () => new Promise<void>((res, rej) => server.close((e) => (e ? rej(e) : res()))) };
}

function ffprobeDuration(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path]);
    let out = "";
    child.stdout.on("data", (c) => (out += String(c)));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(Number(out.trim())) : reject(new Error(`ffprobe exited ${code}`))));
  });
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outputRoot = join(repoRoot, "generated", "smoke-pipeline-claude");
const repoUrl = "https://github.com/tinker/claude-backend-smoke";

await rm(outputRoot, { recursive: true, force: true });
const server = await startServer(FIXTURE_HTML);
try {
  const websiteAnalysis: ProductAnalysis = {
    url: server.url,
    title: "Tinker",
    headings: ["Turn product URLs into editable demos"],
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
    features: ["Smooth Playwright capture"],
    likelyRoutes: ["/"],
    demoIdeas: ["Click Get started, then enter an email"],
    importantTerms: ["demo"],
    setupNotes: [],
    sourceHints: [],
  };

  console.log("[claude-smoke] running full pipeline with the Claude Code planner (real `claude -p`)...");
  const result = await runAiUrlDemo({
    outputRoot,
    projectId: "smoke-pipeline-claude",
    createdAt: "2026-06-17T00:00:00.000Z",
    productUrl: server.url,
    repoUrl,
    renderer: "playwright",
    prompt: "Show a viewer clicking Get started on the page. Use only the visible button and input.",
    durationCapSeconds: 12,
    aspectRatio: "16:9",
    analyzeWebsite: async () => websiteAnalysis,
    analyzeRepo: async (_url, options) => {
      await mkdir(options.checkoutDirectory, { recursive: true });
      return repoAnalysis;
    },
    // NOTE: planner is intentionally NOT injected — this exercises the real Claude Code backend.
  });

  for (const rel of [
    "product-understanding.json",
    "demo-strategy.json",
    "storyboard.json",
    "run-summary.json",
    join("playwright", "capture-plan.json"),
    join("playwright", "capture-result.json"),
    join("playwright", "action-trace.json"),
    join("playwright", "render-plan.json"),
  ]) {
    const path = join(outputRoot, rel);
    assert.ok(existsSync(path) && (await stat(path)).size > 0, `expected artifact: ${rel}`);
  }

  assert.equal(result.renderer, "playwright");

  const finalPath = join(outputRoot, "playwright", "final.mp4");
  let finalLine = "final.mp4         (skipped — ffmpeg unavailable)";
  if (existsSync(finalPath)) {
    const duration = await ffprobeDuration(finalPath);
    assert.ok(Number.isFinite(duration) && duration > 0, `final.mp4 should have positive duration, got ${duration}`);
    finalLine = `final.mp4         (${duration.toFixed(2)}s)`;
  }

  console.log("\n[claude-smoke] PASS — Claude Code planner produced a valid plan and the pipeline captured it.");
  console.log(`  run folder : ${outputRoot}`);
  console.log(`  capture-plan: ${join(outputRoot, "playwright", "capture-plan.json")}`);
  console.log(`  ${finalLine}`);
} finally {
  await server.close();
}
