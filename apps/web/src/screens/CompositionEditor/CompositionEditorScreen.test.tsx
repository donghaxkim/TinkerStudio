import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
    // Settings and Preview were removed from the app bar; only Export remains.
    expect(screen.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByLabelText("Playback controls")).toBeInTheDocument();
    // The edit toolbar is always present (identical in the empty shell and the real editor).
    expect(screen.getByRole("button", { name: "Split clip" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add marker" })).toBeInTheDocument();
    // The chat panel is no longer resizable — the drag handle was removed.
    expect(screen.queryByRole("separator", { name: "Resize chat panel" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Chat")).toBeInTheDocument();
    expect(screen.getByLabelText("Chat to edit")).toBeInTheDocument();
  });

  it("deletes the selected clip from the timeline via the Delete tool", async () => {
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
    expect(screen.getByRole("button", { name: "Delete clip" })).toBeDisabled();

    fireEvent.click(screen.getByTestId("composition-clip-feature"));
    expect(screen.getByRole("button", { name: "Delete clip" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Delete clip" }));
    expect(screen.queryByTestId("composition-clip-feature")).not.toBeInTheDocument();
    expect(screen.getByTestId("composition-clip-hook")).toBeInTheDocument();

    // Undo restores it; redo deletes again.
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByTestId("composition-clip-feature")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(screen.queryByTestId("composition-clip-feature")).not.toBeInTheDocument();
  });

  it("splits the clip under the playhead and drops a marker", async () => {
    const handle = fakeHandle(() => undefined);
    render(
      <CompositionEditorScreen
        compositionIndexUrl={INDEX}
        outputVideoUrl={VIDEO}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: handle } })}
      />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("composition-clip-hook")).toBeInTheDocument());

    // Playhead at 0 sits on a boundary — Split is disabled until it moves inside a clip.
    expect(screen.getByRole("button", { name: "Split clip" })).toBeDisabled();
    fireEvent.keyDown(screen.getByTestId("composition-timeline"), { key: "ArrowRight" }); // -> 0.25, inside "hook"
    expect(screen.getByRole("button", { name: "Split clip" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Split clip" }));
    expect(screen.getByTestId("composition-clip-hook-1")).toBeInTheDocument();
    expect(screen.getByTestId("composition-clip-hook-2")).toBeInTheDocument();
    expect(screen.queryByTestId("composition-clip-hook")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add marker" }));
    expect(screen.getByTestId("composition-label-Marker-1")).toBeInTheDocument();
  });

  it("trims the selected clip by dragging its edge handle, keeps it selected, and undo restores it", async () => {
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

    const track = screen.getByTestId("composition-timeline");
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
      left: 0, width: 1000, top: 0, right: 1000, bottom: 56, height: 56, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);

    // Select "feature" (4–10s) so its trim handles appear.
    fireEvent.click(screen.getByTestId("composition-clip-feature"));
    expect(screen.getByTestId("composition-clip-feature")).toHaveAttribute("data-selected", "true");

    // Drag the end handle from 10s (1000px) inward to 8s (800px).
    fireEvent.mouseDown(screen.getByTestId("composition-trim-feature-end"), { clientX: 1000 });
    fireEvent.mouseMove(track, { clientX: 800 });
    fireEvent.mouseUp(track, { clientX: 800 });

    // The clip shortened to 4.0s (8 − 4) and stays selected (selection survives the trim).
    const feature = screen.getByTestId("composition-clip-feature");
    expect(feature).toHaveTextContent("4.0s");
    expect(feature).toHaveAttribute("data-selected", "true");

    // Undo restores the generated length; redo re-applies the trim.
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByTestId("composition-clip-feature")).toHaveTextContent("6.0s");
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(screen.getByTestId("composition-clip-feature")).toHaveTextContent("4.0s");
  });

  it("creates a zoom unit on the zoom track, with undo/redo and keyboard delete", async () => {
    const handle = fakeHandle(() => undefined);
    render(
      <CompositionEditorScreen
        compositionIndexUrl={INDEX}
        outputVideoUrl={VIDEO}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: handle } })}
      />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("zoom-track")).toBeInTheDocument());

    const zoomTrack = screen.getByTestId("zoom-track");
    vi.spyOn(zoomTrack, "getBoundingClientRect").mockReturnValue({
      left: 0, width: 1000, top: 0, right: 1000, bottom: 24, height: 24, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);

    // Drag-create a 2s–6s zoom on the 10s timeline.
    fireEvent.mouseDown(zoomTrack, { clientX: 200 });
    fireEvent.mouseMove(zoomTrack, { clientX: 600 });
    fireEvent.mouseUp(zoomTrack, { clientX: 600 });

    const unit = await screen.findByTestId("zoom-unit-zoom-1");
    expect(unit).toHaveStyle({ left: "20%", width: "40%" });
    expect(unit).toHaveAttribute("data-selected", "true");

    // Undo removes it; redo restores it (shares the timeline edit history).
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.queryByTestId("zoom-unit-zoom-1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(screen.getByTestId("zoom-unit-zoom-1")).toBeInTheDocument();

    // Delete the selected unit from the zoom track.
    fireEvent.keyDown(screen.getByTestId("zoom-unit-zoom-1"), { key: "Delete" });
    expect(screen.queryByTestId("zoom-unit-zoom-1")).not.toBeInTheDocument();
  });

  async function createZoom() {
    const handle = fakeHandle(() => undefined);
    const view = render(
      <CompositionEditorScreen
        compositionIndexUrl={INDEX}
        outputVideoUrl={VIDEO}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: handle } })}
      />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("zoom-track")).toBeInTheDocument());
    const zoomTrack = screen.getByTestId("zoom-track");
    vi.spyOn(zoomTrack, "getBoundingClientRect").mockReturnValue({
      left: 0, width: 1000, top: 0, right: 1000, bottom: 24, height: 24, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    // Drag-create a 2s–6s zoom on the 10s timeline.
    fireEvent.mouseDown(zoomTrack, { clientX: 200 });
    fireEvent.mouseMove(zoomTrack, { clientX: 600 });
    fireEvent.mouseUp(zoomTrack, { clientX: 600 });
    await screen.findByTestId("zoom-unit-zoom-1");
    return view;
  }

  it("selecting a zoom opens its properties in the Zoom tab and an editable preview overlay", async () => {
    await createZoom();
    // The Zoom tab is active and the properties + preview target box are shown.
    expect(screen.getByRole("button", { name: "Zoom properties" })).toBeInTheDocument();
    expect(screen.getByTestId("zoom-properties")).toBeInTheDocument();
    expect(screen.getByTestId("zoom-target")).toBeInTheDocument();
    // A fresh unit shows the default scale; the target box is 1/1.6 of the frame.
    expect(screen.getByTestId("zoom-scale-readout")).toHaveTextContent("1.6×");
    expect(screen.getByTestId("zoom-target")).toHaveStyle({ width: "62.5%" });
  });

  it("changing the zoom scale updates the timeline model and the preview overlay, and undo restores it", async () => {
    await createZoom();
    const slider = screen.getByLabelText("Zoom scale");
    fireEvent.change(slider, { target: { value: "2" } });
    fireEvent.mouseUp(slider);
    expect(screen.getByTestId("zoom-scale-readout")).toHaveTextContent("2.0×");
    expect(screen.getByTestId("zoom-target")).toHaveStyle({ width: "50%" }); // 1/2 of the frame

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByTestId("zoom-scale-readout")).toHaveTextContent("1.6×");
    expect(screen.getByTestId("zoom-target")).toHaveStyle({ width: "62.5%" });
  });

  it("editing the zoom duration moves the block on the timeline (undoable)", async () => {
    await createZoom();
    const unit = screen.getByTestId("zoom-unit-zoom-1");
    expect(unit).toHaveStyle({ left: "20%", width: "40%" }); // 2s–6s on a 10s timeline

    fireEvent.change(screen.getByLabelText("Zoom duration"), { target: { value: "2" } }); // end → 4s
    expect(screen.getByTestId("zoom-unit-zoom-1")).toHaveStyle({ left: "20%", width: "20%" });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByTestId("zoom-unit-zoom-1")).toHaveStyle({ left: "20%", width: "40%" });
  });

  it("resets the zoom look and removes the unit, closing the Zoom tab", async () => {
    await createZoom();
    // Bump the scale, then Reset returns it to the default.
    const slider = screen.getByLabelText("Zoom scale");
    fireEvent.change(slider, { target: { value: "2.4" } });
    fireEvent.mouseUp(slider);
    expect(screen.getByTestId("zoom-scale-readout")).toHaveTextContent("2.4×");
    fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
    expect(screen.getByTestId("zoom-scale-readout")).toHaveTextContent("1.6×");

    // Remove deletes the unit, closes the Zoom tab, and drops the preview overlay.
    fireEvent.click(screen.getByRole("button", { name: "Remove zoom" }));
    expect(screen.queryByTestId("zoom-unit-zoom-1")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zoom properties" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("zoom-target")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Edit instruction")).toBeInTheDocument(); // back to chat
  });

  it("returns to chat from the Zoom tab and back, without losing the selection", async () => {
    await createZoom();
    fireEvent.click(screen.getByRole("button", { name: "Chat to edit" }));
    expect(screen.getByLabelText("Edit instruction")).toBeInTheDocument(); // chat restored
    expect(screen.queryByTestId("zoom-properties")).not.toBeInTheDocument();
    // The unit is still selected, and the Zoom tab can be reopened.
    expect(screen.getByTestId("zoom-unit-zoom-1")).toHaveAttribute("data-selected", "true");
    fireEvent.click(screen.getByRole("button", { name: "Zoom properties" }));
    expect(screen.getByTestId("zoom-properties")).toBeInTheDocument();
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
    // Assert via the chip's remove button — "feature" text also appears on the timeline clip,
    // so getByText("feature") would match two nodes.
    expect(screen.getByRole("button", { name: "Remove feature from chat" })).toBeInTheDocument();
  });

  it("offers an Add to Chat popup on a range drag and attaches the range only when confirmed", async () => {
    const handle = fakeHandle(() => undefined);
    render(
      <CompositionEditorScreen
        compositionIndexUrl={INDEX}
        outputVideoUrl={VIDEO}
        jobId="job-1"
        editClient={{ editComposition: async () => ({ id: "rev-1", compositionIndexUrl: "/rev1/index.html" }), renderRevision: async () => "/rendered.mp4" }}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: handle } })}
      />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("composition-timeline")).toBeInTheDocument());
    const track = screen.getByTestId("composition-timeline");
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
      left: 0, width: 1000, top: 0, right: 1000, bottom: 56, height: 56, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);

    // Drag a 2s–6s window (10s timeline → 200px–600px of a 1000px track).
    fireEvent.mouseDown(track, { clientX: 200 });
    fireEvent.mouseMove(track, { clientX: 600 });
    fireEvent.mouseUp(track, { clientX: 600 });

    // The popup appears, but the range is NOT yet attached as context.
    expect(screen.getByTestId("composition-selection-popup")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /from chat$/ })).not.toBeInTheDocument();

    // Confirming attaches the time window as a chip and dismisses the popup.
    fireEvent.click(screen.getByRole("button", { name: /Add to Chat/ }));
    expect(screen.getByRole("button", { name: "Remove 2.0s–6.0s from chat" })).toBeInTheDocument();
    expect(screen.queryByTestId("composition-selection-popup")).not.toBeInTheDocument();
  });

  it("sends an instruction to the edit client and previews the returned revision", async () => {
    const handle = fakeHandle(() => undefined);
    const editComposition = vi.fn(async (req: { jobId: string; instruction: string; context: unknown[] }) => {
      expect(req.jobId).toBe("job-1");
      expect(req.instruction).toBe("punch in");
      return { id: "rev-1", compositionIndexUrl: "/rev1/index.html?rev=1" };
    });
    render(
      <CompositionEditorScreen
        compositionIndexUrl={INDEX}
        outputVideoUrl={VIDEO}
        jobId="job-1"
        editClient={{ editComposition, renderRevision: async () => "/rendered.mp4" }}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: handle } })}
      />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("composition-timeline")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Edit instruction"), { target: { value: "punch in" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(editComposition).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("composition-frame")).toHaveAttribute("src", "/rev1/index.html?rev=1"));
    expect(screen.getByRole("button", { name: "Accept edit" })).toBeInTheDocument();
  });

  it("after an edit previews, the chips stay (Reprompt scope) and Accept is offered", async () => {
    const handle = fakeHandle(() => undefined);
    const editComposition = vi.fn(async () => ({ id: "rev-1", compositionIndexUrl: "/rev1/index.html?rev=1" }));
    render(<CompositionEditorScreen compositionIndexUrl={INDEX} outputVideoUrl={VIDEO} jobId="job-1" editClient={{ editComposition, renderRevision: async () => "/rendered.mp4" }} resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: handle } })} />);
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("composition-clip-feature")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("composition-clip-feature"));
    fireEvent.change(screen.getByLabelText("Edit instruction"), { target: { value: "punch in" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Accept edit" })).toBeInTheDocument());
    // Reprompt scope preserved: the clip chip is still present during preview
    expect(screen.getByRole("button", { name: "Remove feature from chat" })).toBeInTheDocument();
  });

  it("Export downloads the composition's output video when available", async () => {
    const handle = fakeHandle(() => undefined);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<CompositionEditorScreen compositionIndexUrl={INDEX} outputVideoUrl={VIDEO} resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: handle } })} />);
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("composition-timeline")).toBeInTheDocument());
    const exportBtn = screen.getByRole("button", { name: "Export" });
    expect(exportBtn).not.toBeDisabled();
    fireEvent.click(exportBtn);
    expect(open).toHaveBeenCalledWith(VIDEO, "_blank");
    open.mockRestore();
  });

  it("Export renders an edited revision on demand, then downloads the rendered (edited) video — not the base", async () => {
    const handle = fakeHandle(() => undefined);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const RENDERED = "/api/jobs/job-1/artifacts/revisions/rev-1/hyperframes/output.mp4";
    const editComposition = vi.fn(async () => ({ id: "rev-1", compositionIndexUrl: "/rev1/index.html?rev=1" })); // no rendered video yet
    const renderRevision = vi.fn(async (req: { jobId: string; revId: string }) => {
      expect(req).toEqual({ jobId: "job-1", revId: "rev-1" });
      return RENDERED;
    });
    render(
      <CompositionEditorScreen
        compositionIndexUrl={INDEX}
        outputVideoUrl={VIDEO}
        jobId="job-1"
        editClient={{ editComposition, renderRevision }}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: handle } })}
      />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("composition-timeline")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Edit instruction"), { target: { value: "punch in" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Accept edit" })).toBeInTheDocument());
    // The edited revision has no rendered video → first Export click renders it on demand.
    fireEvent.click(screen.getByRole("button", { name: "Render export" }));
    await waitFor(() => expect(renderRevision).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Export" })).not.toBeDisabled());
    // Second click downloads the freshly rendered EDIT — never the base video.
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(open).toHaveBeenCalledWith(RENDERED, "_blank");
    expect(open).not.toHaveBeenCalledWith(VIDEO, "_blank");
    open.mockRestore();
  });

  it("exports the current revision output video when the revision has rendered", async () => {
    const handle = fakeHandle(() => undefined);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const editComposition = vi.fn(async () => ({ id: "rev-1", compositionIndexUrl: "/rev1/index.html?rev=1", outputVideoUrl: "/rev1/output.mp4" }));
    render(
      <CompositionEditorScreen
        compositionIndexUrl={INDEX}
        outputVideoUrl={VIDEO}
        jobId="job-1"
        editClient={{ editComposition, renderRevision: async () => "/rev1/output.mp4" }}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: handle } })}
      />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("composition-timeline")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Edit instruction"), { target: { value: "rendered edit" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(screen.getByTestId("composition-frame")).toHaveAttribute("src", "/rev1/index.html?rev=1"));

    const exportBtn = screen.getByRole("button", { name: "Export" });
    expect(exportBtn).not.toBeDisabled();
    fireEvent.click(exportBtn);
    expect(open).toHaveBeenCalledWith("/rev1/output.mp4", "_blank");
    open.mockRestore();
  });
});
