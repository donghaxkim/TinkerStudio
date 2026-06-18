// smooth-scroll module (first pass)
//
// Replaces Playwright's abrupt `mouse.wheel` jumps with requestAnimationFrame-based
// eased scrolling. The pure helpers (duration + eased position) are unit-tested; the
// actual animation runs in-page via the engine installed by `syntheticCursor.ts`.

import type { Page } from "playwright";
import { easeInOutCubic } from "./cursorPath.js";

export type ScrollPosition = { x: number; y: number };

/**
 * Distance-aware scroll duration. A small nudge resolves quickly; a long fling takes
 * longer so the motion stays legible. Tunable first-pass curve.
 */
export function scrollDurationMs(deltaX: number, deltaY: number): number {
  const distance = Math.hypot(deltaX, deltaY);
  const ms = 220 + distance * 0.7;
  return Math.min(1400, Math.max(320, ms));
}

/** Eased intermediate scroll position at progress `t` in [0,1] (easeInOutCubic). */
export function easedScrollPosition(from: ScrollPosition, to: ScrollPosition, t: number): ScrollPosition {
  const s = easeInOutCubic(t);
  return { x: from.x + (to.x - from.x) * s, y: from.y + (to.y - from.y) * s };
}

function n(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

/**
 * Smoothly scroll the page by a delta and resolve with the resulting scroll offset.
 * Resolves only after the in-page eased animation completes, so the recorder captures
 * the whole glide. Falls back to a plain wheel if the smooth layer is not installed.
 */
export async function smoothScrollBy(
  page: Page,
  deltaX: number,
  deltaY: number,
  durationMs = scrollDurationMs(deltaX, deltaY),
): Promise<ScrollPosition> {
  const result = await page.evaluate(
    `window.__tinkerSmooth ? window.__tinkerSmooth.smoothScrollBy(${n(deltaX)}, ${n(deltaY)}, ${n(durationMs)}) : null`,
  );

  if (result && typeof result === "object") {
    return result as ScrollPosition;
  }

  // No smooth layer — fall back to native wheel and read the offset back.
  await page.mouse.wheel(deltaX, deltaY);
  return (await page.evaluate("({ x: window.scrollX, y: window.scrollY })")) as ScrollPosition;
}
