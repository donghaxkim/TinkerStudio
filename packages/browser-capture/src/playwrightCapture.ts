import { mkdir, rename, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { chromium, type Page, type Route } from "playwright";
import {
  createClickEvent,
  createCursorPathEvents,
  createScrollEvent,
  createZoomTargetEvent,
  secondsSince,
} from "./captureEvents.js";
import { CURSOR_POST_CLICK_HOLD_MS, CURSOR_PRE_CLICK_DWELL_MS, cursorMoveDurationMs } from "./cursorPath.js";
import { createActionTraceRecorder, type ActionTraceEntry, type TracedActionType } from "./actionTrace.js";
import { clickRipple, installSmoothLayer, moveCursorTo, placeCursor } from "./syntheticCursor.js";
import { smoothScrollBy } from "./smoothScroll.js";
import { checkpointTarget, fullPageDocumentDimensions, isAllowedCaptureUrl, locatorTarget, usableSelector } from "./playwrightCaptureInternals.js";
import { assertValidCapturePlan } from "./verifyCapturePlan.js";
import { CaptureError, type CaptureAsset, type CaptureEvent, type CapturePlan, type CaptureResult } from "./types.js";

export type RunPlaywrightCaptureOptions = {
  outputDir: string;
  headless?: boolean;
  /**
   * Render a synthetic cursor, click ripples and eased scrolling into the page so the
   * recording itself looks smooth (Screen Studio-like). Off by default to preserve the
   * original capture behavior. See syntheticCursor.ts / smoothScroll.ts.
   */
  smooth?: boolean;
  /** Capture before/after screenshots per action into the trace. Defaults to `smooth`. */
  traceScreenshots?: boolean;
};

const PLAYWRIGHT_RECORD_VIDEO_FRAME_RATE = 25;
const TYPE_KEYSTROKE_DELAY_MS = 40;

type CursorPosition = { x: number; y: number };

async function settledCenter(locator: ReturnType<Page["locator"]>): Promise<
  { center: CursorPosition; box: { x: number; y: number; width: number; height: number } } | undefined
> {
  // Scroll the target into view BEFORE measuring; otherwise the click
  // auto-scroll invalidates the recorded coordinates (LongCut regression).
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();

  if (box === null) {
    return undefined;
  }

  return {
    box,
    center: { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) },
  };
}

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
  metadata: Record<string, unknown> = {},
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
    metadata,
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

function assertPageStayedOnTargetOrigin(pageUrl: string, targetUrl: string, stepIndex: number) {
  if (!isAllowedCaptureUrl(pageUrl, targetUrl)) {
    throw new CaptureError(`Capture step ${stepIndex} navigated away from target origin to ${pageUrl}`, stepIndex);
  }
}

function assertGotoStepsStayOnTargetOrigin(plan: CapturePlan) {
  plan.steps.forEach((step, index) => {
    if (step.type !== "goto") {
      return;
    }

    if (!isAllowedCaptureUrl(step.url, plan.targetUrl)) {
      throw new CaptureError(`Capture step ${index} goto url must stay on target origin`, index);
    }
  });
}

async function blockOffOriginNavigation(route: Route, targetUrl: string, error: CaptureError) {
  const request = route.request();

  if (!request.isNavigationRequest() || isAllowedCaptureUrl(request.url(), targetUrl)) {
    await route.continue();
    return undefined;
  }

  let isTopLevelNavigation = true;
  try {
    isTopLevelNavigation = request.frame().parentFrame() === null;
  } catch {
    isTopLevelNavigation = true;
  }

  if (isTopLevelNavigation) {
    await route.abort("blockedbyclient");
    return error;
  }

  await route.continue();
  return undefined;
}

// First-pass: map each capture step to the higher-level traced action type.
const TRACED_TYPE_BY_STEP: Record<CaptureStepType, TracedActionType> = {
  goto: "navigation",
  click: "click",
  type: "type",
  scroll: "scroll",
  hover: "hover",
  press: "press",
  waitForSelector: "wait",
  pause: "wait",
};

type CaptureStepType = CapturePlan["steps"][number]["type"];

function roundedBox(box: { x: number; y: number; width: number; height: number }) {
  return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
}

export async function runPlaywrightCapture(
  plan: CapturePlan,
  options: RunPlaywrightCaptureOptions,
): Promise<CaptureResult> {
  assertValidCapturePlan(plan);
  assertGotoStepsStayOnTargetOrigin(plan);

  const smooth = options.smooth ?? false;
  const traceScreenshots = options.traceScreenshots ?? smooth;

  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs);
  const videoDir = join(options.outputDir, "videos");
  const screenshotDir = join(options.outputDir, "screenshots");
  const actionShotDir = join(screenshotDir, "actions");
  const screenshotPath = join(screenshotDir, "final.png");
  const events: CaptureEvent[] = [];
  const trace = createActionTraceRecorder({
    targetUrl: plan.targetUrl,
    viewport: plan.viewport,
    fps: PLAYWRIGHT_RECORD_VIDEO_FRAME_RATE,
    startedAtMs,
  });

  await mkdir(videoDir, { recursive: true });
  await mkdir(screenshotDir, { recursive: true });
  if (traceScreenshots) {
    await mkdir(actionShotDir, { recursive: true });
  }

  let browser;
  let context;
  let page!: Page;

  // Best-effort viewport screenshot for the action trace; never fails the capture.
  async function traceShot(label: string): Promise<string | undefined> {
    if (!traceScreenshots) {
      return undefined;
    }
    try {
      const path = join(actionShotDir, `${label}.png`);
      await page.screenshot({ path });
      return assetUri(options.outputDir, path);
    } catch {
      return undefined;
    }
  }

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
        plan.targetUrl,
        new CaptureError(`Capture step ${activeStepIndex} navigated away from target origin`, activeStepIndex),
      );

      if (error !== undefined) {
        blockedNavigationError = error;
      }
    });

    page = await context.newPage();
    let lastCursor: CursorPosition = {
      x: Math.round(plan.viewport.width / 2),
      y: Math.round(plan.viewport.height / 2),
    };

    // Register the synthetic cursor/ripple/scroll engine so it (re)injects on every
    // navigation. It mounts lazily, so registering before the first goto is safe.
    if (smooth) {
      await installSmoothLayer(page);
    }

    context.on("page", (newPage) => {
      if (newPage === page) {
        return;
      }

      popupError = new CaptureError(`Capture step ${activeStepIndex} created a new page`, activeStepIndex);
      void newPage.close().catch(() => undefined);
    });

    for (const [index, step] of plan.steps.entries()) {
      const entry: ActionTraceEntry = {
        id: trace.nextId(TRACED_TYPE_BY_STEP[step.type]),
        type: TRACED_TYPE_BY_STEP[step.type],
        status: "success",
        startTime: trace.elapsed(),
        endTime: trace.elapsed(),
      };
      if ("selector" in step && step.selector) entry.selector = step.selector;
      if ("text" in step && step.text) entry.text = step.text;
      if ("label" in step && step.label) entry.description = step.label;
      entry.beforeScreenshot = await traceShot(`${entry.id}-before`);

      try {
        activeStepIndex = index;
        blockedNavigationError = undefined;
        popupError = undefined;
        switch (step.type) {
          case "goto":
            await page.goto(step.url, { waitUntil: "networkidle" });
            if (smooth) {
              await placeCursor(page, lastCursor).catch(() => undefined);
            }
            break;
          case "waitForSelector":
            await page.waitForSelector(step.selector, { timeout: step.timeoutMs ?? 5_000 });
            break;
          case "click": {
            const locator = resolveStepLocator(page, step);
            const target = await settledCenter(locator);

            if (target !== undefined) {
              const moveDurationMs = cursorMoveDurationMs(
                Math.hypot(target.center.x - lastCursor.x, target.center.y - lastCursor.y),
                target.box.width,
              );
              events.push(...createCursorPathEvents({ startedAtMs, from: lastCursor, to: target.center, durationMs: moveDurationMs }));
              if (smooth) {
                await moveCursorTo(page, target.center, moveDurationMs);
                await page.waitForTimeout(CURSOR_PRE_CLICK_DWELL_MS);
              }
              lastCursor = target.center;
            }

            const popupPromise = page.waitForEvent("popup", { timeout: 250 }).catch(() => undefined);
            await locator.click();
            const popup = await popupPromise;

            if (popup !== undefined) {
              popupError = new CaptureError(`Capture step ${index} created a new page`, index);
              await popup.close().catch(() => undefined);
            }

            if (target !== undefined) {
              const label = step.label ?? step.text;
              if (smooth) {
                await clickRipple(page, target.center).catch(() => undefined);
                await page.waitForTimeout(CURSOR_POST_CLICK_HOLD_MS);
              }
              events.push(createClickEvent({ startedAtMs, x: target.center.x, y: target.center.y, label }));
              events.push(createZoomTargetEvent({
                startedAtMs,
                x: Math.round(target.box.x),
                y: Math.round(target.box.y),
                width: Math.round(target.box.width),
                height: Math.round(target.box.height),
                label,
              }));
              entry.clickPoint = { x: target.center.x, y: target.center.y };
              entry.targetBox = roundedBox(target.box);
              if (label && !entry.description) entry.description = label;
            }
            break;
          }
          case "type": {
            const locator = page.locator(step.selector);
            const target = await settledCenter(locator);

            if (target !== undefined) {
              const moveDurationMs = cursorMoveDurationMs(
                Math.hypot(target.center.x - lastCursor.x, target.center.y - lastCursor.y),
                target.box.width,
              );
              events.push(...createCursorPathEvents({ startedAtMs, from: lastCursor, to: target.center, durationMs: moveDurationMs }));
              if (smooth) {
                await moveCursorTo(page, target.center, moveDurationMs);
                await page.waitForTimeout(CURSOR_PRE_CLICK_DWELL_MS);
              }
              lastCursor = target.center;
            }

            await locator.click();

            if (target !== undefined) {
              if (smooth) {
                await clickRipple(page, target.center).catch(() => undefined);
              }
              events.push(createClickEvent({ startedAtMs, x: target.center.x, y: target.center.y }));
              entry.clickPoint = { x: target.center.x, y: target.center.y };
              entry.targetBox = roundedBox(target.box);
            }

            await locator.fill("");
            await locator.pressSequentially(step.text, { delay: TYPE_KEYSTROKE_DELAY_MS });
            break;
          }
          case "press":
            await page.locator(step.selector).press(step.key);
            break;
          case "scroll": {
            const selector = usableSelector(step.selector);
            if (selector !== undefined) {
              await page.locator(selector).scrollIntoViewIfNeeded();
            }

            const deltaX = step.x ?? 0;
            const deltaY = step.y ?? 0;
            let position: { x: number; y: number };
            if (smooth) {
              // Eased rAF scroll so the recording glides instead of jumping.
              position = await smoothScrollBy(page, deltaX, deltaY);
            } else {
              await page.mouse.wheel(deltaX, deltaY);
              position = await page.evaluate<{ x: number; y: number }>("({ x: window.scrollX, y: window.scrollY })");
            }
            events.push(createScrollEvent({ startedAtMs, x: position.x, y: position.y, deltaX, deltaY }));
            entry.scrollPosition = position;
            break;
          }
          case "hover": {
            const locator = resolveStepLocator(page, step);
            const target = await settledCenter(locator);

            if (target !== undefined) {
              const moveDurationMs = cursorMoveDurationMs(
                Math.hypot(target.center.x - lastCursor.x, target.center.y - lastCursor.y),
                target.box.width,
              );
              events.push(...createCursorPathEvents({ startedAtMs, from: lastCursor, to: target.center, durationMs: moveDurationMs }));
              if (smooth) {
                await moveCursorTo(page, target.center, moveDurationMs);
              }
              lastCursor = target.center;
              entry.targetBox = roundedBox(target.box);
            }

            await locator.hover();
            break;
          }
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
        assertPageStayedOnTargetOrigin(page.url(), plan.targetUrl, index);

        entry.endTime = trace.elapsed();
        entry.afterScreenshot = await traceShot(`${entry.id}-after`);
        trace.record(entry);
      } catch (error) {
        entry.status = "error";
        entry.endTime = trace.elapsed();
        entry.error = stepErrorMessage(error);
        trace.record(entry);
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
      : [await createAsset(
        "capture-video-main",
        options.outputDir,
        mainVideoPath,
        "video",
        "video/webm",
        plan.viewport,
        secondsSince(startedAtMs, completedAtMs),
        { recorder: "playwright", frameRate: PLAYWRIGHT_RECORD_VIDEO_FRAME_RATE },
      )];

    return {
      clips,
      screenshots,
      events,
      actionTrace: trace.build(completedAtMs),
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
