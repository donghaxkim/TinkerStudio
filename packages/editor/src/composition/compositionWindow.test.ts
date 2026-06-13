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
