import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CursorEvent, DemoProject } from "@tinker/project-schema";
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
  it("suggests zooms and previews them without accepting", () => {
    const onPreviewProjectChange = vi.fn();
    const onAccept = vi.fn();
    const project = dwellProject();

    render(<EditorAutoZoomPanel project={project} onPreviewProjectChange={onPreviewProjectChange} onAccept={onAccept} />);
    fireEvent.click(screen.getByRole("button", { name: "Suggest zooms" }));

    expect(screen.getByText(/1 proposed zoom/i)).toBeInTheDocument();
    expect(onPreviewProjectChange).toHaveBeenCalledWith(expect.objectContaining({
      zooms: expect.arrayContaining([
        expect.objectContaining({ id: expect.stringMatching(/^auto_zoom_/) }),
      ]),
    }));
    expect(onAccept).not.toHaveBeenCalled();
    expect(project.zooms).toHaveLength(0);
  });

  it("rejects suggestions without mutating or accepting", () => {
    const onPreviewProjectChange = vi.fn();
    const onAccept = vi.fn();

    render(<EditorAutoZoomPanel project={dwellProject()} onPreviewProjectChange={onPreviewProjectChange} onAccept={onAccept} />);
    fireEvent.click(screen.getByRole("button", { name: "Suggest zooms" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject suggestions" }));

    expect(onPreviewProjectChange).toHaveBeenLastCalledWith(undefined);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("accepts all suggestions as one undoable command", () => {
    const onPreviewProjectChange = vi.fn();
    const onAccept = vi.fn();

    render(<EditorAutoZoomPanel project={dwellProject()} onPreviewProjectChange={onPreviewProjectChange} onAccept={onAccept} />);
    fireEvent.click(screen.getByRole("button", { name: "Suggest zooms" }));
    fireEvent.click(screen.getByRole("button", { name: "Accept all suggestions" }));

    expect(onAccept).toHaveBeenCalledTimes(1);
    const [updatedProject, command] = onAccept.mock.calls[0] ?? [];
    expect(updatedProject.zooms).toHaveLength(1);
    expect(command.label).toBe("Accept auto zoom suggestions");
  });

  it("disables stale suggestions when another preview source takes ownership", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Suggest zooms" }));

    expect(screen.getByText(/1 proposed zoom/i)).toBeInTheDocument();

    rerender(
      <EditorAutoZoomPanel
        project={project}
        previewSource="ai"
        onPreviewProjectChange={onPreviewProjectChange}
        onAccept={onAccept}
      />,
    );

    expect(screen.queryByText(/1 proposed zoom/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept all suggestions" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject suggestions" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Accept all suggestions" }));
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("shows a non-crashing message when no suggestions are found", () => {
    render(<EditorAutoZoomPanel project={{ ...sampleProject, cursorEvents: [], zooms: [] }} onPreviewProjectChange={vi.fn()} onAccept={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Suggest zooms" }));

    expect(screen.getByRole("status")).toHaveTextContent("No useful cursor dwell found");
  });
});
