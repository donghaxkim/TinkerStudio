import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { CursorEvent, DemoProject } from "@tinker/project-schema";
import type { EditorCommand } from "@tinker/editor";
import { sampleProject } from "../../../../../packages/editor/src/test/sampleProject.js";
import { EditorAutoZoomPanel } from "./EditorAutoZoomPanel.js";

function dwellProject(overrides: Partial<DemoProject> = {}): DemoProject {
  const cursorEvents: CursorEvent[] = [
    { time: 3, type: "move", x: 420, y: 310 },
    { time: 3.4, type: "move", x: 422, y: 312 },
    { time: 3.8, type: "move", x: 421, y: 311 },
  ];

  return {
    ...sampleProject,
    zooms: [],
    cursorEvents,
    ...overrides,
  };
}

describe("EditorAutoZoomPanel", () => {
  it("toggle ON applies auto-zoom moves (onAccept called, zooms reflect intensity scale)", () => {
    const onPreviewProjectChange = vi.fn();
    const onAccept = vi.fn();
    const project = dwellProject();

    render(
      <EditorAutoZoomPanel
        project={project}
        onPreviewProjectChange={onPreviewProjectChange}
        onAccept={onAccept}
      />,
    );

    const toggle = screen.getByRole("switch", { name: "Zoom on clicks" });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "true");
    // onAccept is called once with the project + command.
    expect(onAccept).toHaveBeenCalledTimes(1);
    const [updatedProject, command] = onAccept.mock.calls[0] ?? [];
    // The updated project has one zoom added.
    expect(updatedProject.zooms).toHaveLength(1);
    // The command is labelled correctly.
    expect(command.label).toBe("Accept auto zoom suggestions");
    // The zoom's target width ≈ frameWidth / 1.6 = 1920 / 1.6 = 1200.
    const zoom = updatedProject.zooms[0];
    expect(zoom.target.width).toBeCloseTo(1200, 0);
    expect(zoom.target.height).toBeCloseTo(675, 0);
    // The original project is not mutated.
    expect(project.zooms).toHaveLength(0);
  });

  it("toggle OFF removes the auto-added zooms (onAccept called to remove)", () => {
    const onAccept = vi.fn();
    // Use a stateful wrapper so the project prop updates after onAccept is called.
    let capturedProject: DemoProject = dwellProject();
    let capturedCommand: EditorCommand | undefined;

    function Wrapper() {
      const [proj, setProj] = useState(capturedProject);
      return (
        <EditorAutoZoomPanel
          project={proj}
          onPreviewProjectChange={vi.fn()}
          onAccept={(updatedProject, command) => {
            onAccept(updatedProject, command);
            capturedProject = updatedProject;
            capturedCommand = command;
            setProj(updatedProject);
          }}
        />
      );
    }

    const { unmount } = render(<Wrapper />);

    const toggle = screen.getByRole("switch", { name: "Zoom on clicks" });

    // Toggle ON — onAccept called to add the zoom; the wrapper updates the project prop.
    fireEvent.click(toggle);
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(capturedProject.zooms).toHaveLength(1);

    onAccept.mockClear();

    // Toggle OFF — onAccept called to remove the zoom.
    fireEvent.click(screen.getByRole("switch", { name: "Zoom on clicks" }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    const [afterRemoveProject, removeCommand] = onAccept.mock.calls[0] ?? [];
    expect(afterRemoveProject.zooms).toHaveLength(0);
    expect(removeCommand.label).toBe("Remove auto zoom");

    unmount();
  });

  it("intensity slider changes the displayed value", () => {
    render(
      <EditorAutoZoomPanel
        project={dwellProject()}
        onPreviewProjectChange={vi.fn()}
        onAccept={vi.fn()}
      />,
    );

    const slider = screen.getByRole("slider", { name: "Auto zoom intensity" });
    expect(slider).toHaveValue("1.6");
    expect(screen.getByText("×1.6")).toBeInTheDocument();

    fireEvent.change(slider, { target: { value: "1.8" } });
    expect(slider).toHaveValue("1.8");
    expect(screen.getByText("×1.8")).toBeInTheDocument();
  });

  it("intensity slider while ON rescales the auto-zoom (onAccept called twice total: add + rescale)", () => {
    const onAccept = vi.fn();
    const project = dwellProject();

    render(
      <EditorAutoZoomPanel
        project={project}
        onPreviewProjectChange={vi.fn()}
        onAccept={onAccept}
      />,
    );

    const toggle = screen.getByRole("switch", { name: "Zoom on clicks" });
    fireEvent.click(toggle); // ON → first onAccept call
    expect(onAccept).toHaveBeenCalledTimes(1);

    const slider = screen.getByRole("slider", { name: "Auto zoom intensity" });
    fireEvent.change(slider, { target: { value: "2.0" } });

    // Second call: rescale command.
    expect(onAccept).toHaveBeenCalledTimes(2);
    const [rescaledProject, rescaleCommand] = onAccept.mock.calls[1] ?? [];
    // At ×2.0 the target width = 1920 / 2.0 = 960.
    expect(rescaledProject.zooms[0]?.target.width).toBeCloseTo(960, 0);
    expect(rescaleCommand.label).toBe("Rescale auto zoom");
  });

  it("empty-suggestions path shows the calm note without crashing", () => {
    render(
      <EditorAutoZoomPanel
        project={{ ...sampleProject, cursorEvents: [], zooms: [] }}
        onPreviewProjectChange={vi.fn()}
        onAccept={vi.fn()}
      />,
    );

    const toggle = screen.getByRole("switch", { name: "Zoom on clicks" });
    fireEvent.click(toggle);

    // Toggle stays on but shows the calm note.
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("status")).toHaveTextContent(
      "No click moments found to zoom — add a zoom manually below.",
    );
  });

  it("stale-clear: another preview source taking over does not crash", () => {
    const onPreviewProjectChange = vi.fn();
    const onAccept = vi.fn();
    const project = dwellProject();

    const { rerender } = render(
      <EditorAutoZoomPanel
        project={project}
        previewSource={undefined}
        onPreviewProjectChange={onPreviewProjectChange}
        onAccept={onAccept}
      />,
    );

    // Toggle ON — applies zooms immediately.
    fireEvent.click(screen.getByRole("switch", { name: "Zoom on clicks" }));

    // AI takes the preview slot.
    rerender(
      <EditorAutoZoomPanel
        project={project}
        previewSource="ai"
        onPreviewProjectChange={onPreviewProjectChange}
        onAccept={onAccept}
      />,
    );

    // Panel does not crash; toggle stays on (zooms were already applied).
    expect(screen.getByRole("switch", { name: "Zoom on clicks" })).toHaveAttribute("aria-checked", "true");
  });
});
