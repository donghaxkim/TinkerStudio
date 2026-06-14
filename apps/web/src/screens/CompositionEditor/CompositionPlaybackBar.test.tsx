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
    expect(screen.getByRole("button", { name: "Previous clip" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next clip" })).toBeDisabled();
  });
});
