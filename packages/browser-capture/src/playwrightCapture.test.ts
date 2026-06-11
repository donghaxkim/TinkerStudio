import assert from "node:assert/strict";
import { createServer } from "node:http";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkpointTarget, fullPageDocumentDimensions, isAllowedCaptureUrl, locatorTarget, usableSelector } from "./playwrightCaptureInternals.js";
import { runPlaywrightCapture } from "./playwrightCapture.js";
import { CaptureError, type CapturePlan } from "./types.js";

const outputDir = await mkdtemp(join(tmpdir(), "browser-capture-output-"));

async function startHtmlServer(html: string, onRequest?: () => void) {
  const server = createServer((_request, response) => {
    onRequest?.();
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
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      }),
  };
}

const invalidPlan: CapturePlan = {
  targetUrl: "",
  viewport: { width: 1280, height: 720 },
  steps: [],
  expectedCheckpoints: [],
};

try {
  await assert.rejects(
    () => runPlaywrightCapture(invalidPlan, { outputDir }),
    (error) => error instanceof CaptureError && /Invalid capture plan/.test(error.message),
  );

  assert.equal(usableSelector(undefined), undefined);
  assert.equal(usableSelector(""), undefined);
  assert.equal(usableSelector("   "), undefined);
  assert.equal(usableSelector("  [data-testid='start-demo']  "), "[data-testid='start-demo']");
  assert.deepEqual(locatorTarget({ selector: "  ", text: "Start demo" }), { kind: "text", text: "Start demo" });
  assert.deepEqual(locatorTarget({ selector: "  [data-testid='start-demo']  ", text: "Start demo" }), {
    kind: "selector",
    selector: "[data-testid='start-demo']",
  });
  assert.deepEqual(checkpointTarget({ selector: "  ", text: "Export" }), { kind: "text", text: "Export" });
  assert.deepEqual(checkpointTarget({ selector: "  [data-testid='export-card']  ", text: "Export" }), {
    kind: "selector",
    selector: "[data-testid='export-card']",
  });
  assert.equal(isAllowedCaptureUrl("https://longcut.ai/analyze/demo", "https://www.longcut.ai/"), true);
  assert.equal(isAllowedCaptureUrl("https://www.longcut.ai/analyze/demo", "https://longcut.ai/"), true);
  assert.equal(isAllowedCaptureUrl("https://evil.example/analyze/demo", "https://www.longcut.ai/"), false);
  assert.equal(isAllowedCaptureUrl("http://longcut.ai/analyze/demo", "https://www.longcut.ai/"), false);

  const captureServer = await startHtmlServer("<html><body><h1>Capture target</h1></body></html>");
  try {
    const capturePlan: CapturePlan = {
      targetUrl: captureServer.url,
      viewport: { width: 640, height: 480 },
      steps: [{ type: "goto", url: captureServer.url }],
      expectedCheckpoints: [{ id: "capture-target", label: "Capture target", text: "Capture target" }],
    };
    const mainVideoPath = join(outputDir, "videos", "main.webm");
    const result = await runPlaywrightCapture(capturePlan, { outputDir });

    assert.equal(result.clips[0]?.id, "capture-video-main");
    assert.equal(result.clips[0]?.uri, "videos/main.webm");
    await access(mainVideoPath);

    const staleVideo = Buffer.from("stale-video");
    await writeFile(mainVideoPath, staleVideo);
    const overwriteResult = await runPlaywrightCapture(capturePlan, { outputDir });

    assert.equal(overwriteResult.clips[0]?.id, "capture-video-main");
    assert.equal(overwriteResult.clips[0]?.uri, "videos/main.webm");
    assert.notDeepEqual(await readFile(mainVideoPath), staleVideo);
  } finally {
    await captureServer.close();
  }

  const submitServer = await startHtmlServer(`
    <html>
      <body>
        <form onsubmit="event.preventDefault(); document.querySelector('[data-testid=result]').textContent = 'Submitted';">
          <input data-testid="sample-url" />
        </form>
        <main data-testid="result">Waiting</main>
      </body>
    </html>
  `);
  try {
    const submitPlan: CapturePlan = {
      targetUrl: submitServer.url,
      viewport: { width: 640, height: 480 },
      steps: [
        { type: "goto", url: submitServer.url },
        { type: "type", selector: "[data-testid='sample-url']", text: "https://www.youtube.com/watch?v=jGwO_UgTS7I" },
        { type: "press", selector: "[data-testid='sample-url']", key: "Enter" },
      ],
      expectedCheckpoints: [{ id: "submitted", label: "Submitted", text: "Submitted" }],
    };

    const submitResult = await runPlaywrightCapture(submitPlan, { outputDir });
    assert.equal(submitResult.checkpoints[0]?.passed, true);
  } finally {
    await submitServer.close();
  }

  let offOriginRequestCount = 0;
  const offOriginServer = await startHtmlServer("<html><body><h1>Off origin</h1></body></html>", () => {
    offOriginRequestCount += 1;
  });
  const originServer = await startHtmlServer(
    `<html><body><a data-testid="leave-origin" href="${offOriginServer.url}">Leave</a><a data-testid="popup-origin" href="${offOriginServer.url}" target="_blank">Popup</a></body></html>`,
  );
  const iframeServer = await startHtmlServer(
    `<html><body><h1>Embedded player</h1><iframe title="player" src="${offOriginServer.url}"></iframe></body></html>`,
  );

  try {
    const iframeResult = await runPlaywrightCapture(
      {
        targetUrl: iframeServer.url,
        viewport: { width: 640, height: 480 },
        steps: [{ type: "goto", url: iframeServer.url }],
        expectedCheckpoints: [{ id: "embedded-player", label: "Embedded player", text: "Embedded player" }],
      },
      { outputDir },
    );
    assert.equal(iframeResult.checkpoints[0]?.passed, true);
    const iframeOffOriginRequestCount = offOriginRequestCount;
    assert.ok(iframeOffOriginRequestCount > 0);

    await assert.rejects(
      () =>
        runPlaywrightCapture(
          {
            targetUrl: originServer.url,
            viewport: { width: 640, height: 480 },
            steps: [{ type: "goto", url: offOriginServer.url }],
            expectedCheckpoints: [],
          },
          { outputDir },
        ),
      (error: unknown) => error instanceof CaptureError && /goto url must stay on target origin/.test(error.message),
    );
    assert.equal(offOriginRequestCount, iframeOffOriginRequestCount);

    await assert.rejects(
      () =>
        runPlaywrightCapture(
          {
            targetUrl: originServer.url,
            viewport: { width: 640, height: 480 },
            steps: [{ type: "goto", url: originServer.url }, { type: "click", selector: "[data-testid='leave-origin']" }],
            expectedCheckpoints: [],
          },
          { outputDir },
        ),
      (error: unknown) => error instanceof CaptureError && /navigated away from target origin/.test(error.message),
    );
    assert.equal(offOriginRequestCount, iframeOffOriginRequestCount);

    await assert.rejects(
      () =>
        runPlaywrightCapture(
          {
            targetUrl: originServer.url,
            viewport: { width: 640, height: 480 },
            steps: [{ type: "goto", url: originServer.url }, { type: "click", selector: "[data-testid='popup-origin']" }],
            expectedCheckpoints: [],
          },
          { outputDir },
        ),
      (error: unknown) => error instanceof CaptureError && /created a new page/.test(error.message),
    );
    assert.equal(offOriginRequestCount, iframeOffOriginRequestCount);
  } finally {
    await iframeServer.close();
    await originServer.close();
    await offOriginServer.close();
  }

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      documentElement: { scrollWidth: 900, clientWidth: 800, offsetWidth: 850, scrollHeight: 1600, clientHeight: 700, offsetHeight: 750 },
      body: { scrollWidth: 920, clientWidth: 780, offsetWidth: 860, scrollHeight: 1550, clientHeight: 720, offsetHeight: 1700 },
    },
  });
  assert.deepEqual(fullPageDocumentDimensions(), { width: 920, height: 1700 });
  delete (globalThis as { document?: unknown }).document;
} finally {
  await rm(outputDir, { recursive: true, force: true });
}

console.log("playwrightCapture tests passed");
