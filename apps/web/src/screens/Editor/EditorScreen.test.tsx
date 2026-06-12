import { act, fireEvent, render, screen } from "@testing-library/react";
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

      expect(screen.getByRole("button", { name: "Preview (play)" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    });
  });

  describe("play/pause toggle", () => {
    it("toggles between Play and Pause accessible names on each click", () => {
      render(<EditorScreen initialProject={sampleProject} />);

      const playBtn = screen.getByRole("button", { name: "Play" });
      expect(playBtn).toBeInTheDocument();

      // First click → becomes Pause.
      fireEvent.click(playBtn);
      expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();

      // Second click → back to Play.
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
    });

    it("rAF loop advances currentTime when requestAnimationFrame is available", () => {
      // Mock requestAnimationFrame to capture the callback without auto-firing.
      let rafCallback: ((ts: number) => void) | null = null;
      const rafSpy = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
        rafCallback = cb;
        return 1;
      });
      const cafSpy = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});

      render(<EditorScreen initialProject={sampleProject} />);

      // Start playing.
      fireEvent.click(screen.getByRole("button", { name: "Play" }));

      // Simulate first frame at t=0 (sets lastFrameTimeRef) — wrapped in act so state updates flush.
      act(() => {
        rafCallback?.(0);
      });
      // Simulate second frame at t=500ms → should advance 0.5s.
      act(() => {
        rafCallback?.(500);
      });

      // currentTime should have advanced by exactly 0.5s (500ms frame delta).
      expect(screen.getByLabelText("Timecode")).toHaveTextContent("0:00.5 / 0:45.0");

      rafSpy.mockRestore();
      cafSpy.mockRestore();
    });
  });

  describe("Export top-bar button", () => {
    it("reveals the export panel when clicked", () => {
      render(<EditorScreen initialProject={sampleProject} />);

      // There are two elements with aria-label "Export": the button and the section.
      // Find the <section> (the export panel proper).
      const exportSection = screen
        .getAllByLabelText("Export")
        .find((el) => el.tagName === "SECTION");
      expect(exportSection).not.toBeUndefined();

      const detailsEl = exportSection!.closest("details");
      expect(detailsEl).not.toBeNull();
      expect(detailsEl).not.toHaveAttribute("open");

      // Click the top-bar Export button.
      fireEvent.click(screen.getByRole("button", { name: "Export" }));

      // Now the <details> is open.
      expect(detailsEl).toHaveAttribute("open");
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

    it("renders Delete selection disabled with an accessible reason when nothing is selected", () => {
      render(<EditorScreen initialProject={sampleProject} />);

      const deleteButton = screen.getByRole("button", { name: /Delete selection/i });
      expect(deleteButton).toBeDisabled();
      expect(deleteButton).toHaveAccessibleName(/select a zoom to delete it/i);
    });
  });

  describe("item-aware manual editing", () => {
    it("selecting a timeline item routes that item into the manual controls", () => {
      render(<EditorScreen initialProject={sampleProject} />);

      // Nothing selected → calm hint, no zoom editor fields.
      expect(screen.queryByLabelText("Zoom start")).not.toBeInTheDocument();

      // Click the zoom bar in the timeline.
      fireEvent.click(screen.getByRole("button", { name: "zoom: Zoom 1" }));

      // The Zoom-tab manual controls now show that exact zoom's fields.
      expect(screen.getByLabelText("Zoom start")).toHaveValue(12);
      expect(screen.getByLabelText("Zoom end")).toHaveValue(18);
    });

    it("enables Delete selection for a selected zoom and deletes it undoably", () => {
      render(<EditorScreen initialProject={sampleProject} />);

      // Select the zoom from the timeline.
      fireEvent.click(screen.getByRole("button", { name: "zoom: Zoom 1" }));

      const deleteButton = screen.getByRole("button", { name: /Delete selection/i });
      expect(deleteButton).not.toBeDisabled();

      // Delete it — the zoom rowcard disappears and undo becomes available.
      fireEvent.click(deleteButton);
      expect(screen.queryByRole("button", { name: "zoom: Zoom 1" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Undo" })).not.toBeDisabled();

      // Undo restores the zoom.
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      expect(screen.getByRole("button", { name: "zoom: Zoom 1" })).toBeInTheDocument();

      // Redo removes it again.
      fireEvent.click(screen.getByRole("button", { name: "Redo" }));
      expect(screen.queryByRole("button", { name: "zoom: Zoom 1" })).not.toBeInTheDocument();
    });

    it("keeps Delete selection disabled for a selected clip with an accessible reason", () => {
      render(<EditorScreen initialProject={sampleProject} />);

      fireEvent.click(screen.getByRole("button", { name: "clip: Browser flow" }));

      const deleteButton = screen.getByRole("button", { name: /Delete selection/i });
      expect(deleteButton).toBeDisabled();
      expect(deleteButton).toHaveAccessibleName(/clip deletion is not available in the mvp/i);
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

    it("shows only the active tab's panel — inactive panels are hidden, not stacked", () => {
      render(<EditorScreen initialProject={sampleProject} />);

      // Default is the Zoom tab: its content is visible; the other panels' content
      // exists in the DOM (panels stay mounted) but must NOT be visible.
      // (getByText finds elements regardless of visibility; toBeVisible respects hidden/display:none.)
      expect(screen.getByText("Suggest zooms")).toBeVisible();
      expect(screen.getByText(/per-clip speed ramps/i)).not.toBeVisible();
      expect(screen.getByText(/cursor smoothing and click styling/i)).not.toBeVisible();
      expect(screen.getByText(/background and framing controls/i)).not.toBeVisible();

      // Switching to Speed reveals Speed and hides Zoom + the others.
      openTab("Speed");
      expect(screen.getByText(/per-clip speed ramps/i)).toBeVisible();
      expect(screen.getByText("Suggest zooms")).not.toBeVisible();
      expect(screen.getByText(/cursor smoothing and click styling/i)).not.toBeVisible();
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
      // The Export section (aria-label="Export") must be reachable.
      expect(screen.getAllByLabelText("Export").some((el) => el.tagName === "SECTION")).toBe(true);
    });
  });
});
