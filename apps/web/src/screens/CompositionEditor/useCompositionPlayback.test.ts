import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCompositionPlayback } from "./useCompositionPlayback.js";

afterEach(() => vi.unstubAllGlobals());

function stubRaf() {
  const cbs: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cbs.push(cb); return cbs.length; });
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  return cbs;
}

describe("useCompositionPlayback", () => {
  it("advances currentTime while playing", () => {
    const cbs = stubRaf();
    const { result } = renderHook(() => useCompositionPlayback(10));
    act(() => result.current.play());
    expect(result.current.isPlaying).toBe(true);
    act(() => cbs.shift()?.(0));
    act(() => cbs.shift()?.(1000));
    expect(result.current.currentTime).toBeCloseTo(1, 3);
  });

  it("seek sets currentTime and clamps to [0, duration]", () => {
    stubRaf();
    const { result } = renderHook(() => useCompositionPlayback(10));
    act(() => result.current.seek(4));
    expect(result.current.currentTime).toBe(4);
    act(() => result.current.seek(99));
    expect(result.current.currentTime).toBe(10);
    act(() => result.current.seek(-3));
    expect(result.current.currentTime).toBe(0);
  });

  it("stops at the end and clears isPlaying", () => {
    const cbs = stubRaf();
    const { result } = renderHook(() => useCompositionPlayback(1));
    act(() => result.current.play());
    act(() => cbs.shift()?.(0));
    act(() => cbs.shift()?.(2000));
    expect(result.current.currentTime).toBe(1);
    expect(result.current.isPlaying).toBe(false);
  });

  it("playSegment loops within [start, end]", () => {
    const cbs = stubRaf();
    const { result } = renderHook(() => useCompositionPlayback(10));
    act(() => result.current.playSegment(4, 6));
    expect(result.current.currentTime).toBe(4);
    expect(result.current.isPlaying).toBe(true);
    act(() => cbs.shift()?.(0));
    act(() => cbs.shift()?.(3000)); // +3s would reach 7 (>6) → wraps to 4
    expect(result.current.currentTime).toBe(4);
    expect(result.current.isPlaying).toBe(true); // still looping (does not stop)
  });
});
