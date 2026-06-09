import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { sampleProject } from "../test/sampleProject.js";
import { Preview } from "./Preview.js";

describe("Preview", () => {
  it("renders a placeholder for the sample project's missing local media", () => {
    render(<Preview project={sampleProject} currentTime={0} />);

    expect(screen.getByTestId("missing-asset-placeholder")).toHaveTextContent("Preview placeholder");
    expect(screen.getByTestId("missing-asset-placeholder")).toHaveTextContent("Primary browser capture");
  });

  it("renders active caption overlay at 3s", () => {
    render(<Preview project={sampleProject} currentTime={3} />);

    expect(screen.getByTestId("active-caption")).toHaveTextContent("Turn product flows into polished demo videos.");
  });

  it("renders active zoom and callout overlays at 14s", () => {
    render(<Preview project={sampleProject} currentTime={14} />);

    expect(screen.getByTestId("active-zoom")).toHaveAccessibleName("Active zoom zoom_001");
    expect(screen.getByTestId("active-callout")).toHaveTextContent("Real-time analytics");
  });

  it("renders cursor click events near their timestamp", () => {
    render(<Preview project={sampleProject} currentTime={12.1} />);

    expect(screen.getByTestId("click-event")).toHaveTextContent("Open analytics");
    expect(screen.getByTestId("active-cursor")).toBeInTheDocument();
  });
});
