# Composition AI Editing — Phase 1b: Composition Preview (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `CompositionPreview` React component that loads a generated composition's `index.html` in a sandboxed iframe, reads its registered GSAP master timeline from `window.__timelines[compositionId]`, exposes the structured model + seeks the playhead, and falls back to the rendered video when the timeline can't be read.

**Architecture:** A pure window-access layer (`getCompositionTimeline` reads `window.__timelines[id]`; `waitForCompositionTimeline` polls a window thunk until the timeline registers or times out) is unit-tested with fake `Window`-like objects. The `CompositionPreview` component composes that layer with Phase 1a's `readCompositionTimeline`, and resolves the iframe's content window through an **injectable seam** (`resolveWindow`, default `iframe.contentWindow`) so its logic is fully testable in jsdom; the real cross-window access is the production default. Lives in `packages/editor/src/composition/`.

**Tech Stack:** TypeScript (ESM, `.js` specifiers), React 19, Vitest (jsdom) + `@testing-library/react` (`render`/`screen`/`fireEvent`/`waitFor`).

**Branch:** `person-b/composition-ai-edit` (continue; Phase 1a already on it).

**Spec:** `docs/superpowers/specs/2026-06-13-composition-ai-edit-design.md` (Component §2: CompositionPreview + adapter; graceful `<video>` fallback; Security).

---

## Context this plan relies on (verified)

- Phase 1a shipped (in `@tinker/editor`): `readCompositionTimeline(timeline: GsapTimelineLike): CompositionTimelineModel`, and types `GsapTimelineLike` (`{ totalDuration(); labels; getChildren() }`), `CompositionTimelineModel` (`{ durationSeconds; clips; labels }`).
- The composition runs on the **loopback origin** for the user who generated it; the iframe is served same-origin via the Vite `/api` proxy, so the parent can read `iframe.contentWindow` (same-origin). The sandbox must therefore be `allow-scripts allow-same-origin` — required to run GSAP **and** read the timeline. This is acceptable because the content is AI-generated code already trusted on loopback (per spec "Security"); it is documented, not silently chosen.
- A generated composition registers its GSAP master timeline at `window.__timelines[compositionId]` (Person A lint-enforced). It exposes (beyond `GsapTimelineLike`) the GSAP control methods `seek(time)`, `play()`, `pause()`.
- `packages/editor` tests run in jsdom with `@testing-library/react`. jsdom does **not** execute iframe scripts, so tests inject a fake content window through the `resolveWindow` seam rather than relying on a real loaded composition. Run one file: `pnpm --filter @tinker/editor test -- <path>`. Imports use `.js` specifiers.
- Real cross-window iframe access (the one thing the seam mocks) is standard same-origin web behavior; it is verified by a manual/real-browser smoke documented in the roadmap and exercised when Phase 1d wires the live app — not by these unit tests.

---

## File Structure

- Create: `packages/editor/src/composition/compositionWindow.ts` — `TimelineRegistryWindow`/`CompositionTimelineHandle` types, `getCompositionTimeline`, `waitForCompositionTimeline`.
- Create: `packages/editor/src/composition/compositionWindow.test.ts` — pure unit tests with fake windows.
- Create: `packages/editor/src/composition/CompositionPreview.tsx` — the React component.
- Create: `packages/editor/src/composition/CompositionPreview.test.tsx` — component tests via the `resolveWindow` seam.
- Modify: `packages/editor/src/index.ts` — export the component, helpers, and types.

---

## Task 1: Window-access layer (`getCompositionTimeline` + `waitForCompositionTimeline`)

**Files:**
- Create: `packages/editor/src/composition/compositionWindow.ts`
- Test: `packages/editor/src/composition/compositionWindow.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/editor/src/composition/compositionWindow.test.ts
import { describe, expect, it } from "vitest";
import {
  getCompositionTimeline,
  waitForCompositionTimeline,
  type CompositionTimelineHandle,
  type TimelineRegistryWindow,
} from "./compositionWindow.js";

function fakeHandle(overrides: Partial<CompositionTimelineHandle> = {}): CompositionTimelineHandle {
  return {
    totalDuration: () => 5,
    labels: {},
    getChildren: () => [],
    seek: () => undefined,
    play: () => undefined,
    pause: () => undefined,
    ...overrides,
  } as CompositionTimelineHandle;
}

describe("getCompositionTimeline", () => {
  it("returns the registered handle for the composition id", () => {
    const handle = fakeHandle();
    const win: TimelineRegistryWindow = { __timelines: { sample: handle } };
    expect(getCompositionTimeline(win, "sample")).toBe(handle);
  });

  it("returns undefined when the registry, id, or window is missing", () => {
    expect(getCompositionTimeline(undefined, "sample")).toBeUndefined();
    expect(getCompositionTimeline({}, "sample")).toBeUndefined();
    expect(getCompositionTimeline({ __timelines: {} }, "sample")).toBeUndefined();
  });

  it("returns undefined when the registered value is not a usable timeline handle", () => {
    const win = { __timelines: { sample: { totalDuration: () => 5 } } } as unknown as TimelineRegistryWindow;
    expect(getCompositionTimeline(win, "sample")).toBeUndefined();
  });
});

describe("waitForCompositionTimeline", () => {
  it("resolves once the handle registers after some polls", async () => {
    const handle = fakeHandle();
    let calls = 0;
    const getWindow = (): TimelineRegistryWindow => (++calls >= 3 ? { __timelines: { sample: handle } } : { __timelines: {} });

    const result = await waitForCompositionTimeline(getWindow, "sample", {
      intervalMs: 0,
      sleep: async () => undefined,
      now: () => 0,
    });

    expect(result).toBe(handle);
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  it("rejects with a timeout error when the handle never registers", async () => {
    const times = [0, 10, 20, 5000];
    let i = 0;
    const now = () => times[Math.min(i++, times.length - 1)]!;

    await expect(
      waitForCompositionTimeline(() => ({ __timelines: {} }), "sample", {
        timeoutMs: 1000,
        intervalMs: 0,
        sleep: async () => undefined,
        now,
      }),
    ).rejects.toThrow(/Timed out waiting/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tinker/editor test -- src/composition/compositionWindow.test.ts`
Expected: FAIL — cannot find module `./compositionWindow.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/editor/src/composition/compositionWindow.ts
import type { GsapTimelineLike } from "./compositionTimelineModel.js";

/** A generated composition's GSAP master timeline, including the controls the preview drives. */
export interface CompositionTimelineHandle extends GsapTimelineLike {
  seek(time: number, suppressEvents?: boolean): unknown;
  play(from?: number, suppressEvents?: boolean): unknown;
  pause(atTime?: number, suppressEvents?: boolean): unknown;
}

/** A Window-like object that may carry the Hyperframes timeline registry. */
export interface TimelineRegistryWindow {
  __timelines?: Record<string, unknown>;
}

function isCompositionTimelineHandle(value: unknown): value is CompositionTimelineHandle {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.totalDuration === "function" &&
    typeof candidate.getChildren === "function" &&
    typeof candidate.seek === "function" &&
    typeof candidate.play === "function" &&
    typeof candidate.pause === "function" &&
    typeof candidate.labels === "object" &&
    candidate.labels !== null
  );
}

/** Read the registered master timeline for `compositionId`, or undefined if absent/unusable. */
export function getCompositionTimeline(
  win: TimelineRegistryWindow | null | undefined,
  compositionId: string,
): CompositionTimelineHandle | undefined {
  const candidate = win?.__timelines?.[compositionId];
  return isCompositionTimelineHandle(candidate) ? candidate : undefined;
}

export type WaitForCompositionTimelineOptions = {
  /** Max time to wait for registration, in ms. Default 4000. */
  timeoutMs?: number;
  /** Poll interval in ms. Default 50. */
  intervalMs?: number;
  /** Injectable sleep (tests). Default setTimeout-based. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable elapsed-time source (tests). Default performance.now(). */
  now?: () => number;
  signal?: AbortSignal;
};

/**
 * Poll `getWindow()` until its `__timelines[compositionId]` is a usable handle, or reject on timeout.
 * `getWindow` is a thunk so the caller can re-read a (possibly slow-to-populate) iframe content window.
 */
export async function waitForCompositionTimeline(
  getWindow: () => TimelineRegistryWindow | null | undefined,
  compositionId: string,
  options: WaitForCompositionTimelineOptions = {},
): Promise<CompositionTimelineHandle> {
  const timeoutMs = options.timeoutMs ?? 4000;
  const intervalMs = options.intervalMs ?? 50;
  const now = options.now ?? (() => performance.now());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const start = now();

  for (;;) {
    options.signal?.throwIfAborted();
    const handle = getCompositionTimeline(getWindow(), compositionId);
    if (handle) {
      return handle;
    }
    if (now() - start >= timeoutMs) {
      throw new Error(`Timed out waiting for window.__timelines["${compositionId}"] after ${timeoutMs}ms`);
    }
    await sleep(intervalMs);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tinker/editor test -- src/composition/compositionWindow.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/composition/compositionWindow.ts packages/editor/src/composition/compositionWindow.test.ts
git commit -m "feat(editor): composition window-access layer (read/poll window.__timelines)"
```

---

## Task 2: `CompositionPreview` component

**Files:**
- Create: `packages/editor/src/composition/CompositionPreview.tsx`
- Test: `packages/editor/src/composition/CompositionPreview.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/editor/src/composition/CompositionPreview.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompositionPreview } from "./CompositionPreview.js";
import type { CompositionTimelineHandle, TimelineRegistryWindow } from "./compositionWindow.js";

function fakeHandle(overrides: Partial<CompositionTimelineHandle> = {}): CompositionTimelineHandle {
  return {
    totalDuration: () => 8,
    labels: {},
    getChildren: () => [{ startTime: () => 0, totalDuration: () => 8, vars: { id: "scene" } }],
    seek: () => undefined,
    play: () => undefined,
    pause: () => undefined,
    ...overrides,
  } as CompositionTimelineHandle;
}

const SRC = "/api/jobs/j/artifacts/hyperframes/index.html";

describe("CompositionPreview", () => {
  it("reads the timeline on iframe load and reports the model", async () => {
    const handle = fakeHandle();
    const onReady = vi.fn();
    render(
      <CompositionPreview
        src={SRC}
        compositionId="sample"
        onReady={onReady}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { sample: handle } })}
      />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const [model] = onReady.mock.calls[0]!;
    expect(model.durationSeconds).toBe(8);
    expect(model.clips).toHaveLength(1);
  });

  it("seeks the timeline when currentTime changes after ready", async () => {
    const seek = vi.fn();
    const handle = fakeHandle({ seek });
    const resolveWindow = (): TimelineRegistryWindow => ({ __timelines: { sample: handle } });
    const { rerender } = render(
      <CompositionPreview src={SRC} compositionId="sample" currentTime={0} resolveWindow={resolveWindow} />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(seek).toHaveBeenCalledWith(0));
    rerender(<CompositionPreview src={SRC} compositionId="sample" currentTime={3.5} resolveWindow={resolveWindow} />);
    expect(seek).toHaveBeenCalledWith(3.5);
  });

  it("falls back to the rendered video when the timeline never registers", async () => {
    render(
      <CompositionPreview
        src={SRC}
        compositionId="sample"
        fallbackVideoSrc="/api/jobs/j/artifacts/hyperframes/output.mp4"
        timeoutMs={0}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: {} })}
      />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() =>
      expect(screen.getByTestId("composition-fallback-video")).toHaveAttribute(
        "src",
        "/api/jobs/j/artifacts/hyperframes/output.mp4",
      ),
    );
  });

  it("shows an error placeholder (and calls onError) when unavailable with no fallback", async () => {
    const onError = vi.fn();
    render(
      <CompositionPreview
        src={SRC}
        compositionId="sample"
        timeoutMs={0}
        onError={onError}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: {} })}
      />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("composition-error")).toBeInTheDocument());
    expect(onError).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tinker/editor test -- src/composition/CompositionPreview.test.tsx`
Expected: FAIL — cannot find module `./CompositionPreview.js`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// packages/editor/src/composition/CompositionPreview.tsx
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { readCompositionTimeline, type CompositionTimelineModel } from "./compositionTimelineModel.js";
import {
  waitForCompositionTimeline,
  type CompositionTimelineHandle,
  type TimelineRegistryWindow,
} from "./compositionWindow.js";

export type CompositionPreviewProps = {
  /** URL of the composition-index artifact (the index.html). */
  src: string;
  /** The composition id (matches data-composition-id / window.__timelines key). */
  compositionId: string;
  /** Playhead time in seconds; the preview seeks the timeline to it. */
  currentTime?: number;
  /** Called once the timeline is read, with its structured model and live handle. */
  onReady?: (model: CompositionTimelineModel, handle: CompositionTimelineHandle) => void;
  /** Called if the timeline can't be read before the timeout. */
  onError?: (error: Error) => void;
  /** Rendered-video URL (output-video artifact) shown if the timeline is unavailable. */
  fallbackVideoSrc?: string;
  /** Max time to wait for the timeline to register. Default 4000ms. */
  timeoutMs?: number;
  /** Test seam: resolve the iframe's content window. Default: iframe.contentWindow. */
  resolveWindow?: (iframe: HTMLIFrameElement) => TimelineRegistryWindow | null | undefined;
};

type Status = "loading" | "ready" | "error";

const fillStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  border: "none",
  display: "block",
  background: "var(--tk-preview-bg, #26251F)",
};

function defaultResolveWindow(iframe: HTMLIFrameElement): TimelineRegistryWindow | null | undefined {
  return iframe.contentWindow as unknown as TimelineRegistryWindow | null;
}

export function CompositionPreview({
  src,
  compositionId,
  currentTime = 0,
  onReady,
  onError,
  fallbackVideoSrc,
  timeoutMs,
  resolveWindow = defaultResolveWindow,
}: CompositionPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const handleRef = useRef<CompositionTimelineHandle | undefined>(undefined);
  const waitAbortRef = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => () => waitAbortRef.current?.abort(), []);

  function handleLoad() {
    const iframe = iframeRef.current;
    if (!iframe) return;
    waitAbortRef.current?.abort();
    const controller = new AbortController();
    waitAbortRef.current = controller;

    waitForCompositionTimeline(() => resolveWindow(iframe), compositionId, { timeoutMs, signal: controller.signal })
      .then((handle) => {
        if (controller.signal.aborted) return;
        handleRef.current = handle;
        handle.pause();
        handle.seek(currentTime);
        setStatus("ready");
        onReady?.(readCompositionTimeline(handle), handle);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setStatus("error");
        onError?.(error instanceof Error ? error : new Error(String(error)));
      });
  }

  useEffect(() => {
    if (status === "ready") {
      handleRef.current?.seek(currentTime);
    }
  }, [currentTime, status]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {status !== "error" ? (
        <iframe
          ref={iframeRef}
          data-testid="composition-frame"
          title="Composition preview"
          src={src}
          onLoad={handleLoad}
          sandbox="allow-scripts allow-same-origin"
          style={fillStyle}
        />
      ) : fallbackVideoSrc ? (
        <video data-testid="composition-fallback-video" src={fallbackVideoSrc} controls style={fillStyle} />
      ) : (
        <div
          data-testid="composition-error"
          role="alert"
          style={{ ...fillStyle, display: "grid", placeItems: "center", color: "white", fontFamily: "var(--tk-font)" }}
        >
          Preview unavailable.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tinker/editor test -- src/composition/CompositionPreview.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/composition/CompositionPreview.tsx packages/editor/src/composition/CompositionPreview.test.tsx
git commit -m "feat(editor): CompositionPreview iframe component with timeline read + video fallback"
```

---

## Task 3: Export from the package + full verification

**Files:**
- Modify: `packages/editor/src/index.ts`

- [ ] **Step 1: Add exports** — append to `packages/editor/src/index.ts`:

```ts
export type {
  CompositionTimelineHandle,
  TimelineRegistryWindow,
  WaitForCompositionTimelineOptions,
} from "./composition/compositionWindow.js";
export { getCompositionTimeline, waitForCompositionTimeline } from "./composition/compositionWindow.js";
export type { CompositionPreviewProps } from "./composition/CompositionPreview.js";
export { CompositionPreview } from "./composition/CompositionPreview.js";
```

- [ ] **Step 2: Run the editor test suite**

Run: `pnpm --filter @tinker/editor test`
Expected: PASS — all prior editor tests plus the 9 new tests (Tasks 1–2).

- [ ] **Step 3: Typecheck the editor package**

Run: `pnpm --filter @tinker/editor typecheck`
Expected: PASS (zero errors).

- [ ] **Step 4: Confirm consumers still build**

Run: `pnpm --filter @tinker/web build`
Expected: PASS (the web app, which imports `@tinker/editor`, still builds).

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/index.ts
git commit -m "feat(editor): export CompositionPreview + composition window helpers"
```

---

## Self-Review (done while writing)

- **Spec coverage:** Implements Component §2 — `CompositionPreview` loads the composition-index in a sandboxed iframe, reads `window.__timelines[compositionId]`, adapts via Phase 1a's `readCompositionTimeline`, exposes the model + seeks the playhead, and degrades to the output-video (`fallbackVideoSrc`) or a calm placeholder. The Security note (loopback origin, `allow-scripts allow-same-origin` rationale) is captured in Context. The visual `CompositionTimeline` scrubber/clips UI (Component §3) and Create Demo wiring are deliberately separate plans (1c/1d).
- **Placeholder scan:** none — every step has runnable code/commands.
- **Type consistency:** `CompositionTimelineHandle`, `TimelineRegistryWindow`, `WaitForCompositionTimelineOptions`, `getCompositionTimeline`, `waitForCompositionTimeline` are defined in Task 1 and used unchanged in Task 2 (the component) and Task 3 (exports). `CompositionTimelineHandle extends GsapTimelineLike` (Phase 1a), so it feeds `readCompositionTimeline` without adaptation. The `resolveWindow` seam signature is identical in the component, its default, and the tests.
- **Known seam:** the unit tests inject `resolveWindow`, so they verify the component's logic, not real cross-window iframe access. That real access (same-origin `iframe.contentWindow.__timelines`) is standard web behavior; it is verified by the smoke below and exercised in Phase 1d.

## Phase 1 roadmap (remaining)

- **Real-browser smoke (recommended before/with 1d):** add a fixture composition `index.html` (GSAP + `window.__timelines` registration following Person A's lint contract) and load it in a real browser (Playwright) to confirm the parent reads `iframe.contentWindow.__timelines[id]` and `seek()` updates the frame — the one behavior the unit-test seam mocks.
- **Phase 1c — CompositionTimeline UI:** a scrubber + playhead driven by the model from `onReady`; ticks/labels/clips; drag-to-select a range; click-to-select a clip (range-only when `clips` is empty). Owns `currentTime` and passes it to `CompositionPreview`.
- **Phase 1d — Wire Create Demo → composition:** switch Create Demo to the `ai-url-planning` request via `HttpCompositionGenerationClient` (Phase 0) with long-job polling UX, then mount `CompositionPreview` + `CompositionTimeline` on a completed job (using the `composition-index` + `output-video` artifact URLs). This is where the real iframe access runs against generated compositions.
