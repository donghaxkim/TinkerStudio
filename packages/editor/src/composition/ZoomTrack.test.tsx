import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ZoomTrack } from "./ZoomTrack.js";
import type { ZoomUnit } from "./compositionTimelineModel.js";

const UNITS: ZoomUnit[] = [{ id: "z1", start: 2, end: 6 }];

function mockBounds(el: HTMLElement, width: number, left = 0) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    left,
    width,
    top: 0,
    right: left + width,
    bottom: 24,
    height: 24,
    x: left,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

describe("ZoomTrack (display)", () => {
  it("renders an accessible zoom strip with no visible caption", () => {
    render(<ZoomTrack durationSeconds={10} units={[]} />);
    expect(screen.getByRole("region", { name: "Zoom track" })).toBeInTheDocument();
    expect(screen.getByTestId("zoom-track")).toBeInTheDocument();
    expect(screen.queryByText("Zoom")).not.toBeInTheDocument(); // label dropped; lanes are same-size now
  });

  it("renders each zoom unit as a positioned block on the same scale as the clip track", () => {
    render(<ZoomTrack durationSeconds={10} units={UNITS} />);
    const unit = screen.getByTestId("zoom-unit-z1");
    expect(unit).toHaveStyle({ left: "20%", width: "40%" }); // 2s–6s over a 10s timeline
  });

  it("marks the selected unit", () => {
    render(<ZoomTrack durationSeconds={10} units={UNITS} selectedId="z1" />);
    expect(screen.getByTestId("zoom-unit-z1")).toHaveAttribute("data-selected", "true");
  });
});

describe("ZoomTrack (interaction)", () => {
  it("creates a zoom unit by click-dragging across the strip", () => {
    const onCreate = vi.fn();
    render(<ZoomTrack durationSeconds={10} units={[]} onCreate={onCreate} />);
    const strip = screen.getByTestId("zoom-track");
    mockBounds(strip, 1000);
    fireEvent.mouseDown(strip, { clientX: 200 });
    fireEvent.mouseMove(strip, { clientX: 600 });
    // a live preview band tracks the forming unit
    expect(screen.getByTestId("zoom-create-band")).toBeInTheDocument();
    fireEvent.mouseUp(strip, { clientX: 600 });
    expect(onCreate).toHaveBeenCalledWith(2, 6);
    expect(screen.queryByTestId("zoom-create-band")).not.toBeInTheDocument();
  });

  it("creates a default short unit on a single click (no drag)", () => {
    const onCreate = vi.fn();
    render(<ZoomTrack durationSeconds={10} units={[]} onCreate={onCreate} />);
    const strip = screen.getByTestId("zoom-track");
    mockBounds(strip, 1000);
    fireEvent.mouseDown(strip, { clientX: 300 });
    fireEvent.mouseUp(strip, { clientX: 300 });
    expect(onCreate).toHaveBeenCalledWith(3, 4); // 1s default window from the click point
  });

  it("selects a unit when it is clicked, without creating a new one", () => {
    const onSelect = vi.fn();
    const onCreate = vi.fn();
    render(<ZoomTrack durationSeconds={10} units={UNITS} onSelect={onSelect} onCreate={onCreate} />);
    fireEvent.click(screen.getByTestId("zoom-unit-z1"));
    expect(onSelect).toHaveBeenCalledWith("z1");
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("moves a unit by dragging its body, preserving length", () => {
    const onMove = vi.fn();
    render(<ZoomTrack durationSeconds={10} units={UNITS} selectedId="z1" onMove={onMove} />);
    const strip = screen.getByTestId("zoom-track");
    mockBounds(strip, 1000);
    // grab the unit at 3s (1s into the 2–6 unit), drag the pointer to 5s → new start 4s
    fireEvent.mouseDown(screen.getByTestId("zoom-unit-z1"), { clientX: 300 });
    fireEvent.mouseMove(strip, { clientX: 500 });
    fireEvent.mouseUp(strip, { clientX: 500 });
    expect(onMove).toHaveBeenCalledWith("z1", 4);
  });

  it("resizes a unit by dragging its edge handle", () => {
    const onResize = vi.fn();
    render(<ZoomTrack durationSeconds={10} units={UNITS} selectedId="z1" onResize={onResize} />);
    const strip = screen.getByTestId("zoom-track");
    mockBounds(strip, 1000);
    fireEvent.mouseDown(screen.getByTestId("zoom-unit-z1-end"), { clientX: 600 }); // end edge at 6s
    fireEvent.mouseMove(strip, { clientX: 900 });
    fireEvent.mouseUp(strip, { clientX: 900 });
    expect(onResize).toHaveBeenCalledWith("z1", "end", 9);
  });

  it("deletes the selected unit on Delete/Backspace", () => {
    const onDelete = vi.fn();
    render(<ZoomTrack durationSeconds={10} units={UNITS} selectedId="z1" onDelete={onDelete} />);
    fireEvent.keyDown(screen.getByTestId("zoom-unit-z1"), { key: "Delete" });
    expect(onDelete).toHaveBeenCalledWith("z1");
  });
});

describe("ZoomTrack (unit popover)", () => {
  const noopActions = { onAddToChat: () => undefined, onEdit: () => undefined };

  it("shows a contextual popover over the selected unit with Add to chat / Edit manually", () => {
    render(<ZoomTrack durationSeconds={10} units={UNITS} selectedId="z1" unitActions={noopActions} />);
    const popup = screen.getByTestId("zoom-unit-popup");
    expect(popup).toHaveStyle({ left: "40%" }); // center of 2s–6s over a 10s timeline
    expect(screen.getByRole("button", { name: "Add to chat" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit manually" })).toBeInTheDocument();
  });

  it("shows no popover without unitActions, and none without a selected unit", () => {
    const { rerender } = render(<ZoomTrack durationSeconds={10} units={UNITS} selectedId="z1" />);
    expect(screen.queryByTestId("zoom-unit-popup")).not.toBeInTheDocument();
    rerender(<ZoomTrack durationSeconds={10} units={UNITS} unitActions={noopActions} />);
    expect(screen.queryByTestId("zoom-unit-popup")).not.toBeInTheDocument();
  });

  it("fires onAddToChat / onEdit with the unit, and edits on double-click", () => {
    const onAddToChat = vi.fn();
    const onEdit = vi.fn();
    render(<ZoomTrack durationSeconds={10} units={UNITS} selectedId="z1" unitActions={{ onAddToChat, onEdit }} />);
    fireEvent.click(screen.getByRole("button", { name: "Add to chat" }));
    expect(onAddToChat).toHaveBeenCalledWith(UNITS[0]);
    fireEvent.click(screen.getByRole("button", { name: "Edit manually" }));
    expect(onEdit).toHaveBeenCalledWith(UNITS[0]);
    fireEvent.doubleClick(screen.getByTestId("zoom-unit-z1"));
    expect(onEdit).toHaveBeenCalledTimes(2);
    expect(onEdit).toHaveBeenLastCalledWith(UNITS[0]);
  });

  it("a single click selects the unit but never edits it (no auto tab switch)", () => {
    const onSelect = vi.fn();
    const onEdit = vi.fn();
    render(<ZoomTrack durationSeconds={10} units={UNITS} onSelect={onSelect} unitActions={{ onAddToChat: () => undefined, onEdit }} />);
    fireEvent.click(screen.getByTestId("zoom-unit-z1"));
    expect(onSelect).toHaveBeenCalledWith("z1");
    expect(onEdit).not.toHaveBeenCalled();
  });
});
