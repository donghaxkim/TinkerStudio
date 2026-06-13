import { describe, expect, it } from "vitest";
import {
  getCompositionTimeline,
  getSoleCompositionTimeline,
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
    expect(calls).toBe(3);
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      waitForCompositionTimeline(() => ({ __timelines: {} }), "sample", {
        sleep: async () => undefined,
        now: () => 0,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });

  it("rejects when aborted during the wait", async () => {
    const controller = new AbortController();
    const promise = waitForCompositionTimeline(() => ({ __timelines: {} }), "sample", {
      intervalMs: 1000,
      now: () => 0, // never times out
      signal: controller.signal,
    });
    controller.abort();
    await expect(promise).rejects.toThrow();
  });

  it("rejects with a timeout error when the handle never registers", async () => {
    let calls = 0;
    const now = () => (calls++ < 3 ? 0 : 5000); // pretend elapsed jumps past timeout after 3 calls

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

describe("getSoleCompositionTimeline", () => {
  it("returns the only registered handle", () => {
    const handle = fakeHandle();
    expect(getSoleCompositionTimeline({ __timelines: { only: handle } })).toBe(handle);
  });

  it("returns undefined when there are zero or multiple handles", () => {
    expect(getSoleCompositionTimeline({ __timelines: {} })).toBeUndefined();
    expect(getSoleCompositionTimeline({ __timelines: { a: fakeHandle(), b: fakeHandle() } })).toBeUndefined();
    expect(getSoleCompositionTimeline(undefined)).toBeUndefined();
  });

  it("ignores non-handle registry values when picking the sole handle", () => {
    const handle = fakeHandle();
    const win = { __timelines: { good: handle, junk: { totalDuration: () => 1 } } } as unknown as TimelineRegistryWindow;
    expect(getSoleCompositionTimeline(win)).toBe(handle);
  });
});

describe("getCompositionTimeline with no compositionId", () => {
  it("falls back to the sole registered handle", () => {
    const handle = fakeHandle();
    expect(getCompositionTimeline({ __timelines: { only: handle } })).toBe(handle);
  });
});

describe("waitForCompositionTimeline with no compositionId", () => {
  it("resolves the sole handle once it registers", async () => {
    const handle = fakeHandle();
    let calls = 0;
    const getWindow = (): TimelineRegistryWindow => (++calls >= 2 ? { __timelines: { only: handle } } : { __timelines: {} });
    const result = await waitForCompositionTimeline(getWindow, undefined, { intervalMs: 0, sleep: async () => undefined, now: () => 0 });
    expect(result).toBe(handle);
  });

  it("times out with a sole-entry message when no handle registers", async () => {
    let calls = 0;
    const now = () => (calls++ < 2 ? 0 : 5000);
    await expect(
      waitForCompositionTimeline(() => ({ __timelines: {} }), undefined, {
        timeoutMs: 1000,
        intervalMs: 0,
        sleep: async () => undefined,
        now,
      }),
    ).rejects.toThrow(/sole window\.__timelines entry/);
  });
});
