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
  it("announces loading and calls onLoading for a new composition", () => {
    const onLoading = vi.fn();
    render(<CompositionPreview src={SRC} compositionId="sample" onLoading={onLoading} />);

    expect(screen.getByTestId("composition-loading")).toHaveTextContent("Loading editable preview");
    expect(onLoading).toHaveBeenCalledTimes(1);
  });

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

  it("falls back to DOM scene sections for a flat timeline with no nested clips", async () => {
    // The real pipeline emits a flat GSAP timeline (every scene is a tween, so getChildren
    // yields no nested timelines) plus <section class="scene"> markers. The preview should
    // surface those scenes as clips so a generated demo shows its segmentation.
    const handle = fakeHandle({ getChildren: () => [], totalDuration: () => 20 });
    const doc = new DOMParser().parseFromString(
      `<main data-composition-id="sample">
        <section class="scene" id="s1" data-start="0" data-duration="5" data-label="Landing"></section>
        <section class="scene" id="s2" data-start="5" data-duration="15"></section>
      </main>`,
      "text/html",
    );
    const onReady = vi.fn();
    render(
      <CompositionPreview
        src={SRC}
        compositionId="sample"
        onReady={onReady}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { sample: handle } })}
        resolveDocument={() => doc}
      />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const [model] = onReady.mock.calls[0]!;
    expect(model.clips).toHaveLength(2);
    expect(model.clips[0]).toMatchObject({ id: "s1", label: "Landing", start: 0, end: 5 });
    expect(model.durationSeconds).toBe(20);
  });

  it("cycles the preview aspect ratio and requests fullscreen from the player controls", async () => {
    const handle = fakeHandle();
    render(
      <CompositionPreview
        src={SRC}
        compositionId="sample"
        aspectRatio="16 / 9"
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { sample: handle } })}
      />,
    );
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("composition-frame-box")).toBeInTheDocument());

    const box = screen.getByTestId("composition-frame-box");
    expect(box).toHaveStyle({ aspectRatio: "16 / 9" });
    fireEvent.click(screen.getByRole("button", { name: /aspect ratio/i }));
    expect(box).toHaveStyle({ aspectRatio: "9 / 16" });
    fireEvent.click(screen.getByRole("button", { name: /aspect ratio/i }));
    expect(box).toHaveStyle({ aspectRatio: "1 / 1" });

    const requestFullscreen = vi.fn();
    (box as HTMLElement).requestFullscreen = requestFullscreen;
    fireEvent.click(screen.getByRole("button", { name: /full screen/i }));
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
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
