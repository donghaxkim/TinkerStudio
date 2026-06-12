import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DemoProject } from "@tinker/project-schema";
import { sampleProject } from "../test/sampleProject.js";
import { Timeline } from "./Timeline.js";

describe("Timeline", () => {
  it("renders track and overlay labels", () => {
    render(<Timeline project={sampleProject} currentTime={0} width={900} onSeek={() => undefined} />);

    expect(screen.getByText("Main capture")).toBeInTheDocument();
    expect(screen.getByText("Browser flow")).toBeInTheDocument();
    expect(screen.getByText("Zoom 1")).toBeInTheDocument();
    expect(screen.queryByText("Narration")).not.toBeInTheDocument();
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

  it("renders mono time-tick labels in the ruler", () => {
    render(<Timeline project={sampleProject} currentTime={0} width={900} onSeek={() => undefined} />);

    // With a 45s duration, tick interval is 5s → ticks at 0:00, 0:05, …, 0:45
    expect(screen.getByText("0:00")).toBeInTheDocument();
    expect(screen.getByText("0:05")).toBeInTheDocument();
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

  it("invokes onSelectItem with the item id/kind and still seeks on item click", () => {
    const onSeek = vi.fn();
    const onSelectItem = vi.fn();
    render(
      <Timeline
        project={sampleProject}
        currentTime={0}
        width={900}
        onSeek={onSeek}
        onSelectItem={onSelectItem}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "zoom: Zoom 1" }));

    expect(onSelectItem).toHaveBeenCalledWith({ id: "zoom_001", kind: "zoom", start: 12, end: 18 });
    expect(onSeek).toHaveBeenCalledWith(12);
  });

  it("marks the selected timeline item with aria-pressed", () => {
    render(
      <Timeline
        project={sampleProject}
        currentTime={0}
        width={900}
        onSeek={() => undefined}
        selectedEntity={{ type: "zoom", id: "zoom_001" }}
      />,
    );

    const selected = screen.getByRole("button", { name: "zoom: Zoom 1" });
    expect(selected).toHaveAttribute("aria-pressed", "true");

    const clip = screen.getByRole("button", { name: "clip: Browser flow" });
    expect(clip).toHaveAttribute("aria-pressed", "false");
  });

  it("does not hang and renders timeline-ruler when project duration is 0", () => {
    // Construct a zero-duration project bypassing schema validation, since the
    // Timeline component may receive such a project from freshly-created or empty
    // projects before a valid duration is set.
    const zeroDurationProject = {
      ...sampleProject,
      duration: 0,
      tracks: [],
      zooms: [],
      cursorEvents: [],
    } as unknown as DemoProject;

    // This render must complete quickly — the infinite-loop bug would cause it to hang.
    render(
      <Timeline project={zeroDurationProject} currentTime={0} width={900} onSeek={() => undefined} />,
    );

    expect(screen.getByTestId("timeline-ruler")).toBeInTheDocument();
    // A single "0:00" tick should be rendered for the empty timeline.
    expect(screen.getByText("0:00")).toBeInTheDocument();
  });
});
