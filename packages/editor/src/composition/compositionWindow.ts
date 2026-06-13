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
  compositionId?: string,
): CompositionTimelineHandle | undefined {
  if (compositionId === undefined) {
    return getSoleCompositionTimeline(win);
  }
  const candidate = win?.__timelines?.[compositionId];
  return isCompositionTimelineHandle(candidate) ? candidate : undefined;
}

/** Read the sole registered timeline — for a generated composition that registers exactly one master. */
export function getSoleCompositionTimeline(
  win: TimelineRegistryWindow | null | undefined,
): CompositionTimelineHandle | undefined {
  const registry = win?.__timelines;
  if (!registry) return undefined;
  const handles = Object.values(registry).filter(isCompositionTimelineHandle);
  return handles.length === 1 ? handles[0] : undefined;
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
  /** Abort to cancel the wait; the rejection is the signal's reason (or an AbortError). */
  signal?: AbortSignal;
};

/**
 * Poll `getWindow()` until its `__timelines[compositionId]` is a usable handle, or reject on timeout.
 * `getWindow` is a thunk so the caller can re-read a (possibly slow-to-populate) iframe content window.
 */
export async function waitForCompositionTimeline(
  getWindow: () => TimelineRegistryWindow | null | undefined,
  compositionId: string | undefined,
  options: WaitForCompositionTimelineOptions = {},
): Promise<CompositionTimelineHandle> {
  const timeoutMs = options.timeoutMs ?? 4000;
  const intervalMs = options.intervalMs ?? 50;
  const now = options.now ?? (() => performance.now());
  const sleep = options.sleep ?? ((ms: number) => abortableDelay(ms, options.signal));
  const start = now();

  for (;;) {
    options.signal?.throwIfAborted();
    const handle = getCompositionTimeline(getWindow(), compositionId);
    if (handle) {
      return handle;
    }
    if (now() - start >= timeoutMs) {
      const target = compositionId === undefined ? "the sole window.__timelines entry" : `window.__timelines["${compositionId}"]`;
      throw new Error(`Timed out waiting for ${target} after ${timeoutMs}ms`);
    }
    await sleep(intervalMs);
  }
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("The operation was aborted", "AbortError"));
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("The operation was aborted", "AbortError"));
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
