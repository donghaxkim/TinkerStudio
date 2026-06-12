import { fireEvent, render, screen } from "@testing-library/react";
import { DemoProjectSchema } from "@tinker/project-schema";
import type { SelectedEntity } from "@tinker/editor";
import { describe, expect, it, vi } from "vitest";
import sampleProjectInput from "../../../../../packages/project-schema/fixtures/demo-project.sample.json";
import { EditorManualControls } from "./EditorManualControls.js";

const sampleProject = DemoProjectSchema.parse(sampleProjectInput);

describe("EditorManualControls", () => {
  it("clicking a zoom rowcard selects that zoom", () => {
    const onSelectEntity = vi.fn();

    render(
      <EditorManualControls
        project={sampleProject}
        onSelectEntity={onSelectEntity}
        onApply={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Zoom 1" }));

    expect(onSelectEntity).toHaveBeenCalledWith({ type: "zoom", id: "zoom_001" });
  });

  it("shows the selected zoom's fields and applies an edit on Update zoom", () => {
    const onApply = vi.fn();
    const selected: SelectedEntity = { type: "zoom", id: "zoom_001" };

    render(
      <EditorManualControls
        project={sampleProject}
        selectedEntity={selected}
        onSelectEntity={vi.fn()}
        onApply={onApply}
      />,
    );

    // Fields are prefilled from the zoom.
    expect(screen.getByLabelText("Zoom start")).toHaveValue(12);
    expect(screen.getByLabelText("Zoom end")).toHaveValue(18);

    // Edit the end + target width, then update.
    fireEvent.change(screen.getByLabelText("Zoom end"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Zoom target width"), { target: { value: "700" } });
    fireEvent.click(screen.getByRole("button", { name: "Update zoom" }));

    expect(onApply).toHaveBeenCalledTimes(1);
    const [updatedProject, command] = onApply.mock.calls[0] ?? [];
    expect(command.label).toBe("Edit zoom");
    expect(updatedProject.zooms[0]).toEqual(
      expect.objectContaining({ id: "zoom_001", end: 20, target: expect.objectContaining({ width: 700 }) }),
    );
  });

  it("shows the selected clip's fields and applies an edit on Trim clip", () => {
    const onApply = vi.fn();
    const selected: SelectedEntity = { type: "clip", id: "clip_capture_001" };

    render(
      <EditorManualControls
        project={sampleProject}
        selectedEntity={selected}
        onSelectEntity={vi.fn()}
        onApply={onApply}
      />,
    );

    expect(screen.getByLabelText("Clip start")).toHaveValue(0);
    expect(screen.getByLabelText("Clip end")).toHaveValue(45);

    fireEvent.change(screen.getByLabelText("Clip start"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Clip end"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Trim clip" }));

    expect(onApply).toHaveBeenCalledTimes(1);
    const [updatedProject, command] = onApply.mock.calls[0] ?? [];
    expect(command.label).toBe("Trim clip");
    expect(updatedProject.tracks[0]?.clips[0]).toEqual(
      expect.objectContaining({ id: "clip_capture_001", start: 2, end: 30 }),
    );
  });

  it("surfaces a structured error for invalid values without applying", () => {
    const onApply = vi.fn();
    const selected: SelectedEntity = { type: "zoom", id: "zoom_001" };

    render(
      <EditorManualControls
        project={sampleProject}
        selectedEntity={selected}
        onSelectEntity={vi.fn()}
        onApply={onApply}
      />,
    );

    // end <= start is invalid.
    fireEvent.change(screen.getByLabelText("Zoom end"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Update zoom" }));

    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("surfaces a structured source-bounds error for an out-of-range clip trim", () => {
    const onApply = vi.fn();
    const selected: SelectedEntity = { type: "clip", id: "clip_capture_001" };

    render(
      <EditorManualControls
        project={sampleProject}
        selectedEntity={selected}
        onSelectEntity={vi.fn()}
        onApply={onApply}
      />,
    );

    // sourceEnd 50 exceeds the asset's 45s duration.
    fireEvent.change(screen.getByLabelText("Clip source end"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Trim clip" }));

    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/asset/i);
  });

  it("deletes the selected zoom and clears the selection", () => {
    const onApply = vi.fn();
    const onSelectEntity = vi.fn();
    const selected: SelectedEntity = { type: "zoom", id: "zoom_001" };

    render(
      <EditorManualControls
        project={sampleProject}
        selectedEntity={selected}
        onSelectEntity={onSelectEntity}
        onApply={onApply}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete zoom" }));

    const [updatedProject, command] = onApply.mock.calls[0] ?? [];
    expect(command.label).toBe("Remove zoom");
    expect(updatedProject.zooms).toHaveLength(0);
    expect(onSelectEntity).toHaveBeenCalledWith(undefined);
  });

  it("adds a zoom over the selected range", () => {
    const onApply = vi.fn();

    render(
      <EditorManualControls
        project={sampleProject}
        selectedRange={{ start: 6, end: 9 }}
        onSelectEntity={vi.fn()}
        onApply={onApply}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add zoom" }));

    expect(onApply).toHaveBeenCalledTimes(1);
    const [updatedProject, command] = onApply.mock.calls[0] ?? [];
    expect(command.label).toBe("Add zoom");
    expect(updatedProject.zooms.at(-1)).toEqual(expect.objectContaining({ start: 6, end: 9 }));
  });

  it("shows a calm hint when nothing is selected", () => {
    render(<EditorManualControls project={sampleProject} onSelectEntity={vi.fn()} onApply={vi.fn()} />);

    expect(screen.getByText(/Select a clip or zoom/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Update zoom" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Trim clip" })).not.toBeInTheDocument();
  });
});
