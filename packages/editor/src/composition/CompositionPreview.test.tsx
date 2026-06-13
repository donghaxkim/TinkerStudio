import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompositionPreview } from "./CompositionPreview.js";
import type { CompositionTimelineHandle, TimelineRegistryWindow } from "./compositionWindow.js";

function fakeHandle(overrides: Partial<CompositionTimelineHandle> = {}): CompositionTimelineHandle {
  return {
    totalDuration: () => 8,
    labels: {},
    getChildren: () => [{ startTime: () => 0, totalDuration: () => 8, vars: { id: "scene" } }],
    seek: () => undefined,
    play: () => undefined,
    pause: () => undefined,
    ...overrides,
  } as CompositionTimelineHandle;
}

const SRC = "/api/jobs/j/artifacts/hyperframes/index.html";

describe("CompositionPreview", () => {
  it("reads the timeline on iframe load and reports the model", async () => {
    const pause = vi.fn();
    const handle = fakeHandle({ pause });
    const onReady = vi.fn();
    render(
      <CompositionPreview
        src={SRC}
        compositionId="sample"
        onReady={onReady}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { sample: handle } })}
      />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const [model] = onReady.mock.calls[0]!;
    expect(model.durationSeconds).toBe(8);
    expect(model.clips).toHaveLength(1);
    expect(pause).toHaveBeenCalled();
  });

  it("seeks the timeline when currentTime changes after ready", async () => {
    const seek = vi.fn();
    const handle = fakeHandle({ seek });
    const resolveWindow = (): TimelineRegistryWindow => ({ __timelines: { sample: handle } });
    const { rerender } = render(
      <CompositionPreview src={SRC} compositionId="sample" currentTime={0} resolveWindow={resolveWindow} />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(seek).toHaveBeenCalledWith(0));
    rerender(<CompositionPreview src={SRC} compositionId="sample" currentTime={3.5} resolveWindow={resolveWindow} />);
    await waitFor(() => expect(seek).toHaveBeenCalledWith(3.5));
  });

  it("falls back to the rendered video when the timeline never registers", async () => {
    render(
      <CompositionPreview
        src={SRC}
        compositionId="sample"
        fallbackVideoSrc="/api/jobs/j/artifacts/hyperframes/output.mp4"
        timeoutMs={0}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: {} })}
      />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() =>
      expect(screen.getByTestId("composition-fallback-video")).toHaveAttribute(
        "src",
        "/api/jobs/j/artifacts/hyperframes/output.mp4",
      ),
    );
  });

  it("shows an error placeholder (and calls onError) when unavailable with no fallback", async () => {
    const onError = vi.fn();
    render(
      <CompositionPreview
        src={SRC}
        compositionId="sample"
        timeoutMs={0}
        onError={onError}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: {} })}
      />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("composition-error")).toBeInTheDocument());
    expect(onError).toHaveBeenCalled();
  });

  it("does not call onReady or onError after unmount", async () => {
    const onReady = vi.fn();
    const onError = vi.fn();
    const { unmount } = render(
      <CompositionPreview
        src={SRC}
        compositionId="sample"
        onReady={onReady}
        onError={onError}
        timeoutMs={200}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: {} })}
      />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(onReady).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("reads the sole timeline when no compositionId is given", async () => {
    const handle = fakeHandle();
    const onReady = vi.fn();
    render(
      <CompositionPreview
        src={SRC}
        onReady={onReady}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { whatever: handle } })}
      />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(onReady.mock.calls[0]![0].durationSeconds).toBe(8);
  });
});
