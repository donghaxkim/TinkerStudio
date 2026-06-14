import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CompositionTimelineHandle, TimelineRegistryWindow } from "@tinker/editor";
import { CompositionEditorScreen } from "./CompositionEditorScreen.js";

function fakeHandle(seek: (t: number) => void): CompositionTimelineHandle {
  return {
    totalDuration: () => 10,
    labels: [] as unknown as Record<string, number>,
    getChildren: () => [
      { startTime: () => 0, totalDuration: () => 4, vars: { id: "hook" } },
      { startTime: () => 4, totalDuration: () => 6, vars: { id: "feature" } },
    ],
    seek,
    play: () => undefined,
    pause: () => undefined,
  } as unknown as CompositionTimelineHandle;
}

const INDEX = "/api/jobs/j/artifacts/hyperframes/index.html";
const VIDEO = "/api/jobs/j/artifacts/hyperframes/output.mp4";

describe("CompositionEditorScreen", () => {
  it("shows the timeline (from the preview model) once the composition loads", async () => {
    const handle = fakeHandle(() => undefined);
    render(
      <CompositionEditorScreen
        compositionIndexUrl={INDEX}
        outputVideoUrl={VIDEO}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: handle } })}
      />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("composition-timeline")).toBeInTheDocument());
    expect(screen.getByTestId("composition-clip-hook")).toBeInTheDocument();
    expect(screen.getByTestId("composition-clip-feature")).toBeInTheDocument();
  });

  it("seeks the preview when a clip is clicked in the timeline", async () => {
    const seeks: number[] = [];
    const handle = fakeHandle((t) => seeks.push(t));
    render(
      <CompositionEditorScreen
        compositionIndexUrl={INDEX}
        outputVideoUrl={VIDEO}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: handle } })}
      />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("composition-clip-feature")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("composition-clip-feature"));
    await waitFor(() => expect(seeks).toContain(4));
    expect(screen.getByTestId("composition-clip-feature")).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("composition-playhead")).toHaveStyle({ left: "40%" }); // currentTime 4 / duration 10
  });

  it("renders the porcelain shell: app bar + playback bar + chat panel", async () => {
    const handle = fakeHandle(() => undefined);
    render(
      <CompositionEditorScreen
        compositionIndexUrl={INDEX}
        outputVideoUrl={VIDEO}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: handle } })}
      />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("composition-timeline")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByLabelText("Playback controls")).toBeInTheDocument();
    expect(screen.getByLabelText("Chat")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add selection to chat" })).toBeDisabled();
  });

  it("adds a clip selection to chat as a chip", async () => {
    const handle = fakeHandle(() => undefined);
    render(
      <CompositionEditorScreen
        compositionIndexUrl={INDEX}
        outputVideoUrl={VIDEO}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: handle } })}
      />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("composition-clip-feature")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("composition-clip-feature")); // selects clip "feature" (4–10)
    fireEvent.click(screen.getByRole("button", { name: "Add selection to chat" }));
    // Assert via the chip's remove button — "feature" text also appears on the timeline clip,
    // so getByText("feature") would match two nodes.
    expect(screen.getByRole("button", { name: "Remove feature from chat" })).toBeInTheDocument();
  });
});
