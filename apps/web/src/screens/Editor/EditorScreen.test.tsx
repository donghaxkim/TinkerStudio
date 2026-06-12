import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CursorEvent, DemoProject } from "@tinker/project-schema";
import { sampleProject } from "../../../../../packages/editor/src/test/sampleProject.js";
import { EditorScreen } from "./EditorScreen.js";

function dwellProject(): DemoProject {
  const cursorEvents: CursorEvent[] = [
    { time: 3, type: "move", x: 420, y: 310 },
    { time: 3.4, type: "move", x: 422, y: 312 },
    { time: 3.8, type: "move", x: 421, y: 311 },
  ];

  return {
    ...sampleProject,
    zooms: [],
    cursorEvents,
  };
}

/** Switch the right-hand panel to a named tab. */
function openTab(name: "Chat" | "Zoom" | "Speed" | "Cursor" | "Frame") {
  fireEvent.click(screen.getByRole("tab", { name }));
}

describe("EditorScreen", () => {
  describe("auto zoom + AI preview wiring", () => {
    it("accepts auto zoom suggestions as one undoable command", () => {
      render(<EditorScreen initialProject={dwellProject()} />);

      expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();

      fireEvent.click(screen.getByRole("button", { name: "Suggest zooms" }));
      expect(screen.getByText(/1 proposed zoom/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Accept all suggestions" }));
      expect(screen.getByRole("button", { name: "Undo" })).not.toBeDisabled();

      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();

      fireEvent.click(screen.getByRole("button", { name: "Suggest zooms" }));
      expect(screen.getByText(/1 proposed zoom/i)).toBeInTheDocument();
    });

    it("hands the preview from auto zoom to an AI edit (banner reflects the active source)", async () => {
      render(<EditorScreen initialProject={dwellProject()} />);

      fireEvent.click(screen.getByRole("button", { name: "Suggest zooms" }));
      expect(screen.getByText(/1 proposed zoom/i)).toBeInTheDocument();
      expect(screen.getByText(/previewing proposed auto-zoom edit/i)).toBeInTheDocument();

      // AI takes over the shared preview slot.
      openTab("Chat");
      fireEvent.click(screen.getByRole("button", { name: "Generate mock proposal" }));

      expect(await screen.findByText(/previewing proposed AI edit/i)).toBeInTheDocument();
      expect(screen.queryByText(/previewing proposed auto-zoom edit/i)).not.toBeInTheDocument();

      // Returning to the Zoom tab, the stale auto-zoom suggestion is gone.
      openTab("Zoom");
      expect(screen.queryByText(/1 proposed zoom/i)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Accept all suggestions" })).toBeDisabled();
    });

    it("hands the preview from an AI edit to auto zoom (banner reflects the active source)", async () => {
      render(<EditorScreen initialProject={dwellProject()} />);

      openTab("Chat");
      fireEvent.click(screen.getByRole("button", { name: "Generate mock proposal" }));
      expect(await screen.findByRole("button", { name: "Accept edit" })).toBeInTheDocument();
      expect(screen.getByText(/previewing proposed AI edit/i)).toBeInTheDocument();

      // Auto zoom takes over the shared preview slot.
      openTab("Zoom");
      fireEvent.click(screen.getByRole("button", { name: "Suggest zooms" }));

      expect(screen.getByText(/1 proposed zoom/i)).toBeInTheDocument();
      expect(screen.getByText(/previewing proposed auto-zoom edit/i)).toBeInTheDocument();
      expect(screen.queryByText(/previewing proposed AI edit/i)).not.toBeInTheDocument();
    });
  });

  describe("top app bar", () => {
    it("renders the brand, project slug, Settings, Preview and Export controls", () => {
      const onOpenSettings = vi.fn();
      const onExitToCreate = vi.fn();
      render(<EditorScreen initialProject={sampleProject} onOpenSettings={onOpenSettings} onExitToCreate={onExitToCreate} />);

      // Project title is the level-1 heading (identity for navigation).
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(sampleProject.title);

      // Brand doubles as the "back to New demo" affordance.
      fireEvent.click(screen.getByRole("button", { name: "New demo" }));
      expect(onExitToCreate).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole("button", { name: "Settings" }));
      expect(onOpenSettings).toHaveBeenCalledTimes(1);

      expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    });
  });

  describe("playback bar", () => {
    it("shows a play control and a timecode against the project duration", () => {
      render(<EditorScreen initialProject={sampleProject} />);

      expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
      // sampleProject duration is 45s → "0:45.0".
      expect(screen.getByLabelText("Timecode")).toHaveTextContent("0:00.0 / 0:45.0");
    });

    it("disables undo and redo until there is history", () => {
      render(<EditorScreen initialProject={dwellProject()} />);

      expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();

      // Accept an auto-zoom command to populate the undo stack.
      fireEvent.click(screen.getByRole("button", { name: "Suggest zooms" }));
      fireEvent.click(screen.getByRole("button", { name: "Accept all suggestions" }));

      expect(screen.getByRole("button", { name: "Undo" })).not.toBeDisabled();
      expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();

      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      expect(screen.getByRole("button", { name: "Redo" })).not.toBeDisabled();
    });

    it("renders Delete selection disabled with an accessible MVP reason", () => {
      render(<EditorScreen initialProject={sampleProject} />);

      const deleteButton = screen.getByRole("button", { name: /Delete selection/i });
      expect(deleteButton).toBeDisabled();
      expect(deleteButton).toHaveAccessibleName(/not available in the mvp/i);
    });
  });

  describe("tabbed right panel", () => {
    it("defaults to the Zoom tab and switches to the Chat assistant", () => {
      render(<EditorScreen initialProject={sampleProject} />);

      // Zoom tab content is visible by default.
      expect(screen.getByRole("button", { name: "Suggest zooms" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Generate mock proposal" })).not.toBeInTheDocument();

      openTab("Chat");
      expect(screen.getByRole("button", { name: "Generate mock proposal" })).toBeInTheDocument();

      openTab("Speed");
      expect(screen.getByText(/per-clip speed ramps/i)).toBeInTheDocument();

      openTab("Cursor");
      expect(screen.getByText(/cursor smoothing and click styling/i)).toBeInTheDocument();
    });
  });

  describe("AI preview banner", () => {
    it("shows the preview banner while an AI edit is being previewed", async () => {
      render(<EditorScreen initialProject={dwellProject()} />);

      expect(screen.queryByText(/previewing proposed/i)).not.toBeInTheDocument();

      openTab("Chat");
      fireEvent.click(screen.getByRole("button", { name: "Generate mock proposal" }));

      expect(await screen.findByText(/previewing proposed AI edit/i)).toBeInTheDocument();
    });
  });

  describe("project file actions", () => {
    it("keeps save/load and export reachable", () => {
      render(<EditorScreen initialProject={sampleProject} />);

      expect(screen.getByRole("button", { name: "Save project" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Load saved project" })).toBeInTheDocument();
      expect(screen.getByLabelText("Export")).toBeInTheDocument();
    });
  });
});
