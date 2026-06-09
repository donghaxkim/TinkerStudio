import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkpointTarget, fullPageDocumentDimensions, locatorTarget, usableSelector } from "./playwrightCaptureInternals.js";
import { runPlaywrightCapture } from "./playwrightCapture.js";
import { CaptureError, type CapturePlan } from "./types.js";

const outputDir = await mkdtemp(join(tmpdir(), "browser-capture-output-"));

async function startHtmlServer(html: string) {
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

  const offOriginServer = await startHtmlServer("<html><body><h1>Off origin</h1></body></html>");
  const originServer = await startHtmlServer(
    `<html><body><a data-testid="leave-origin" href="${offOriginServer.url}">Leave</a></body></html>`,
  );

  try {
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
  } finally {
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
