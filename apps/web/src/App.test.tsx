import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";

describe("App", () => {
  it("loads the sample editor shell and can seek to overlay times", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Sample Product Demo" })).toBeInTheDocument();
    expect(screen.getByLabelText("Project metadata")).toHaveTextContent("45s");
    expect(screen.getByText("Main capture")).toBeInTheDocument();
    expect(screen.getByText("Browser flow")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Jump to caption (3s)" }));
    expect(screen.getByTestId("active-caption")).toHaveTextContent("Turn product flows into polished demo videos.");

    fireEvent.click(screen.getByRole("button", { name: "Jump to zoom/callout (14s)" }));
    expect(screen.getByTestId("active-callout")).toHaveTextContent("Real-time analytics");
  });

  it("renders Create Demo UI before the editor", () => {
    render(<App />);

    expect(screen.getByLabelText("Create demo")).toBeInTheDocument();
    expect(screen.getByLabelText("GitHub repo URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Generation progress")).toBeInTheDocument();
  });
});
