import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkpointTarget, fullPageDocumentDimensions, locatorTarget, usableSelector } from "./playwrightCaptureInternals.js";
import { runPlaywrightCapture } from "./playwrightCapture.js";
import { CaptureError, type CapturePlan } from "./types.js";

const outputDir = await mkdtemp(join(tmpdir(), "browser-capture-output-"));

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
