import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { sampleProject } from "../test/sampleProject.js";
import { Timeline } from "./Timeline.js";

describe("Timeline", () => {
  it("renders track and overlay labels", () => {
    render(<Timeline project={sampleProject} currentTime={0} width={900} onSeek={() => undefined} />);

    expect(screen.getByText("Main capture")).toBeInTheDocument();
    expect(screen.getByText("Narration")).toBeInTheDocument();
    expect(screen.getByText("Browser flow")).toBeInTheDocument();
    expect(screen.getByText("Turn product flows into polished demo videos.")).toBeInTheDocument();
    expect(screen.getByText("Zoom 1")).toBeInTheDocument();
    expect(screen.getByText("Real-time analytics")).toBeInTheDocument();
  });

  it("click-to-seek maps lane clicks to time", () => {
    const onSeek = vi.fn();
    render(<Timeline project={sampleProject} currentTime={0} width={900} onSeek={onSeek} />);
    const lane = screen.getByTestId("timeline-ruler");

    vi.spyOn(lane, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 900,
      height: 40,
      right: 900,
      bottom: 40,
      toJSON: () => ({}),
    });

    fireEvent.click(lane, { clientX: 300 });

    expect(onSeek).toHaveBeenCalledWith(15);
  });

  it("shows the selected range", () => {
    render(
      <Timeline
        project={sampleProject}
        currentTime={14}
        selectedRange={{ start: 12, end: 18 }}
        width={900}
        onSeek={() => undefined}
      />,
    );

    expect(screen.getByTestId("selected-range")).toHaveAccessibleName("Selected range 12.0s to 18.0s");
  });
});
