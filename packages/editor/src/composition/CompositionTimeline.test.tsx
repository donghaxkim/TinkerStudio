import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompositionTimeline } from "./CompositionTimeline.js";
import type { CompositionTimelineModel } from "./compositionTimelineModel.js";

const MODEL: CompositionTimelineModel = {
  durationSeconds: 10,
  clips: [
    { id: "hook", label: "hook", start: 0, end: 4 },
    { id: "feature", label: "feature", start: 4, end: 10 },
  ],
  labels: [{ name: "cta", time: 8 }],
};

describe("CompositionTimeline (display)", () => {
  it("renders each clip at the right left/width percent with its label", () => {
    render(<CompositionTimeline model={MODEL} currentTime={0} />);
    const hook = screen.getByTestId("composition-clip-hook");
    expect(hook).toHaveStyle({ left: "0%", width: "40%" });
    expect(hook).toHaveTextContent("hook");
    const feature = screen.getByTestId("composition-clip-feature");
    expect(feature).toHaveStyle({ left: "40%", width: "60%" });
  });

  it("renders label markers positioned by time", () => {
    render(<CompositionTimeline model={MODEL} currentTime={0} />);
    expect(screen.getByTestId("composition-label-cta")).toHaveStyle({ left: "80%" });
  });

  it("positions the playhead at currentTime", () => {
    render(<CompositionTimeline model={MODEL} currentTime={2.5} />);
    expect(screen.getByTestId("composition-playhead")).toHaveStyle({ left: "25%" });
  });

  it("marks the selected clip", () => {
    render(<CompositionTimeline model={MODEL} currentTime={0} selectedClipId="feature" />);
    expect(screen.getByTestId("composition-clip-feature")).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("composition-clip-hook")).toHaveAttribute("data-selected", "false");
  });

  it("renders a scrubbable track with no clip segments for a flat composition", () => {
    render(<CompositionTimeline model={{ durationSeconds: 6, clips: [], labels: [] }} currentTime={3} />);
    expect(screen.getByTestId("composition-timeline")).toBeInTheDocument();
    expect(screen.queryByTestId(/composition-clip-/)).not.toBeInTheDocument();
    expect(screen.getByTestId("composition-playhead")).toHaveStyle({ left: "50%" });
  });

  it("falls back to the clip id when a clip has no label", () => {
    render(
      <CompositionTimeline
        model={{ durationSeconds: 4, clips: [{ id: "clip-0", start: 0, end: 4 }], labels: [] }}
        currentTime={0}
      />,
    );
    expect(screen.getByTestId("composition-clip-clip-0")).toHaveTextContent("clip-0");
  });

  it("renders without error when durationSeconds is 0", () => {
    render(<CompositionTimeline model={{ durationSeconds: 0, clips: [], labels: [] }} currentTime={0} />);
    expect(screen.getByTestId("composition-timeline")).toBeInTheDocument();
    expect(screen.getByTestId("composition-playhead")).toHaveStyle({ left: "0%" });
  });
});

function mockBounds(el: HTMLElement, width: number, left = 0) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    left,
    width,
    top: 0,
    right: left + width,
    bottom: 56,
    height: 56,
    x: left,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

describe("CompositionTimeline (interaction)", () => {
  it("seeks to the clicked time on the track", () => {
    const onSeek = vi.fn();
    render(<CompositionTimeline model={MODEL} currentTime={0} onSeek={onSeek} />);
    const track = screen.getByTestId("composition-timeline");
    mockBounds(track, 1000);
    fireEvent.click(track, { clientX: 500 });
    expect(onSeek).toHaveBeenCalledWith(5); // 500/1000 * 10s
  });

  it("selects a clip and seeks to its start when the clip is clicked, without a second track seek", () => {
    const onSeek = vi.fn();
    const onSelectClip = vi.fn();
    render(<CompositionTimeline model={MODEL} currentTime={0} onSeek={onSeek} onSelectClip={onSelectClip} />);
    const track = screen.getByTestId("composition-timeline");
    mockBounds(track, 1000);
    fireEvent.click(screen.getByTestId("composition-clip-feature"));
    expect(onSelectClip).toHaveBeenCalledWith(MODEL.clips[1]);
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek).toHaveBeenCalledWith(4); // feature.start
  });

  it("labels the timeline track for assistive tech", () => {
    render(<CompositionTimeline model={MODEL} currentTime={0} />);
    expect(screen.getByTestId("composition-timeline")).toHaveAttribute("aria-label", "Composition timeline");
  });
});
