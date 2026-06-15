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
        editClient={{ editComposition }}
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
    render(<CompositionEditorScreen compositionIndexUrl={INDEX} outputVideoUrl={VIDEO} jobId="job-1" editClient={{ editComposition }} resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: handle } })} />);
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("composition-clip-feature")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("composition-clip-feature"));
    fireEvent.click(screen.getByRole("button", { name: "Add selection to chat" }));
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

  it("does not expose the original output video for export while previewing an edit-only revision", async () => {
    const handle = fakeHandle(() => undefined);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const editComposition = vi.fn(async () => ({ id: "rev-1", compositionIndexUrl: "/rev1/index.html?rev=1" }));
    render(<CompositionEditorScreen compositionIndexUrl={INDEX} outputVideoUrl={VIDEO} jobId="job-1" editClient={{ editComposition }} resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: handle } })} />);
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("composition-timeline")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Edit instruction"), { target: { value: "punch in" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(screen.getByTestId("composition-frame")).toHaveAttribute("src", "/rev1/index.html?rev=1"));

    const exportBtn = screen.getByRole("button", { name: "Export" });
    expect(exportBtn).toBeDisabled();
    fireEvent.click(exportBtn);
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("exports the current revision output video when the revision has rendered", async () => {
    const handle = fakeHandle(() => undefined);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const editComposition = vi.fn(async () => ({ id: "rev-1", compositionIndexUrl: "/rev1/index.html?rev=1", outputVideoUrl: "/rev1/output.mp4" }));
    render(<CompositionEditorScreen compositionIndexUrl={INDEX} outputVideoUrl={VIDEO} jobId="job-1" editClient={{ editComposition }} resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: handle } })} />);
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
