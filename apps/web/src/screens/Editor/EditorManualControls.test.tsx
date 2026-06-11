import { fireEvent, render, screen } from "@testing-library/react";
import { DemoProjectSchema } from "@tinker/project-schema";
import { describe, expect, it, vi } from "vitest";
import sampleProjectInput from "../../../../../packages/project-schema/fixtures/demo-project.sample.json";
import { EditorManualControls } from "./EditorManualControls.js";

const sampleProject = DemoProjectSchema.parse(sampleProjectInput);

describe("EditorManualControls", () => {
  it("adds a zoom for the selected range", () => {
    const onApply = vi.fn();

    render(<EditorManualControls project={sampleProject} selectedRange={{ start: 6, end: 9 }} onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: "Add zoom" }));

    expect(onApply).toHaveBeenCalledTimes(1);
    const [project, command] = onApply.mock.calls[0] ?? [];
    expect(command.label).toBe("Add zoom");
    expect(project.zooms.at(-1)).toEqual(expect.objectContaining({ start: 6, end: 9 }));
  });

  it("trims the selected clip to the selected range", () => {
    const onApply = vi.fn();

    render(<EditorManualControls project={sampleProject} selectedRange={{ start: 12, end: 18 }} onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: "Trim clip to range" }));

    const [project, command] = onApply.mock.calls[0] ?? [];
    expect(command.label).toBe("Trim clip");
    expect(project.tracks[0]?.clips[0]).toEqual(expect.objectContaining({ id: "clip_capture_001", start: 12, end: 18 }));
  });

  it("deletes the selected zoom", () => {
    const onApply = vi.fn();

    render(<EditorManualControls project={sampleProject} selectedRange={{ start: 12, end: 18 }} onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete zoom" }));

    const [project, command] = onApply.mock.calls[0] ?? [];
    expect(command.label).toBe("Remove zoom");
    expect(project.zooms).toHaveLength(0);
  });

  it("preserves the selected zoom target when updating a later zoom", () => {
    const onApply = vi.fn();
    const target = { x: 120, y: 90, width: 640, height: 360 };
    const project = {
      ...sampleProject,
      zooms: [
        { ...sampleProject.zooms[0], id: "zoom_first", target: { x: 800, y: 400, width: 500, height: 300 } },
        { ...sampleProject.zooms[0], id: "zoom_second", target, start: 20, end: 25 },
      ],
    };

    render(<EditorManualControls project={project} selectedRange={{ start: 21, end: 24 }} onApply={onApply} />);
    fireEvent.change(screen.getByLabelText("Zoom"), { target: { value: "zoom_second" } });
    fireEvent.click(screen.getByRole("button", { name: "Update zoom" }));

    const [updatedProject] = onApply.mock.calls[0] ?? [];
    expect(updatedProject.zooms[1]).toEqual(expect.objectContaining({ target }));
  });

  it("resets selected entity ids when the project no longer contains them", () => {
    const onApply = vi.fn();
    const { rerender } = render(
      <EditorManualControls project={sampleProject} selectedRange={{ start: 12, end: 18 }} onApply={onApply} />,
    );

    rerender(
      <EditorManualControls
        project={{ ...sampleProject, zooms: [] }}
        selectedRange={{ start: 12, end: 18 }}
        onApply={onApply}
      />,
    );

    expect(screen.getByRole("button", { name: "Update zoom" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete zoom" })).toBeDisabled();
    expect(screen.queryByLabelText("Caption text")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Callout text")).not.toBeInTheDocument();
  });
});
