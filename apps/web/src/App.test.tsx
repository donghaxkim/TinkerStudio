import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";

describe("App", () => {
  it("renders the simplified Tinker editor layout", () => {
    render(<App />);

    expect(screen.getByLabelText("Tinker editor")).toBeInTheDocument();
    expect(screen.getByLabelText("Editor side panel")).toBeInTheDocument();
    expect(screen.queryByText("Screen Studio + Cursor inspired web UI")).not.toBeInTheDocument();

    const actions = within(screen.getByLabelText("Editor actions"));

    expect(actions.getByRole("button", { name: /Auto zoom/i })).toBeInTheDocument();
    expect(actions.getByRole("button", { name: /Manual zoom/i })).toBeInTheDocument();
    expect(actions.getByRole("button", { name: /Trim/i })).toBeInTheDocument();
    expect(actions.getByRole("button", { name: /Speed 2x/i })).toBeInTheDocument();
  });

  it("does not expose removed feature controls", () => {
    render(<App />);

    expect(screen.queryByText(/caption/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/callout/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/narration/i)).not.toBeInTheDocument();
  });

  it("adds the selected range from the minimal composer attachment button", () => {
    render(<App />);

    expect(screen.queryByRole("button", { name: /^Range$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Frame$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Attach selected range/i }));
    expect(screen.getByText("Selected range")).toBeInTheDocument();
  });

  it("reviews and applies a mock auto zoom proposal", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Chat/i }));
    fireEvent.click(within(screen.getByLabelText("Editor actions")).getByRole("button", { name: /Auto zoom/i }));

    expect(screen.getByText("Auto zoom follows the cursor")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Review/i }));
    expect(screen.getByText(/auto_zoom/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Apply/i }));
    expect(screen.queryByText("Auto zoom follows the cursor")).not.toBeInTheDocument();
  });

  it("opens the zoom editor when an existing zoom is selected", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Edit manual zoom/i }));

    expect(screen.getByText("Close Zoom editor")).toBeInTheDocument();
    expect(screen.getByText("Zoom level")).toBeInTheDocument();
    expect(screen.getByText("Manual zoom uses an explicit target region.")).toBeInTheDocument();
  });

  it("adds a zoom from the zoom lane hover affordance", () => {
    render(<App />);

    const zoomTrack = screen.getByLabelText("Timeline").querySelector(".zoom-track");

    expect(zoomTrack).toBeTruthy();

    Object.defineProperty(zoomTrack, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, width: 450 }),
    });

    fireEvent.mouseMove(zoomTrack!, { clientX: 225 });
    fireEvent.click(screen.getByRole("button", { name: /Add zoom at/i }));

    expect(screen.getByText("Close Zoom editor")).toBeInTheDocument();
    expect(screen.getByText("Zoom mode")).toBeInTheDocument();
  });
});
