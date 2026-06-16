import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ZoomProperties } from "./ZoomProperties.js";
import type { ZoomUnit } from "./compositionTimelineModel.js";

const unit: ZoomUnit = { id: "z1", start: 2, end: 6, scale: 2, easing: "linear", target: { x: 0.5, y: 0.5 } };

function setup(overrides: Partial<React.ComponentProps<typeof ZoomProperties>> = {}) {
  const handlers = {
    onScale: vi.fn(),
    onEasing: vi.fn(),
    onStart: vi.fn(),
    onEnd: vi.fn(),
    onDuration: vi.fn(),
    onReset: vi.fn(),
    onRemove: vi.fn(),
    onClose: vi.fn(),
  };
  render(<ZoomProperties unit={unit} durationSeconds={12} {...handlers} {...overrides} />);
  return handlers;
}

describe("ZoomProperties", () => {
  it("shows the unit's scale, timing and easing", () => {
    setup();
    expect(screen.getByText("Zoom properties")).toBeInTheDocument();
    expect(screen.getByTestId("zoom-scale-readout")).toHaveTextContent("2.0×");
    expect(screen.getByLabelText("Zoom easing")).toHaveValue("linear");
    expect(screen.getByLabelText("Zoom start")).toHaveValue(2);
    expect(screen.getByLabelText("Zoom end")).toHaveValue(6);
    expect(screen.getByLabelText("Zoom duration")).toHaveValue(4);
  });

  it("defaults the scale readout to the default when the unit omits a scale", () => {
    setup({ unit: { id: "z1", start: 2, end: 6 } });
    expect(screen.getByTestId("zoom-scale-readout")).toHaveTextContent("1.6×");
  });

  it("commits the scale once, on release of the slider", () => {
    const { onScale } = setup();
    const slider = screen.getByLabelText("Zoom scale");
    fireEvent.change(slider, { target: { value: "2.5" } });
    expect(onScale).not.toHaveBeenCalled(); // dragging previews; nothing committed yet
    expect(screen.getByTestId("zoom-scale-readout")).toHaveTextContent("2.5×"); // live readout
    fireEvent.mouseUp(slider);
    expect(onScale).toHaveBeenCalledTimes(1);
    expect(onScale).toHaveBeenCalledWith(2.5);
  });

  it("changes the easing immediately on select", () => {
    const { onEasing } = setup();
    fireEvent.change(screen.getByLabelText("Zoom easing"), { target: { value: "ease-out" } });
    expect(onEasing).toHaveBeenCalledWith("ease-out");
  });

  it("edits start, end and duration through number inputs", () => {
    const { onStart, onEnd, onDuration } = setup();
    fireEvent.change(screen.getByLabelText("Zoom start"), { target: { value: "3" } });
    expect(onStart).toHaveBeenCalledWith(3);
    fireEvent.change(screen.getByLabelText("Zoom end"), { target: { value: "7" } });
    expect(onEnd).toHaveBeenCalledWith(7);
    fireEvent.change(screen.getByLabelText("Zoom duration"), { target: { value: "5" } });
    expect(onDuration).toHaveBeenCalledWith(5);
  });

  it("ignores a non-numeric timing entry", () => {
    const { onStart } = setup();
    fireEvent.change(screen.getByLabelText("Zoom start"), { target: { value: "" } });
    expect(onStart).not.toHaveBeenCalled();
  });

  it("offers reset, remove and done", () => {
    const { onReset, onRemove, onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
    expect(onReset).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove zoom" }));
    expect(onRemove).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });
});
