import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { startFixtureServer } from "@tinker/browser-capture";
import { analyzeWebsite } from "./analyzeWebsite.js";
import { analyzeWebsiteWithBrowserLauncher } from "./analyzeWebsite.internal.js";

const fixtureUrl = new URL("../../browser-capture/fixtures/manual-demo.html", import.meta.url);
const outputDirectory = await mkdtemp(join(tmpdir(), "tinker-product-analysis-"));
const server = await startFixtureServer(fixtureUrl);

const listen = (server: ReturnType<typeof createServer>) =>
  new Promise<string>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      assert.ok(address !== null && typeof address !== "string");
      resolve(`http://127.0.0.1:${address.port}/`);
    });
  });

const close = (server: ReturnType<typeof createServer>) =>
  new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });

try {
  const setupError = new Error("newPage failed");
  let browserClosed = false;

  await assert.rejects(
    () =>
      analyzeWebsiteWithBrowserLauncher("https://example.test", {}, async () => ({
        newPage: async () => {
          throw setupError;
        },
        close: async () => {
          browserClosed = true;
        },
      })),
    (error) => error === setupError,
  );
  assert.equal(browserClosed, true);

  let nonHttpLaunchCount = 0;
  await assert.rejects(
    () =>
      analyzeWebsiteWithBrowserLauncher("file:///tmp/product.html", {}, async () => {
        nonHttpLaunchCount += 1;

        return {
          newPage: async () => {
            throw new Error("browser should not launch for non-http URLs");
          },
          close: async () => undefined,
        };
      }),
    /Website URL must be an http or https URL/,
  );
  assert.equal(nonHttpLaunchCount, 0);

  const abortController = new AbortController();
  let abortBrowserClosed = false;
  let enteredGoto!: () => void;
  const enteredGotoPromise = new Promise<void>((resolve) => {
    enteredGoto = resolve;
  });
  await assert.rejects(
    async () => {
      const analysisPromise = analyzeWebsiteWithBrowserLauncher("https://example.test", { signal: abortController.signal }, async () => ({
        newPage: async () => ({
          goto: async () => {
            enteredGoto();
            return new Promise((_resolve, reject) => {
              abortController.signal.addEventListener("abort", () => reject(new Error("browser closed by abort")), { once: true });
            });
          },
          close: async () => undefined,
        } as never),
        close: async () => {
          abortBrowserClosed = true;
        },
      }));
      await enteredGotoPromise;
      abortController.abort();
      await analysisPromise;
    },
    (error) => error instanceof DOMException && error.name === "AbortError",
  );
  assert.equal(abortBrowserClosed, true);

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

  const canonicalServer = createServer((request, response) => {
    if (request.url === "/") {
      response.writeHead(302, { location: "/canonical" });
      response.end();
      return;
    }

    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><title>Canonical Product</title><h1>Canonical Product</h1>");
  });
  const canonicalServerUrl = await listen(canonicalServer);

  try {
    const canonicalAnalysis = await analyzeWebsite(canonicalServerUrl, { timeoutMs: 5000, headless: true });

    assert.equal(canonicalAnalysis.url, new URL("/canonical", canonicalServerUrl).href);
  } finally {
    await close(canonicalServer);
  }

  const pendingRequestServer = createServer((request, response) => {
    if (request.url === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><title>Pending Request</title><h1>Ready</h1><script>fetch("/pending")</script>`);
      return;
    }

    if (request.url === "/pending") {
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      response.write("pending");
      return;
    }

    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  });
  const pendingRequestUrl = await listen(pendingRequestServer);

  try {
    const pendingRequestAnalysis = await analyzeWebsite(pendingRequestUrl, { timeoutMs: 5000, headless: true });

    assert.equal(pendingRequestAnalysis.title, "Pending Request");
  } finally {
    await close(pendingRequestServer);
  }

  const dedupeFixturePath = join(outputDirectory, "dedupe.html");
  await writeFile(
    dedupeFixturePath,
    `<!doctype html>
      <title>Dedupe Fixture</title>
      <h1>Dedupe Fixture</h1>
      <a href="/pricing"> Pricing </a>
      <a href="/pricing">Pricing</a>
      <a href="/docs">Docs</a>
      <input data-testid="email" aria-label="Email" placeholder="you@example.com" />
      <input data-testid="email" aria-label="Email" placeholder="you@example.com" />
      <input data-testid="plan" aria-label="Plan" />`,
  );
  const dedupeServer = await startFixtureServer(pathToFileURL(dedupeFixturePath));

  try {
    const dedupeAnalysis = await analyzeWebsite(dedupeServer.url, { timeoutMs: 5000, headless: true });

    assert.deepEqual(dedupeAnalysis.links, [
      { text: "Pricing", href: new URL("/pricing", dedupeServer.url).href },
      { text: "Docs", href: new URL("/docs", dedupeServer.url).href },
    ]);
    assert.deepEqual(dedupeAnalysis.inputs, [
      { label: "Email", placeholder: "you@example.com", selectorHint: "[data-testid='email']" },
      { label: "Plan", selectorHint: "[data-testid='plan']" },
    ]);
  } finally {
    await dedupeServer.close();
  }
} finally {
  await server.close();
  await rm(outputDirectory, { recursive: true, force: true });
}

console.log("analyze website tests passed");
