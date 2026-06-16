import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClipProperties } from "./ClipProperties.js";
import type { CompositionClip } from "./compositionTimelineModel.js";

const clip: CompositionClip = { id: "a", label: "Intro", start: 0, end: 4, speed: 1.5 };

function setup(overrides: Partial<React.ComponentProps<typeof ClipProperties>> = {}) {
  const handlers = { onSpeed: vi.fn(), onReset: vi.fn(), onClose: vi.fn() };
  render(<ClipProperties clip={clip} {...handlers} {...overrides} />);
  return handlers;
}

describe("ClipProperties", () => {
  it("offers every speed preset and marks the clip's current speed as active", () => {
    setup();
    for (const preset of [0.5, 0.75, 1, 1.25, 1.5, 2]) {
      expect(screen.getByTestId(`clip-speed-${preset}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("clip-speed-1.5")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("clip-speed-1")).toHaveAttribute("aria-pressed", "false");
  });

  it("defaults the active preset to 1x when the clip omits a speed", () => {
    setup({ clip: { id: "a", start: 0, end: 4 } });
    expect(screen.getByTestId("clip-speed-1")).toHaveAttribute("aria-pressed", "true");
  });

  it("commits a preset when it is clicked", () => {
    const { onSpeed } = setup();
    fireEvent.click(screen.getByTestId("clip-speed-2"));
    expect(onSpeed).toHaveBeenCalledWith(2);
  });

  it("shows the clip's current playback duration", () => {
    setup();
    expect(screen.getByTestId("clip-speed-readout")).toHaveTextContent("1.5×");
    expect(screen.getByTestId("clip-duration-readout")).toHaveTextContent("4.0s");
  });

  it("offers reset to 1x and done", () => {
    const { onReset, onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Reset speed" }));
    expect(onReset).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });
});
