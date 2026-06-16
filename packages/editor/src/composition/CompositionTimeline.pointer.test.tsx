import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CompositionTimeline } from "./CompositionTimeline.js";
import type { CompositionTimelineModel } from "./compositionTimelineModel.js";

// The real browser drives the timeline through Pointer Events (jsdom defaults to the mouse path,
// which is why the mouse-based tests live in CompositionTimeline.test.tsx). This file polyfills
// PointerEvent so `supportsPointerEvents` is true and the pointer handlers are the active path —
// the only way to reproduce the clip-selection regression below. Kept isolated so the polyfill
// (which would no-op the mouse handlers) doesn't leak into the mouse-based suite.
beforeAll(() => {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, props: PointerEventInit = {}) {
      super(type, props);
      this.pointerId = props.pointerId ?? 1;
    }
  }
  (globalThis as { PointerEvent?: unknown }).PointerEvent = PointerEventPolyfill;
  const proto = Element.prototype as { setPointerCapture?: unknown; releasePointerCapture?: unknown };
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
});

afterAll(() => {
  delete (globalThis as { PointerEvent?: unknown }).PointerEvent;
});

const MODEL: CompositionTimelineModel = {
  durationSeconds: 10,
  clips: [
    { id: "hook", label: "hook", start: 0, end: 4 },
    { id: "feature", label: "feature", start: 4, end: 10 },
  ],
  labels: [],
};

function mockBounds(el: HTMLElement, width: number, left = 0) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    left, width, top: 0, right: left + width, bottom: 56, height: 56, x: left, y: 0, toJSON: () => ({}),
  } as DOMRect);
}

describe("CompositionTimeline (pointer-event clip selection)", () => {
  it("does not let a pointer press that begins on a clip start a track range-drag", () => {
    // Regression: the clip card must swallow pointerdown, not just mousedown. In a real browser the
    // track otherwise captures the pointer on a clip press and the ensuing click is retargeted to the
    // track — which seeks instead of selecting the clip, making trim/delete/speed unreachable by mouse.
    const onSelectRange = vi.fn();
    render(<CompositionTimeline model={MODEL} currentTime={0} onSelectClip={() => undefined} onSelectRange={onSelectRange} />);
    const track = screen.getByTestId("composition-timeline");
    mockBounds(track, 1000);

    fireEvent.pointerDown(screen.getByTestId("composition-clip-hook"), { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(track, { clientX: 400, pointerId: 1 });
    fireEvent.pointerUp(track, { clientX: 400, pointerId: 1 });

    expect(onSelectRange).not.toHaveBeenCalled(); // the track never began its own drag off the clip
  });

  it("still begins a range-drag for a pointer press on the empty track", () => {
    // The fix must only swallow presses on clips — dragging the bare track still selects a range.
    const onSelectRange = vi.fn();
    render(<CompositionTimeline model={MODEL} currentTime={0} onSelectRange={onSelectRange} />);
    const track = screen.getByTestId("composition-timeline");
    mockBounds(track, 1000);

    fireEvent.pointerDown(track, { clientX: 600, pointerId: 1 });
    fireEvent.pointerMove(track, { clientX: 200, pointerId: 1 });
    fireEvent.pointerUp(track, { clientX: 200, pointerId: 1 });

    expect(onSelectRange).toHaveBeenCalledWith({ start: 2, end: 6 });
  });
});
