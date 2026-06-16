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
    expect(screen.getByTestId("composition-timeline")).toHaveAttribute("role", "slider");
  });

  it("supports keyboard seeking on the timeline", () => {
    const onSeek = vi.fn();
    render(<CompositionTimeline model={MODEL} currentTime={4} onSeek={onSeek} />);
    const track = screen.getByTestId("composition-timeline");
    fireEvent.keyDown(track, { key: "ArrowRight" });
    expect(onSeek).toHaveBeenCalledWith(4.25);
    fireEvent.keyDown(track, { key: "Home" });
    expect(onSeek).toHaveBeenCalledWith(0);
  });

  it("emits a normalized range when the track is dragged, and renders a band", () => {
    const onSelectRange = vi.fn();
    const onSeek = vi.fn();
    render(<CompositionTimeline model={MODEL} currentTime={0} onSeek={onSeek} onSelectRange={onSelectRange} />);
    const track = screen.getByTestId("composition-timeline");
    mockBounds(track, 1000);
    fireEvent.mouseDown(track, { clientX: 600 });
    fireEvent.mouseMove(track, { clientX: 200 });
    fireEvent.mouseUp(track, { clientX: 200 });
    expect(onSelectRange).toHaveBeenCalledWith({ start: 2, end: 6 }); // normalized
    // the browser fires a click after a drag — it must NOT seek
    fireEvent.click(track, { clientX: 200 });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("treats a press with no movement as a click (still seeks)", () => {
    const onSelectRange = vi.fn();
    const onSeek = vi.fn();
    render(<CompositionTimeline model={MODEL} currentTime={0} onSeek={onSeek} onSelectRange={onSelectRange} />);
    const track = screen.getByTestId("composition-timeline");
    mockBounds(track, 1000);
    fireEvent.mouseDown(track, { clientX: 500 });
    fireEvent.mouseUp(track, { clientX: 500 });
    fireEvent.click(track, { clientX: 500 });
    expect(onSelectRange).not.toHaveBeenCalled();
    expect(onSeek).toHaveBeenCalledWith(5);
  });

  it("renders a controlled selection band from the selection prop", () => {
    render(<CompositionTimeline model={MODEL} currentTime={0} selection={{ start: 2, end: 6 }} />);
    expect(screen.getByTestId("composition-selection-band")).toHaveStyle({ left: "20%", width: "40%" });
  });

  it("shows the Add to Chat popup centered over a range selection and fires its action", () => {
    const onAct = vi.fn();
    render(
      <CompositionTimeline
        model={MODEL}
        currentTime={0}
        selection={{ start: 2, end: 6 }}
        selectionAction={{ label: "Add to Chat", hint: "⌘L", onAct }}
      />,
    );
    const popup = screen.getByTestId("composition-selection-popup");
    expect(popup).toHaveStyle({ left: "40%" }); // center of 2s–6s over a 10s timeline
    const button = screen.getByRole("button", { name: /Add to Chat/ });
    expect(button).toHaveTextContent("⌘L");
    fireEvent.click(button);
    expect(onAct).toHaveBeenCalledTimes(1);
  });

  it("does not show the Add to Chat popup for a clip selection", () => {
    render(
      <CompositionTimeline
        model={MODEL}
        currentTime={0}
        selectedClipId="feature"
        selection={{ start: 4, end: 10 }}
        selectionAction={{ label: "Add to Chat", onAct: () => undefined }}
      />,
    );
    expect(screen.queryByTestId("composition-selection-popup")).not.toBeInTheDocument();
  });

  it("supports keyboard clip selection", () => {
    const onSeek = vi.fn();
    const onSelectClip = vi.fn();
    render(<CompositionTimeline model={MODEL} currentTime={0} onSeek={onSeek} onSelectClip={onSelectClip} />);
    fireEvent.keyDown(screen.getByTestId("composition-clip-feature"), { key: "Enter" });
    expect(onSelectClip).toHaveBeenCalledWith(MODEL.clips[1]);
    expect(onSeek).toHaveBeenCalledWith(4);
  });
});

// A clip already shortened from its generated source (sourceEnd 5 > end 3), so extend-back is testable.
const SOURCED: CompositionTimelineModel = {
  durationSeconds: 10,
  clips: [
    { id: "hook", label: "hook", start: 0, end: 3, sourceEnd: 5 },
    { id: "feature", label: "feature", start: 5, end: 10 },
  ],
  labels: [],
};

describe("CompositionTimeline (trim handles)", () => {
  it("shows trim handles on the selected clip but not on unselected clips", () => {
    render(<CompositionTimeline model={MODEL} currentTime={0} selectedClipId="hook" onTrimClip={() => undefined} />);
    expect(screen.getByTestId("composition-trim-hook-start")).toBeInTheDocument();
    expect(screen.getByTestId("composition-trim-hook-end")).toBeInTheDocument();
    // no global trim mode — the unselected clip has no handles
    expect(screen.queryByTestId("composition-trim-feature-start")).not.toBeInTheDocument();
  });

  it("shows trim handles on a hovered clip", () => {
    render(<CompositionTimeline model={MODEL} currentTime={0} onTrimClip={() => undefined} />);
    expect(screen.queryByTestId("composition-trim-feature-end")).not.toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByTestId("composition-clip-feature"));
    expect(screen.getByTestId("composition-trim-feature-end")).toBeInTheDocument();
  });

  it("does not render handles at all without an onTrimClip handler", () => {
    render(<CompositionTimeline model={MODEL} currentTime={0} selectedClipId="hook" />);
    expect(screen.queryByTestId("composition-trim-hook-end")).not.toBeInTheDocument();
  });

  it("shortens a clip by dragging its end handle inward", () => {
    const onTrimClip = vi.fn();
    render(<CompositionTimeline model={MODEL} currentTime={0} selectedClipId="hook" onTrimClip={onTrimClip} />);
    const track = screen.getByTestId("composition-timeline");
    mockBounds(track, 1000); // 1000px = 10s
    fireEvent.mouseDown(screen.getByTestId("composition-trim-hook-end"), { clientX: 400 }); // 4s, hook's end
    fireEvent.mouseMove(track, { clientX: 300 }); // drag to 3s
    // live preview: the clip resizes to the dragged bound while dragging
    expect(screen.getByTestId("composition-clip-hook")).toHaveStyle({ width: "30%" });
    fireEvent.mouseUp(track, { clientX: 300 });
    expect(onTrimClip).toHaveBeenCalledTimes(1);
    expect(onTrimClip).toHaveBeenCalledWith("hook", "end", 3);
  });

  it("extends a shortened clip back out to (but not past) its generated source bound", () => {
    const onTrimClip = vi.fn();
    render(<CompositionTimeline model={SOURCED} currentTime={0} selectedClipId="hook" onTrimClip={onTrimClip} />);
    const track = screen.getByTestId("composition-timeline");
    mockBounds(track, 1000);

    // extend the end from 3s out to 4.5s — allowed (within source extent of 5s)
    fireEvent.mouseDown(screen.getByTestId("composition-trim-hook-end"), { clientX: 300 });
    fireEvent.mouseMove(track, { clientX: 450 });
    fireEvent.mouseUp(track, { clientX: 450 });
    expect(onTrimClip).toHaveBeenLastCalledWith("hook", "end", 4.5);

    // drag past the source extent — clamped to 5s, never beyond (invalid bounds)
    fireEvent.mouseDown(screen.getByTestId("composition-trim-hook-end"), { clientX: 300 });
    fireEvent.mouseMove(track, { clientX: 800 }); // 8s, well past the 5s source end
    fireEvent.mouseUp(track, { clientX: 800 });
    expect(onTrimClip).toHaveBeenLastCalledWith("hook", "end", 5);
  });

  it("adjusts a clip's start by dragging its left handle", () => {
    const onTrimClip = vi.fn();
    render(<CompositionTimeline model={MODEL} currentTime={0} selectedClipId="feature" onTrimClip={onTrimClip} />);
    const track = screen.getByTestId("composition-timeline");
    mockBounds(track, 1000);
    fireEvent.mouseDown(screen.getByTestId("composition-trim-feature-start"), { clientX: 400 }); // feature.start = 4s
    fireEvent.mouseMove(track, { clientX: 500 }); // drag start to 5s
    fireEvent.mouseUp(track, { clientX: 500 });
    expect(onTrimClip).toHaveBeenCalledWith("feature", "start", 5);
  });

  it("shows a timecode tooltip while dragging, then hides it on release", () => {
    render(<CompositionTimeline model={MODEL} currentTime={0} selectedClipId="hook" onTrimClip={() => undefined} />);
    const track = screen.getByTestId("composition-timeline");
    mockBounds(track, 1000);
    fireEvent.mouseDown(screen.getByTestId("composition-trim-hook-end"), { clientX: 400 });
    fireEvent.mouseMove(track, { clientX: 250 }); // 2.5s
    const tooltip = screen.getByTestId("composition-trim-tooltip");
    expect(tooltip).toHaveTextContent("0:02.5");
    fireEvent.mouseUp(track, { clientX: 250 });
    expect(screen.queryByTestId("composition-trim-tooltip")).not.toBeInTheDocument();
  });

  it("does not select or seek the clip when its trim handle is pressed", () => {
    const onSelectClip = vi.fn();
    const onSeek = vi.fn();
    render(
      <CompositionTimeline
        model={MODEL}
        currentTime={0}
        selectedClipId="hook"
        onTrimClip={() => undefined}
        onSelectClip={onSelectClip}
        onSeek={onSeek}
      />,
    );
    const track = screen.getByTestId("composition-timeline");
    mockBounds(track, 1000);
    fireEvent.mouseDown(screen.getByTestId("composition-trim-hook-end"), { clientX: 400 });
    fireEvent.mouseMove(track, { clientX: 300 });
    fireEvent.mouseUp(track, { clientX: 300 });
    fireEvent.click(track, { clientX: 300 }); // the post-drag click must be swallowed
    expect(onSelectClip).not.toHaveBeenCalled();
    expect(onSeek).not.toHaveBeenCalled();
  });
});
