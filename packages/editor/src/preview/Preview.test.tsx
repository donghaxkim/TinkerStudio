import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { sampleProject } from "../test/sampleProject.js";
import { Preview } from "./Preview.js";

function percentValue(value: string) {
  return Number.parseFloat(value.replace("%", ""));
}

function expectPercent(value: string, expected: number) {
  expect(percentValue(value)).toBeCloseTo(expected, 6);
}

describe("Preview", () => {
  it("renders the sample project's bundled captured media", () => {
    render(<Preview project={sampleProject} currentTime={0} />);

    expect(screen.getByTestId("preview-video")).toHaveAttribute("src", expect.stringContaining("capture-001.mp4"));
    expect(screen.queryByTestId("missing-asset-placeholder")).not.toBeInTheDocument();
  });

  it("video does not render browser controls (clean preview stage)", () => {
    render(<Preview project={sampleProject} currentTime={0} />);

    expect(screen.getByTestId("preview-video")).not.toHaveAttribute("controls");
  });

  it("does not render a header or timecode output above the stage", () => {
    render(<Preview project={sampleProject} currentTime={0} />);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders a placeholder for non-previewable local media", () => {
    render(
      <Preview
        project={{
          ...sampleProject,
          assets: sampleProject.assets.map((asset) => ({ ...asset, uri: "uploads/missing-capture.mp4" })),
        }}
        currentTime={0}
      />,
    );

    expect(screen.getByTestId("missing-asset-placeholder")).toHaveTextContent("Preview placeholder");
    expect(screen.getByTestId("missing-asset-placeholder")).toHaveTextContent("Primary browser capture");
  });

  it("renders active zoom overlay at 14s", () => {
    render(<Preview project={sampleProject} currentTime={14} />);

    const layer = screen.getByTestId("preview-motion-layer");
    expect(percentValue(layer.style.width)).toBeGreaterThan(100);
    expect(percentValue(layer.style.height)).toBeGreaterThan(100);
    expect(screen.queryByText(/Zoom \d+×\d+/)).not.toBeInTheDocument();
  });

  it("renders cursor click events near their timestamp", () => {
    render(<Preview project={sampleProject} currentTime={12.1} />);

    expect(screen.getByTestId("click-event")).toHaveAccessibleName("Click indicator");
    expect(screen.queryByText("Open analytics")).not.toBeInTheDocument();
    expect(screen.getByTestId("active-cursor")).toBeInTheDocument();
  });

  it("normalizes cursor positions for portrait preview dimensions", () => {
    const portraitProject = {
      ...sampleProject,
      aspectRatio: "9:16" as const,
      assets: sampleProject.assets.map((asset) => ({ ...asset, width: 1080, height: 1920 })),
      cursorEvents: [{ time: 1, type: "move" as const, x: 540, y: 480 }],
    };

    render(<Preview project={portraitProject} currentTime={1} />);

    const cursor = screen.getByTestId("active-cursor");
    expect(cursor).toHaveStyle({ left: "50%", top: "25%" });
  });

  it.each([
    ["16:9", { mediaTop: 0, mediaHeight: 100, pointTop: 25 }],
    ["9:16", { mediaTop: 34.1796875, mediaHeight: 31.640625, pointTop: 42.08984375 }],
    ["1:1", { mediaTop: 21.875, mediaHeight: 56.25, pointTop: 35.9375 }],
  ] as const)("places preview media, cursor, and clicks in the contained source area for %s output", (aspectRatio, expected) => {
    const project = {
      ...sampleProject,
      aspectRatio,
      assets: sampleProject.assets.map((asset) => ({
        ...asset,
        uri: "https://example.com/capture.mp4",
        width: 1920,
        height: 1080,
      })),
      cursorEvents: [{ time: 1, type: "click" as const, x: 960, y: 270 }],
    };

    render(<Preview project={project} currentTime={1} />);

    const video = screen.getByTestId("preview-video");
    const cursor = screen.getByTestId("active-cursor");
    const click = screen.getByTestId("click-event");

    expectPercent(video.style.left, 0);
    expectPercent(video.style.top, expected.mediaTop);
    expectPercent(video.style.width, 100);
    expectPercent(video.style.height, expected.mediaHeight);
    expectPercent(cursor.style.left, 50);
    expectPercent(cursor.style.top, expected.pointTop);
    expectPercent(click.style.left, 50);
    expectPercent(click.style.top, expected.pointTop);
  });

  describe("PB-006 cursor display settings", () => {
    const clickProject = {
      ...sampleProject,
      cursorEvents: [
        { time: 1, type: "move" as const, x: 960, y: 540 },
        { time: 1, type: "click" as const, x: 960, y: 540 },
      ],
    };

    it("renders the cursor and a ring click indicator by default", () => {
      render(<Preview project={clickProject} currentTime={1} />);

      expect(screen.getByTestId("active-cursor")).toBeInTheDocument();
      const click = screen.getByTestId("click-event");
      expect(click).toBeInTheDocument();
      expect(click).toHaveAttribute("data-click-effect", "ring");
    });

    it("renders no cursor or click overlay when cursor.hidden is true", () => {
      render(<Preview project={{ ...clickProject, cursor: { hidden: true } }} currentTime={1} />);

      expect(screen.queryByTestId("active-cursor")).not.toBeInTheDocument();
      expect(screen.queryByTestId("click-event")).not.toBeInTheDocument();
    });

    it("keeps the cursor but renders no click indicator when clickEffect is none", () => {
      render(<Preview project={{ ...clickProject, cursor: { clickEffect: "none" } }} currentTime={1} />);

      expect(screen.getByTestId("active-cursor")).toBeInTheDocument();
      expect(screen.queryByTestId("click-event")).not.toBeInTheDocument();
    });

    it("marks the click indicator as a ripple when clickEffect is ripple", () => {
      render(<Preview project={{ ...clickProject, cursor: { clickEffect: "ripple" } }} currentTime={1} />);

      expect(screen.getByTestId("click-event")).toHaveAttribute("data-click-effect", "ripple");
    });
  });

  it("positions off-center zooms with the same crop-window geometry as export", () => {
    const project = {
      ...sampleProject,
      assets: sampleProject.assets.map((asset) => ({
        ...asset,
        uri: "https://example.com/capture.mp4",
        width: 1920,
        height: 1080,
      })),
      zooms: [
        {
          id: "zoom_off_center",
          start: 0.5,
          end: 1.5,
          target: { x: 480, y: 270, width: 480, height: 270 },
          easing: "linear" as const,
        },
      ],
      cursorEvents: [{ time: 1, type: "move" as const, x: 720, y: 405 }],
    };

    render(<Preview project={project} currentTime={1} />);

    const layer = screen.getByTestId("preview-motion-layer");
    const cursor = screen.getByTestId("active-cursor");

    expectPercent(layer.style.left, -100);
    expectPercent(layer.style.top, -100);
    expectPercent(layer.style.width, 400);
    expectPercent(layer.style.height, 400);
    expectPercent(cursor.style.left, 37.5);
    expectPercent(cursor.style.top, 37.5);
  });
});
