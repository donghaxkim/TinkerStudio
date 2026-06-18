// Smoke test for the smooth Playwright capture pipeline (first pass).
//
// Runs a REAL browser capture (smooth mode) against a local fixture server, then
// produces the three new required artifacts in a generated/<run>/ folder and verifies
// they exist and are non-trivial:
//   - action-trace.json
//   - render-plan.json
//   - final.mp4 (real ffmpeg transcode of the recording; probed for a valid duration)
//
// Requires ffmpeg/ffprobe on PATH and Playwright's Chromium installed. Run via:
//   pnpm --filter @tinker/browser-capture smoke:smooth

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildRenderPlan } from "./renderPlan.js";
import { transcodeToMp4 } from "./finalVideo.js";
import { deriveActionTraceFromCapture } from "./actionTrace.js";
import { runPlaywrightCapture } from "./playwrightCapture.js";
import type { CapturePlan } from "./types.js";

const FPS = 30;

const FIXTURE_HTML = `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Smooth capture fixture</title></head>
  <body style="margin:0;font-family:system-ui,sans-serif">
    <header style="height:140px;display:flex;align-items:center;justify-content:center;background:#0b1220;color:#fff">
      <h1 style="margin:0">Tinker Smooth Capture</h1>
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
      const address = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${address.port}/`);
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

async function fileSize(path: string): Promise<number> {
  return (await stat(path)).size;
}

function toPrettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const runDir = join(repoRoot, "generated", "smoke-smooth-playwright");
const captureDir = join(runDir, "capture");

await rm(runDir, { recursive: true, force: true });
await mkdir(captureDir, { recursive: true });

const server = await startServer(FIXTURE_HTML);
try {
  const plan: CapturePlan = {
    targetUrl: server.url,
    viewport: { width: 1280, height: 720 },
    steps: [
      { type: "goto", url: server.url },
      { type: "scroll", y: 500 },
      { type: "click", selector: "[data-testid='cta']", label: "Get started" },
      { type: "type", selector: "[data-testid='email']", text: "demo@tinker.dev" },
    ],
    expectedCheckpoints: [{ id: "started", label: "Started", text: "Started" }],
  };

  console.log("[smoke] running smooth Playwright capture...");
  const capture = await runPlaywrightCapture(plan, { outputDir: captureDir, headless: true, smooth: true });
  assert.equal(capture.checkpoints[0]?.passed, true, "the CTA click should flip the checkpoint to Started");

  const actionTrace = capture.actionTrace ?? deriveActionTraceFromCapture(plan, capture, { fps: FPS });
  assert.ok(actionTrace.actions.length >= 4, `expected >=4 traced actions, got ${actionTrace.actions.length}`);
  assert.ok(
    actionTrace.actions.every((action) => action.status === "success"),
    "every action in the smoke run should succeed",
  );

  const actionTracePath = join(runDir, "action-trace.json");
  await writeFile(actionTracePath, toPrettyJson(actionTrace));

  const renderPlan = buildRenderPlan(actionTrace, { fps: FPS });
  assert.ok(renderPlan.zoomSegments.length >= 1, "render plan should contain at least one zoom segment");
  assert.ok(renderPlan.clickEffects.length >= 1, "render plan should contain a click effect");
  const renderPlanPath = join(runDir, "render-plan.json");
  await writeFile(renderPlanPath, toPrettyJson(renderPlan));

  const rawWebm = join(captureDir, "videos", "main.webm");
  assert.ok((await fileSize(rawWebm)) > 0, "raw recording should be non-empty");

  console.log("[smoke] transcoding recording -> final.mp4...");
  const finalPath = join(runDir, "final.mp4");
  await transcodeToMp4(rawWebm, finalPath, { fps: FPS });

  const finalBytes = await fileSize(finalPath);
  assert.ok(finalBytes > 0, "final.mp4 should be non-empty");
  const duration = await ffprobeDuration(finalPath);
  assert.ok(Number.isFinite(duration) && duration > 0, `final.mp4 should have a positive duration, got ${duration}`);

  // Required-output assertions.
  for (const path of [actionTracePath, renderPlanPath, finalPath]) {
    assert.ok((await fileSize(path)) > 0, `expected non-empty artifact: ${path}`);
  }

  console.log("\n[smoke] PASS");
  console.log(`  run folder      : ${runDir}`);
  console.log(`  action-trace.json (${actionTrace.actions.length} actions)`);
  console.log(`  render-plan.json  (${renderPlan.zoomSegments.length} zooms, ${renderPlan.clickEffects.length} clicks, ${renderPlan.holds.length} holds)`);
  console.log(`  final.mp4         (${finalBytes} bytes, ${duration.toFixed(2)}s, raw: ${rawWebm})`);
} finally {
  await server.close();
}
