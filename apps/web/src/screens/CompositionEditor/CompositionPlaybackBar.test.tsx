import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompositionPlaybackBar } from "./CompositionPlaybackBar.js";

const base = {
  currentTime: 2, duration: 24, isPlaying: false, canPrev: true, canNext: true,
  onPlayPause: () => undefined, onPrev: () => undefined, onNext: () => undefined,
};

describe("CompositionPlaybackBar", () => {
  it("renders the timecode as m:ss.s / m:ss.s", () => {
    render(<CompositionPlaybackBar {...base} />);
    expect(screen.getByLabelText("Timecode")).toHaveTextContent("0:02.0 / 0:24.0");
  });
  it("toggles the play/pause label", () => {
    const onPlayPause = vi.fn();
    const { rerender } = render(<CompositionPlaybackBar {...base} onPlayPause={onPlayPause} />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(onPlayPause).toHaveBeenCalledTimes(1);
    rerender(<CompositionPlaybackBar {...base} isPlaying onPlayPause={onPlayPause} />);
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });
  it("disables prev/next per canPrev/canNext", () => {
    render(<CompositionPlaybackBar {...base} canPrev={false} canNext={false} />);
    expect(screen.getByRole("button", { name: "Skip to beginning" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Skip to end" })).toBeDisabled();
  });

  it("no longer shows a render-target quality label", () => {
    render(<CompositionPlaybackBar {...base} />);
    expect(screen.queryByText(/1080p|60fps/)).not.toBeInTheDocument();
  });

  it("always renders the edit toolbar (undo, redo, split, trash) — identical in every editor", () => {
    render(<CompositionPlaybackBar {...base} />);
    for (const name of ["Undo", "Redo", "Split clip", "Delete clip"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("disables edit tools by their can* flags and wires handlers", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const onSplit = vi.fn();
    const onDelete = vi.fn();
    const { rerender } = render(<CompositionPlaybackBar {...base} />);
    // With no handlers / can* flags, the history + clip tools are disabled.
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Split clip" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete clip" })).toBeDisabled();

    rerender(
      <CompositionPlaybackBar
        {...base}
        onUndo={onUndo} canUndo
        onRedo={onRedo} canRedo
        onSplit={onSplit} canSplit
        onDelete={onDelete} canDelete
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    fireEvent.click(screen.getByRole("button", { name: "Split clip" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete clip" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).toHaveBeenCalledTimes(1);
    expect(onSplit).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
