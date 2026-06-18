// synthetic-cursor module (first pass)
//
// Renders a fake cursor + click ripple INTO the captured page so Playwright's video
// recorder bakes smooth pointer motion into the .webm itself (no dependency on OS /
// native cursor capture, which headless Chromium does not record anyway).
//
// The in-page engine is shipped as a string because it runs in the browser and must
// not pull DOM types into this Node package. It inlines the same minimum-jerk easing
// as `cursorPath.ts` (injected scripts cannot import) and also hosts the eased-scroll
// engine that `smoothScroll.ts` drives — both attach to one `window.__tinkerSmooth`.

import type { Page } from "playwright";
import type { Point } from "./cursorPath.js";

/**
 * A clean macOS-style arrow with a white outline so it reads on any background.
 * Symmetric arrowhead: left edge vertical, top-right edge a true 45°, tip at (1,1)
 * so it lands on the pointer point (the 1px inset keeps the white stroke from clipping).
 * The previous path was a hand-drawn, lopsided wedge that read as "crooked" when scaled.
 */
const CURSOR_SVG =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M1 1 L1 17.8 L5.2 13.6 L8 20 L10.6 18.9 L7.8 12.6 L12.6 12.6 Z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>' +
  "</svg>";

/**
 * Idempotent in-page bootstrap. Defines window.__tinkerSmooth with:
 *   moveTo(x,y,ms)        — min-jerk eased pointer move (returns a Promise)
 *   ripple(x,y)           — expanding ring + cursor press-bounce
 *   smoothScrollTo/By     — easeInOutCubic rAF scroll (returns a Promise)
 * Mounting is lazy so it survives being injected before <body> exists.
 */
export const SMOOTH_LAYER_SOURCE = `
(() => {
  if (window.__tinkerSmooth) return;
  const raf = (fn) => (window.requestAnimationFrame || ((cb) => setTimeout(() => cb(performance.now()), 16)))(fn);

  const style = document.createElement('style');
  style.setAttribute('data-tinker-smooth', '');
  style.textContent = '*{cursor:none !important}';

  const cursor = document.createElement('div');
  cursor.setAttribute('data-tinker-cursor', '');
  Object.assign(cursor.style, {
    position: 'fixed', left: '0px', top: '0px', width: '24px', height: '24px', margin: '0', padding: '0',
    zIndex: '2147483647', pointerEvents: 'none', transformOrigin: '1px 1px',
    transform: 'scale(1)', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))', willChange: 'left, top, transform',
  });
  cursor.innerHTML = ${JSON.stringify(CURSOR_SVG)};

  // Mounting is null-guarded because this bootstrap is registered via addInitScript and
  // therefore runs at document_start, before <html>/<head>/<body> exist. Eagerly
  // appending then would throw and abort the whole script (and __tinkerSmooth would
  // never get defined), so we mount lazily and on DOMContentLoaded instead.
  const mountStyle = () => { const p = document.head || document.documentElement; if (p && !style.isConnected) p.appendChild(style); };
  const mountCursor = () => { const p = document.body || document.documentElement; if (p && !cursor.isConnected) p.appendChild(cursor); };
  const ensureMounted = () => { mountStyle(); mountCursor(); };

  const state = { x: (window.innerWidth || 1280) / 2, y: (window.innerHeight || 720) / 2 };
  const place = (x, y) => { state.x = x; state.y = y; cursor.style.left = x + 'px'; cursor.style.top = y + 'px'; };

  const minJerk = (u) => { const c = Math.min(1, Math.max(0, u)); return 10 * c ** 3 - 15 * c ** 4 + 6 * c ** 5; };
  const easeInOutCubic = (t) => { const c = Math.min(1, Math.max(0, t)); return c < 0.5 ? 4 * c ** 3 : 1 - Math.pow(-2 * c + 2, 3) / 2; };

  function moveTo(x, y, durationMs) {
    ensureMounted();
    const fromX = state.x, fromY = state.y;
    const dur = Math.max(0, durationMs || 0);
    if (dur < 16) { place(x, y); return Promise.resolve(); }
    return new Promise((resolve) => {
      const start = performance.now();
      const tick = (now) => {
        const u = Math.min(1, (now - start) / dur);
        const s = minJerk(u);
        place(fromX + (x - fromX) * s, fromY + (y - fromY) * s);
        if (u < 1) raf(tick); else resolve();
      };
      raf(tick);
    });
  }

  function ripple(x, y) {
    ensureMounted();
    const host = document.body || document.documentElement;
    if (!host) return;
    const ring = document.createElement('div');
    Object.assign(ring.style, {
      position: 'fixed', left: x + 'px', top: y + 'px', width: '14px', height: '14px',
      marginLeft: '-7px', marginTop: '-7px', borderRadius: '50%',
      border: '2px solid rgba(56,132,255,0.9)', background: 'rgba(56,132,255,0.16)',
      zIndex: '2147483646', pointerEvents: 'none', transform: 'scale(0.3)', opacity: '0.95',
      transition: 'transform 450ms cubic-bezier(0.22,1,0.36,1), opacity 450ms ease-out',
    });
    host.appendChild(ring);
    raf(() => raf(() => { ring.style.transform = 'scale(2.8)'; ring.style.opacity = '0'; }));
    setTimeout(() => ring.remove(), 600);
    cursor.style.transform = 'scale(0.82)';
    setTimeout(() => { cursor.style.transform = 'scale(1)'; }, 120);
  }

  function currentScroll() {
    const el = document.scrollingElement || document.documentElement;
    return { x: window.scrollX || el.scrollLeft || 0, y: window.scrollY || el.scrollTop || 0 };
  }
  function smoothScrollTo(x, y, durationMs) {
    const dur = Math.max(0, durationMs || 0);
    const from = currentScroll();
    if (dur < 16) { window.scrollTo(x, y); return Promise.resolve(currentScroll()); }
    return new Promise((resolve) => {
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / dur);
        const s = easeInOutCubic(t);
        window.scrollTo(from.x + (x - from.x) * s, from.y + (y - from.y) * s);
        if (t < 1) raf(tick); else resolve(currentScroll());
      };
      raf(tick);
    });
  }
  function smoothScrollBy(dx, dy, durationMs) {
    const from = currentScroll();
    return smoothScrollTo(from.x + (dx || 0), from.y + (dy || 0), durationMs);
  }

  // Define the API first so it always exists even if mounting is deferred, then mount
  // now (no-op when the DOM is not ready yet) and again on DOMContentLoaded.
  window.__tinkerSmooth = {
    moveTo, ripple, smoothScrollTo, smoothScrollBy, place, currentScroll,
    get pos() { return { x: state.x, y: state.y }; },
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { ensureMounted(); place(state.x, state.y); }, { once: true });
  }
  ensureMounted();
  place(state.x, state.y);
})();
`;

function n(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

/** Install the smooth layer so it (re)injects on every navigation, plus the current doc. */
export async function installSmoothLayer(page: Page): Promise<void> {
  await page.addInitScript(SMOOTH_LAYER_SOURCE);
  // If a document is already loaded (e.g. installed after the first goto), inject now too.
  await page.evaluate(SMOOTH_LAYER_SOURCE).catch(() => undefined);
}

/** Animate the synthetic cursor to a point; resolves only after the in-page motion finishes. */
export async function moveCursorTo(page: Page, to: Point, durationMs: number): Promise<void> {
  await page.evaluate(`window.__tinkerSmooth && window.__tinkerSmooth.moveTo(${n(to.x)}, ${n(to.y)}, ${n(durationMs)})`);
}

/** Teleport the synthetic cursor without animating (used to seed the start position). */
export async function placeCursor(page: Page, at: Point): Promise<void> {
  await page.evaluate(`window.__tinkerSmooth && window.__tinkerSmooth.place(${n(at.x)}, ${n(at.y)})`);
}

/** Fire a click ripple + cursor press-bounce at a point. */
export async function clickRipple(page: Page, at: Point): Promise<void> {
  await page.evaluate(`window.__tinkerSmooth && window.__tinkerSmooth.ripple(${n(at.x)}, ${n(at.y)})`);
}
