import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TimelineRegistryWindow, CompositionTimelineHandle } from "@tinker/editor";
import { createMockCompositionGenerationClient } from "../../lib/mockCompositionGenerationClient.js";
import { CompositionDemoScreen } from "./CompositionDemoScreen.js";

function fakeHandle(): CompositionTimelineHandle {
  return {
    totalDuration: () => 10,
    labels: [] as unknown as Record<string, number>,
    getChildren: () => [{ startTime: () => 0, totalDuration: () => 10, vars: { id: "scene" } }],
    seek: () => undefined,
    play: () => undefined,
    pause: () => undefined,
  } as unknown as CompositionTimelineHandle;
}

describe("CompositionDemoScreen", () => {
  it("generates a composition and opens it in the editor", async () => {
    const client = createMockCompositionGenerationClient();
    render(
      <CompositionDemoScreen
        client={client}
        resolveWindow={(): TimelineRegistryWindow => ({ __timelines: { only: fakeHandle() } })}
      />,
    );

    fireEvent.change(screen.getByLabelText("Repo URL"), { target: { value: "https://github.com/acme/driftboard" } });
    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "https://driftboard.example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() => expect(screen.getByTestId("composition-frame")).toBeInTheDocument());
    fireEvent.load(screen.getByTestId("composition-frame"));
    await waitFor(() => expect(screen.getByTestId("composition-timeline")).toBeInTheDocument());
  });
});
