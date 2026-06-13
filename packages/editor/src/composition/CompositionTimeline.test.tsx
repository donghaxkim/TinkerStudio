import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
