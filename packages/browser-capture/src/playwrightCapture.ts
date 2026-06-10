import { mkdir, rename, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { chromium, type Page, type Route } from "playwright";
import {
  createClickEvent,
  createCursorEvent,
  createScrollEvent,
  createZoomTargetEvent,
  secondsSince,
} from "./captureEvents.js";
import { checkpointTarget, fullPageDocumentDimensions, locatorTarget, usableSelector } from "./playwrightCaptureInternals.js";
import { assertValidCapturePlan } from "./verifyCapturePlan.js";
import { CaptureError, type CaptureAsset, type CaptureEvent, type CapturePlan, type CaptureResult } from "./types.js";

export type RunPlaywrightCaptureOptions = { outputDir: string; headless?: boolean };

function assetUri(outputDir: string, path: string) {
  return relative(outputDir, path).split("\\").join("/");
}

async function createAsset(
  id: string,
  outputDir: string,
  path: string,
  type: "video" | "image",
  mimeType: string,
  dimensions: { width: number; height: number },
  duration?: number,
): Promise<CaptureAsset> {
  const stats = await stat(path);

  return {
    id,
    type,
    uri: assetUri(outputDir, path),
    source: "captured",
    mimeType,
    duration,
    width: dimensions.width,
    height: dimensions.height,
    sizeBytes: stats.size,
  };
}

function resolveStepLocator(page: Page, step: { selector?: string; text?: string }) {
  const target = locatorTarget(step);
  return target.kind === "selector" ? page.locator(target.selector).first() : page.getByText(target.text, { exact: false }).first();
}

async function evaluateCheckpoints(page: Page, plan: CapturePlan) {
  const results = [];

  for (const checkpoint of plan.expectedCheckpoints) {
    const target = checkpointTarget(checkpoint);
    const count = target.kind === "selector"
      ? await page.locator(target.selector).count()
      : await page.getByText(target.text, { exact: false }).count();
    const targetDescription = target.kind === "selector" ? `selector '${target.selector}'` : `text '${target.text}'`;

    results.push({
      ...checkpoint,
      passed: count > 0,
      message: count > 0 ? undefined : `Expected checkpoint ${targetDescription} to exist, found ${count}`,
    });
  }

  return results;
}

function stepErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function targetOrigin(targetUrl: string) {
  try {
    return new URL(targetUrl).origin;
  } catch {
    return undefined;
  }
}

function assertPageStayedOnTargetOrigin(pageUrl: string, origin: string | undefined, stepIndex: number) {
  if (origin === undefined) {
    return;
  }

  let currentOrigin: string;
  try {
    currentOrigin = new URL(pageUrl).origin;
  } catch {
    throw new CaptureError(`Capture step ${stepIndex} navigated away from target origin`, stepIndex);
  }

  if (currentOrigin !== origin) {
    throw new CaptureError(`Capture step ${stepIndex} navigated away from target origin`, stepIndex);
  }
}

function assertGotoStepsStayOnTargetOrigin(plan: CapturePlan, origin: string | undefined) {
  if (origin === undefined) {
    return;
  }

  plan.steps.forEach((step, index) => {
    if (step.type !== "goto") {
      return;
    }

    if (targetOrigin(step.url) !== origin) {
      throw new CaptureError(`Capture step ${index} goto url must stay on target origin`, index);
    }
  });
}

async function blockOffOriginNavigation(route: Route, origin: string | undefined, error: CaptureError) {
  const request = route.request();
  const requestOrigin = targetOrigin(request.url());

  if (request.isNavigationRequest() && requestOrigin !== undefined && origin !== undefined && requestOrigin !== origin) {
    await route.abort("blockedbyclient");
    return error;
  }

  await route.continue();
  return undefined;
}

export async function runPlaywrightCapture(
  plan: CapturePlan,
  options: RunPlaywrightCaptureOptions,
): Promise<CaptureResult> {
  assertValidCapturePlan(plan);
  const origin = targetOrigin(plan.targetUrl);
  assertGotoStepsStayOnTargetOrigin(plan, origin);

  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs);
  const videoDir = join(options.outputDir, "videos");
  const screenshotDir = join(options.outputDir, "screenshots");
  const screenshotPath = join(screenshotDir, "final.png");
  const events: CaptureEvent[] = [];

  await mkdir(videoDir, { recursive: true });
  await mkdir(screenshotDir, { recursive: true });

  let browser;
  let context;

  try {
    browser = await chromium.launch({ headless: options.headless ?? true });
    context = await browser.newContext({
      viewport: plan.viewport,
      recordVideo: { dir: videoDir, size: plan.viewport },
    });

    let activeStepIndex = -1;
    let blockedNavigationError: CaptureError | undefined;
    let popupError: CaptureError | undefined;

    await context.route("**/*", async (route) => {
      const error = await blockOffOriginNavigation(
        route,
        origin,
        new CaptureError(`Capture step ${activeStepIndex} navigated away from target origin`, activeStepIndex),
      );

      if (error !== undefined) {
        blockedNavigationError = error;
      }
    });

    const page = await context.newPage();

    context.on("page", (newPage) => {
      if (newPage === page) {
        return;
      }

      popupError = new CaptureError(`Capture step ${activeStepIndex} created a new page`, activeStepIndex);
      void newPage.close().catch(() => undefined);
    });

    for (const [index, step] of plan.steps.entries()) {
      try {
        activeStepIndex = index;
        blockedNavigationError = undefined;
        popupError = undefined;
        switch (step.type) {
          case "goto":
            await page.goto(step.url, { waitUntil: "networkidle" });
            break;
          case "waitForSelector":
            await page.waitForSelector(step.selector, { timeout: step.timeoutMs ?? 5_000 });
            break;
          case "click": {
            const locator = resolveStepLocator(page, step);
            const box = await locator.boundingBox();
            const popupPromise = page.waitForEvent("popup", { timeout: 250 }).catch(() => undefined);
            await locator.click();
            const popup = await popupPromise;

            if (popup !== undefined) {
              popupError = new CaptureError(`Capture step ${index} created a new page`, index);
              await popup.close().catch(() => undefined);
            }

            if (box !== null) {
              const x = Math.round(box.x + box.width / 2);
              const y = Math.round(box.y + box.height / 2);
              const label = step.label ?? step.text;
              events.push(createCursorEvent({ startedAtMs, x, y }));
              events.push(createClickEvent({ startedAtMs, x, y, label }));
              events.push(createZoomTargetEvent({
                startedAtMs,
                x: Math.round(box.x),
                y: Math.round(box.y),
                width: Math.round(box.width),
                height: Math.round(box.height),
                label,
              }));
            }
            break;
          }
          case "type":
            await page.locator(step.selector).fill(step.text);
            break;
          case "scroll": {
            const selector = usableSelector(step.selector);
            if (selector !== undefined) {
              await page.locator(selector).scrollIntoViewIfNeeded();
            }

            const deltaX = step.x ?? 0;
            const deltaY = step.y ?? 0;
            await page.mouse.wheel(deltaX, deltaY);
            const position = await page.evaluate<{ x: number; y: number }>("({ x: window.scrollX, y: window.scrollY })");
            events.push(createScrollEvent({ startedAtMs, x: position.x, y: position.y, deltaX, deltaY }));
            break;
          }
          case "hover":
            await resolveStepLocator(page, step).hover();
            break;
          case "pause":
            await page.waitForTimeout(step.ms);
            break;
        }
        if (popupError !== undefined) {
          throw popupError;
        }
        if (blockedNavigationError !== undefined) {
          throw blockedNavigationError;
        }
        assertPageStayedOnTargetOrigin(page.url(), origin, index);
      } catch (error) {
        if (popupError !== undefined) {
          throw popupError;
        }
        if (blockedNavigationError !== undefined) {
          throw blockedNavigationError;
        }
        if (error instanceof CaptureError) {
          throw error;
        }
        throw new CaptureError(`Capture step ${index} failed: ${stepErrorMessage(error)}`, index);
      }
    }

    await page.screenshot({ path: screenshotPath, fullPage: true });
    const screenshotDimensions = await page.evaluate<{ width: number; height: number }>(fullPageDocumentDimensions);
    const checkpoints = await evaluateCheckpoints(page, plan);
    const video = page.video();

    await context.close();
    context = undefined;

    const videoPath = video === null ? undefined : await video.path();
    await browser.close();
    browser = undefined;

    const mainVideoPath = join(videoDir, "main.webm");
    if (videoPath !== undefined && videoPath !== mainVideoPath) {
      await rename(videoPath, mainVideoPath);
    }

    const completedAtMs = Date.now();
    const completedAt = new Date(completedAtMs);
    const screenshots = [await createAsset("screenshot-final", options.outputDir, screenshotPath, "image", "image/png", screenshotDimensions)];
    const clips = videoPath === undefined
      ? []
      : [await createAsset("capture-video-main", options.outputDir, mainVideoPath, "video", "video/webm", plan.viewport, secondsSince(startedAtMs, completedAtMs))];

    return {
      clips,
      screenshots,
      events,
      checkpoints,
      metadata: {
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        targetUrl: plan.targetUrl,
        viewport: plan.viewport,
      },
    };
  } catch (error) {
    if (context !== undefined) {
      await context.close().catch(() => undefined);
    }
    if (browser !== undefined) {
      await browser.close().catch(() => undefined);
    }
    throw error;
  }
}
