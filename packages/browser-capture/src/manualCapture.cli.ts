// Manual test harness for the smooth Playwright capture (first pass).
//
// Captures the SAME flow twice — once smooth, once plain — so you can eyeball the
// difference, then writes action-trace.json / render-plan.json and opens both mp4s.
//
// Usage (from repo root):
//   pnpm --filter @tinker/browser-capture capture:manual                 # built-in fixture
//   pnpm --filter @tinker/browser-capture capture:manual https://example.com
//   pnpm --filter @tinker/browser-capture capture:manual https://site.com --click "button.cta"
//   ... add --headed to watch the browser drive live, --no-open to skip opening videos.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildRenderPlan } from "./renderPlan.js";
import { transcodeToMp4 } from "./finalVideo.js";
import { runPlaywrightCapture } from "./playwrightCapture.js";
import type { CapturePlan, CaptureStep } from "./types.js";

const FPS = 30;
const VIEWPORT = { width: 1280, height: 720 };

const FIXTURE_HTML = `<!doctype html>
<html><head><meta charset="utf-8" /><title>Smooth capture fixture</title></head>
<body style="margin:0;font-family:system-ui,sans-serif">
  <header style="height:140px;display:flex;align-items:center;justify-content:center;background:#0b1220;color:#fff">
    <h1 style="margin:0">Tinker Smooth Capture</h1></header>
  <div style="height:900px;background:linear-gradient(#fff,#eef)"></div>
  <section style="padding:40px;display:flex;flex-direction:column;gap:16px;align-items:flex-start">
    <button data-testid="cta" style="padding:12px 20px;font-size:16px"
      onclick="document.querySelector('[data-testid=state]').textContent='Started';">Get started</button>
    <input data-testid="email" placeholder="you@example.com" style="padding:10px;font-size:16px;width:280px" />
    <main data-testid="state">Idle</main>
  </section>
</body></html>`;

type Args = { url?: string; clickSelector?: string; headed: boolean; open: boolean };

function parseArgs(argv: string[]): Args {
  const args: Args = { headed: false, open: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--headed") args.headed = true;
    else if (a === "--no-open") args.open = false;
    else if (a === "--click") args.clickSelector = argv[++i];
    else if (!a.startsWith("--")) args.url = a;
  }
  return args;
}

async function startFixture(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((_q, r) => {
    r.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    r.end(FIXTURE_HTML);
  });
  const url = await new Promise<string>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`)),
  );
  return { url, close: () => new Promise<void>((res) => server.close(() => res())) };
}

function buildPlan(url: string, clickSelector: string | undefined, isFixture: boolean): CapturePlan {
  // Scroll-only is safe on any origin; clicks/typing are opt-in so we never trip the
  // capture's off-origin navigation guard on an unknown site.
  const steps: CaptureStep[] = [
    { type: "goto", url },
    { type: "scroll", y: 500 },
    { type: "pause", ms: 500 },
    { type: "scroll", y: 400 },
    { type: "pause", ms: 400 },
  ];
  if (clickSelector) {
    steps.push({ type: "click", selector: clickSelector, label: "Manual click" });
  } else if (isFixture) {
    steps.push({ type: "click", selector: "[data-testid='cta']", label: "Get started" });
    steps.push({ type: "type", selector: "[data-testid='email']", text: "demo@tinker.dev" });
  }
  steps.push({ type: "scroll", y: -900 });
  return { targetUrl: url, viewport: VIEWPORT, steps, expectedCheckpoints: [] };
}

function toPrettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function sizeOf(path: string): Promise<number> {
  return (await stat(path)).size;
}

function openFile(path: string): void {
  // macOS-only convenience; harmless to skip elsewhere.
  if (process.platform !== "darwin") return;
  spawn("open", [path], { stdio: "ignore", detached: true }).unref();
}

const args = parseArgs(process.argv.slice(2));
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const fixture = args.url ? undefined : await startFixture();
const targetUrl = args.url ?? fixture!.url;
const isFixture = fixture !== undefined;
const slug = isFixture ? "fixture" : new URL(targetUrl).hostname.replace(/[^a-z0-9]+/gi, "-");
const runDir = join(repoRoot, "generated", "manual-smooth", slug);

await rm(runDir, { recursive: true, force: true });
await mkdir(runDir, { recursive: true });

const plan = buildPlan(targetUrl, args.clickSelector, isFixture);

async function runMode(label: "smooth" | "plain", smooth: boolean) {
  console.log(`\n[manual] capturing "${label}" (smooth=${smooth}, headed=${args.headed})...`);
  const captureDir = join(runDir, label, "capture");
  await mkdir(captureDir, { recursive: true });
  const capture = await runPlaywrightCapture(plan, { outputDir: captureDir, headless: !args.headed, smooth });
  const webm = join(captureDir, "videos", "main.webm");
  const finalPath = join(runDir, `final-${label}.mp4`);
  await transcodeToMp4(webm, finalPath, { fps: FPS });
  return { capture, finalPath };
}

try {
  const smoothRun = await runMode("smooth", true);
  const plainRun = await runMode("plain", false);

  const trace = smoothRun.capture.actionTrace;
  if (trace) {
    await writeFile(join(runDir, "action-trace.json"), toPrettyJson(trace));
    await writeFile(join(runDir, "render-plan.json"), toPrettyJson(buildRenderPlan(trace, { fps: FPS })));
  }

  const smoothBytes = await sizeOf(smoothRun.finalPath);
  const plainBytes = await sizeOf(plainRun.finalPath);

  console.log("\n[manual] DONE");
  console.log(`  target        : ${targetUrl}`);
  console.log(`  run folder    : ${runDir}`);
  console.log(`  smooth video  : ${smoothRun.finalPath} (${smoothBytes} bytes)`);
  console.log(`  plain video   : ${plainRun.finalPath} (${plainBytes} bytes)`);
  console.log(`  trace/plan    : action-trace.json, render-plan.json`);
  console.log(`\n  Watch them back to back: the smooth one has a gliding cursor, click ripples,`);
  console.log(`  and eased scrolling; the plain one jumps.`);

  if (args.open) {
    openFile(plainRun.finalPath);
    openFile(smoothRun.finalPath);
  }
} finally {
  await fixture?.close();
}
