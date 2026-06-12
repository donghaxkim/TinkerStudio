import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CursorEvent, DemoProject } from "@tinker/project-schema";
import { serializeDemoProject } from "@tinker/editor";
import { sampleProject } from "../../../../../packages/editor/src/test/sampleProject.js";
import { LOCAL_PROJECT_STORAGE_KEY, saveProjectToStorage } from "../../lib/projectStorage.js";
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

/** Open the project file overlay via the "Project file" button. */
function openFilesPanel() {
  fireEvent.click(screen.getByRole("button", { name: "Project file" }));
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
    it("reveals the export panel overlay when clicked", () => {
      render(<EditorScreen initialProject={sampleProject} />);

      // Before clicking, no dialog should be present.
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      // Click the top-bar Export button.
      fireEvent.click(screen.getByRole("button", { name: "Export" }));

      // A dialog overlay should now be present.
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      // The preview region must still be present (not collapsed).
      expect(screen.getByRole("region", { name: "Preview stage" })).toBeInTheDocument();
    });

    it("closes the overlay via the close button", () => {
      render(<EditorScreen initialProject={sampleProject} />);

      fireEvent.click(screen.getByRole("button", { name: "Export" }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Close project file panel" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("preview stage is not collapsed when overlay is open", () => {
      render(<EditorScreen initialProject={sampleProject} />);

      fireEvent.click(screen.getByRole("button", { name: "Export" }));

      // The preview region must still be in the document with its aria-label.
      expect(screen.getByRole("region", { name: "Preview stage" })).toBeInTheDocument();
      // The overlay has role="dialog".
      expect(screen.getByRole("dialog", { name: /project file/i })).toBeInTheDocument();
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

    it("trim-clip is undoable: trimming a clip enables Undo; undoing restores the original bounds", () => {
      render(<EditorScreen initialProject={sampleProject} />);

      // Select the clip from the timeline.
      fireEvent.click(screen.getByRole("button", { name: "clip: Browser flow" }));

      // Clip editor fields should show the original bounds (start=0, end=45).
      expect(screen.getByLabelText("Clip start")).toHaveValue(0);
      expect(screen.getByLabelText("Clip end")).toHaveValue(45);

      // Trim to [2, 40].
      fireEvent.change(screen.getByLabelText("Clip start"), { target: { value: "2" } });
      fireEvent.change(screen.getByLabelText("Clip end"), { target: { value: "40" } });
      fireEvent.click(screen.getByRole("button", { name: "Trim clip" }));

      // Undo should now be enabled.
      expect(screen.getByRole("button", { name: "Undo" })).not.toBeDisabled();

      // Undo the trim — fields should revert to the original bounds.
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      expect(screen.getByLabelText("Clip start")).toHaveValue(0);
      expect(screen.getByLabelText("Clip end")).toHaveValue(45);

      // Undo stack is now empty again.
      expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
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
      expect(screen.getByRole("checkbox", { name: "Show cursor" })).toBeInTheDocument();
    });

    it("shows only the active tab's panel — inactive panels are hidden, not stacked", () => {
      render(<EditorScreen initialProject={sampleProject} />);

      // Default is the Zoom tab: its content is visible; the other panels' content
      // exists in the DOM (panels stay mounted) but must NOT be visible.
      // (getByText finds elements regardless of visibility; toBeVisible respects hidden/display:none.)
      expect(screen.getByText("Suggest zooms")).toBeVisible();
      expect(screen.getByText(/per-clip speed ramps/i)).not.toBeVisible();
      // The Cursor panel stays mounted but hidden (so getByRole needs hidden:true).
      expect(screen.getByRole("checkbox", { name: "Show cursor", hidden: true })).not.toBeVisible();
      expect(screen.getByText(/background and framing controls/i)).not.toBeVisible();

      // Switching to Speed reveals Speed and hides Zoom + the others.
      openTab("Speed");
      expect(screen.getByText(/per-clip speed ramps/i)).toBeVisible();
      expect(screen.getByText("Suggest zooms")).not.toBeVisible();
      expect(screen.getByRole("checkbox", { name: "Show cursor", hidden: true })).not.toBeVisible();
    });
  });

  describe("Cursor tab controls (PB-006)", () => {
    /** A project whose cursor sits on-screen from t=0 so the preview overlay is observable. */
    function cursorAtStartProject(): DemoProject {
      return {
        ...sampleProject,
        zooms: [],
        cursorEvents: [
          { time: 0, type: "move", x: 960, y: 540 },
          { time: 1, type: "move", x: 960, y: 540 },
        ],
      };
    }

    it("toggling Show cursor off updates the setting and is undoable", () => {
      render(<EditorScreen initialProject={sampleProject} />);

      openTab("Cursor");
      const showCursor = screen.getByRole("checkbox", { name: "Show cursor" });
      expect(showCursor).toBeChecked();
      expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();

      // Hide the cursor.
      fireEvent.click(showCursor);
      expect(screen.getByRole("checkbox", { name: "Show cursor" })).not.toBeChecked();
      expect(screen.getByRole("button", { name: "Undo" })).not.toBeDisabled();

      // Undo restores the cursor visibility.
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      expect(screen.getByRole("checkbox", { name: "Show cursor" })).toBeChecked();
      expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();

      // Redo hides it again.
      fireEvent.click(screen.getByRole("button", { name: "Redo" }));
      expect(screen.getByRole("checkbox", { name: "Show cursor" })).not.toBeChecked();
    });

    it("hiding the cursor immediately removes the cursor overlay from the preview", () => {
      render(<EditorScreen initialProject={cursorAtStartProject()} />);

      // At t=0 the recorded cursor renders in the preview.
      expect(screen.getByTestId("active-cursor")).toBeInTheDocument();

      // Hide the cursor — the preview reflects the change immediately.
      openTab("Cursor");
      fireEvent.click(screen.getByRole("checkbox", { name: "Show cursor" }));

      expect(screen.queryByTestId("active-cursor")).not.toBeInTheDocument();
    });

    it("changing the click emphasis style updates the setting and is undoable", () => {
      render(<EditorScreen initialProject={sampleProject} />);

      openTab("Cursor");
      const ringRadio = screen.getByRole("radio", { name: "Click emphasis Ring" });
      const rippleRadio = screen.getByRole("radio", { name: "Click emphasis Ripple" });
      expect(ringRadio).toBeChecked();

      fireEvent.click(rippleRadio);
      expect(screen.getByRole("radio", { name: "Click emphasis Ripple" })).toBeChecked();
      expect(screen.getByRole("button", { name: "Undo" })).not.toBeDisabled();

      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      expect(screen.getByRole("radio", { name: "Click emphasis Ring" })).toBeChecked();
    });

    it("editing the click emphasis duration updates the setting and is undoable", () => {
      render(<EditorScreen initialProject={sampleProject} />);

      openTab("Cursor");
      const duration = screen.getByLabelText("Click emphasis duration in milliseconds");
      expect(duration).toHaveValue(500);

      fireEvent.change(duration, { target: { value: "900" } });
      expect(screen.getByLabelText("Click emphasis duration in milliseconds")).toHaveValue(900);
      expect(screen.getByRole("button", { name: "Undo" })).not.toBeDisabled();

      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      expect(screen.getByLabelText("Click emphasis duration in milliseconds")).toHaveValue(500);
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
    it("keeps save/load and export reachable via the overlay", () => {
      render(<EditorScreen initialProject={sampleProject} />);

      // Open the overlay (via Project file button or Export button).
      fireEvent.click(screen.getByRole("button", { name: "Project file" }));

      expect(screen.getByRole("button", { name: "Save project" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Load saved project" })).toBeInTheDocument();
      // The Export section (aria-label="Export") must be reachable inside the dialog.
      expect(screen.getAllByLabelText("Export").some((el) => el.tagName === "SECTION")).toBe(true);
    });
  });

  // ── PB-007: persistence state, dirty tracking, warn-before-replace ────────

  describe("persistence state display", () => {
    function getPersistenceStatus() {
      return screen.getByLabelText("Persistence status");
    }

    it("shows 'Generated' when projectOrigin='generated' and project is clean", () => {
      render(<EditorScreen initialProject={sampleProject} projectOrigin="generated" />);
      expect(getPersistenceStatus()).toHaveTextContent("Generated");
    });

    it("shows 'Sample project' when projectOrigin='sample' and project is clean", () => {
      render(<EditorScreen initialProject={sampleProject} projectOrigin="sample" />);
      expect(getPersistenceStatus()).toHaveTextContent("Sample project");
    });

    it("defaults to 'Generated' when projectOrigin prop is absent and initialProject is provided", () => {
      render(<EditorScreen initialProject={sampleProject} />);
      expect(getPersistenceStatus()).toHaveTextContent("Generated");
    });
  });

  describe("dirty tracking", () => {
    function getPersistenceStatus() {
      return screen.getByLabelText("Persistence status");
    }

    it("becomes dirty after accepting an auto-zoom suggestion", () => {
      render(<EditorScreen initialProject={dwellProject()} />);
      expect(getPersistenceStatus()).toHaveTextContent("Generated");

      fireEvent.click(screen.getByRole("button", { name: "Suggest zooms" }));
      fireEvent.click(screen.getByRole("button", { name: "Accept all suggestions" }));

      expect(getPersistenceStatus()).toHaveTextContent("Unsaved changes");
    });

    it("becomes dirty after a manual edit (delete zoom)", () => {
      render(<EditorScreen initialProject={sampleProject} />);

      // Select and delete the zoom — that is a manual edit
      fireEvent.click(screen.getByRole("button", { name: "zoom: Zoom 1" }));
      fireEvent.click(screen.getByRole("button", { name: /Delete selection/i }));

      expect(getPersistenceStatus()).toHaveTextContent("Unsaved changes");
    });

    it("becomes dirty after an undo", () => {
      render(<EditorScreen initialProject={dwellProject()} />);

      // Create something to undo.
      fireEvent.click(screen.getByRole("button", { name: "Suggest zooms" }));
      fireEvent.click(screen.getByRole("button", { name: "Accept all suggestions" }));

      // Save clears dirty (open overlay first)
      openFilesPanel();
      fireEvent.click(screen.getByRole("button", { name: "Save project" }));
      expect(getPersistenceStatus()).toHaveTextContent("Saved locally");

      // Undo makes it dirty again
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      expect(getPersistenceStatus()).toHaveTextContent("Unsaved changes");
    });

    it("becomes dirty after a redo", () => {
      render(<EditorScreen initialProject={dwellProject()} />);

      fireEvent.click(screen.getByRole("button", { name: "Suggest zooms" }));
      fireEvent.click(screen.getByRole("button", { name: "Accept all suggestions" }));
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));

      // Save clears dirty (open overlay first)
      openFilesPanel();
      fireEvent.click(screen.getByRole("button", { name: "Save project" }));
      expect(getPersistenceStatus()).toHaveTextContent("Saved locally");

      fireEvent.click(screen.getByRole("button", { name: "Redo" }));
      expect(getPersistenceStatus()).toHaveTextContent("Unsaved changes");
    });

    it("shows 'Saved locally' and clears dirty after saving", () => {
      render(<EditorScreen initialProject={dwellProject()} />);

      // Make it dirty
      fireEvent.click(screen.getByRole("button", { name: "Suggest zooms" }));
      fireEvent.click(screen.getByRole("button", { name: "Accept all suggestions" }));
      expect(getPersistenceStatus()).toHaveTextContent("Unsaved changes");

      // Save (open overlay first)
      openFilesPanel();
      fireEvent.click(screen.getByRole("button", { name: "Save project" }));
      expect(getPersistenceStatus()).toHaveTextContent("Saved locally");
    });
  });

  describe("history reset on project replacement (import path)", () => {
    beforeEach(() => {
      window.localStorage.clear();
    });

    it("resets undo/redo history when a project is loaded from storage (clean project)", () => {
      // Start with sampleProject (clean, no history), create history via suggest+accept,
      // then save the project so it's no longer dirty, then load from storage.
      render(<EditorScreen initialProject={dwellProject()} />);

      // Create undo history
      fireEvent.click(screen.getByRole("button", { name: "Suggest zooms" }));
      fireEvent.click(screen.getByRole("button", { name: "Accept all suggestions" }));
      expect(screen.getByRole("button", { name: "Undo" })).not.toBeDisabled();

      // Save the current project (clears dirty) so "Load saved project" doesn't trigger confirm
      openFilesPanel();
      fireEvent.click(screen.getByRole("button", { name: "Save project" }));
      expect(screen.getByLabelText("Persistence status")).toHaveTextContent("Saved locally");

      // Now load a different project from storage (the one we just saved);
      // since dirty=false, it loads immediately
      fireEvent.click(screen.getByRole("button", { name: "Load saved project" }));

      // History must be reset
      expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
    });

    it("clears dirty and sets origin='saved' after loading from storage (via confirm)", () => {
      render(<EditorScreen initialProject={dwellProject()} projectOrigin="generated" />);
      const status = screen.getByLabelText("Persistence status");

      // Make dirty
      fireEvent.click(screen.getByRole("button", { name: "Suggest zooms" }));
      fireEvent.click(screen.getByRole("button", { name: "Accept all suggestions" }));
      expect(status).toHaveTextContent("Unsaved changes");

      // Store a project and then try to load — dirty triggers confirm
      saveProjectToStorage(sampleProject);
      // Open overlay to access the Load button
      openFilesPanel();
      fireEvent.click(screen.getByRole("button", { name: "Load saved project" }));
      expect(screen.getByRole("alertdialog", { name: "You have unsaved changes — replace anyway?" })).toBeInTheDocument();

      // Confirm the replace
      fireEvent.click(screen.getByRole("button", { name: "Replace" }));

      expect(status).toHaveTextContent("Saved locally");
    });
  });

  describe("warn-before-replace in EditorScreen (dirty + import)", () => {
    beforeEach(() => {
      window.localStorage.clear();
    });

    it("shows inline confirm when loading from storage while dirty", () => {
      render(<EditorScreen initialProject={dwellProject()} />);

      // Make dirty
      fireEvent.click(screen.getByRole("button", { name: "Suggest zooms" }));
      fireEvent.click(screen.getByRole("button", { name: "Accept all suggestions" }));

      // Attempt to load without saving (open overlay first)
      saveProjectToStorage(sampleProject);
      openFilesPanel();
      fireEvent.click(screen.getByRole("button", { name: "Load saved project" }));

      expect(screen.getByRole("alertdialog", { name: "You have unsaved changes — replace anyway?" })).toBeInTheDocument();
      // Project is not yet replaced — undo still enabled
      expect(screen.getByRole("button", { name: "Undo" })).not.toBeDisabled();
    });

    it("Cancel preserves the dirty project", () => {
      render(<EditorScreen initialProject={dwellProject()} />);

      fireEvent.click(screen.getByRole("button", { name: "Suggest zooms" }));
      fireEvent.click(screen.getByRole("button", { name: "Accept all suggestions" }));
      expect(screen.getByLabelText("Persistence status")).toHaveTextContent("Unsaved changes");

      saveProjectToStorage(sampleProject);
      openFilesPanel();
      fireEvent.click(screen.getByRole("button", { name: "Load saved project" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("alertdialog", { name: "You have unsaved changes — replace anyway?" })).not.toBeInTheDocument();
      expect(screen.getByLabelText("Persistence status")).toHaveTextContent("Unsaved changes");
      // Undo still works — project was not replaced
      expect(screen.getByRole("button", { name: "Undo" })).not.toBeDisabled();
    });

    it("Replace confirmed replaces project, resets history, clears dirty", () => {
      render(<EditorScreen initialProject={dwellProject()} />);

      fireEvent.click(screen.getByRole("button", { name: "Suggest zooms" }));
      fireEvent.click(screen.getByRole("button", { name: "Accept all suggestions" }));

      saveProjectToStorage(sampleProject);
      openFilesPanel();
      fireEvent.click(screen.getByRole("button", { name: "Load saved project" }));
      fireEvent.click(screen.getByRole("button", { name: "Replace" }));

      expect(screen.queryByRole("alertdialog", { name: "You have unsaved changes — replace anyway?" })).not.toBeInTheDocument();
      expect(screen.getByLabelText("Persistence status")).toHaveTextContent("Saved locally");
      expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    });
  });

  // ── PB-008: export UX integration ─────────────────────────────────────────

  describe("export UX (PB-008)", () => {
    function openExportPanel() {
      // Open the overlay via the top-bar Export button.
      fireEvent.click(screen.getByRole("button", { name: "Export" }));
    }

    function openFilesOverlay() {
      // Open via Project file button (does NOT start a job).
      fireEvent.click(screen.getByRole("button", { name: "Project file" }));
    }

    it("shows the Start export button in the export panel (via Project file overlay)", () => {
      render(<EditorScreen initialProject={sampleProject} />);
      openFilesOverlay();

      expect(screen.getByRole("button", { name: "Start export" })).toBeInTheDocument();
    });

    it("top-bar Export button starts a preflight and transitions to succeeded", () => {
      render(<EditorScreen initialProject={sampleProject} />);
      // Clicking the top-bar Export button opens the panel AND starts the export job.
      fireEvent.click(screen.getByRole("button", { name: "Export" }));

      // After the sync preflight the job status block should show Succeeded.
      expect(screen.getByRole("status", { name: "Export job status" })).toBeInTheDocument();
      expect(screen.getByText("Succeeded")).toBeInTheDocument();
    });

    it("shows the artifact summary after a successful preflight", () => {
      render(<EditorScreen initialProject={sampleProject} />);
      fireEvent.click(screen.getByRole("button", { name: "Export" }));

      expect(screen.getByLabelText("Artifact summary")).toBeInTheDocument();
      expect(screen.getByLabelText("Local render command")).toBeInTheDocument();
      expect(screen.getByText(/render:sample/)).toBeInTheDocument();
    });

    it("shows honest copy — does not claim the browser wrote an MP4", () => {
      render(<EditorScreen initialProject={sampleProject} />);
      fireEvent.click(screen.getByRole("button", { name: "Export" }));

      expect(screen.getByText(/preflight validated/i)).toBeInTheDocument();
      expect(screen.getByText(/browser does not write the file/i)).toBeInTheDocument();
    });

    it("Start export button in the panel also starts the job", () => {
      render(<EditorScreen initialProject={sampleProject} />);
      openFilesOverlay();

      // Panel Start export button (not the top-bar one) starts the job.
      fireEvent.click(screen.getByRole("button", { name: "Start export" }));

      expect(screen.getByRole("status", { name: "Export job status" })).toBeInTheDocument();
      expect(screen.getByText("Succeeded")).toBeInTheDocument();
    });

    it("duplicate-start prevention: clicking Export again while a job is terminal re-runs (new job)", () => {
      render(<EditorScreen initialProject={sampleProject} />);

      // First export.
      fireEvent.click(screen.getByRole("button", { name: "Export" }));
      expect(screen.getByText("Succeeded")).toBeInTheDocument();

      // Second Export click — should re-run (terminal state allows re-start).
      fireEvent.click(screen.getByRole("button", { name: "Export" }));
      expect(screen.getByText("Succeeded")).toBeInTheDocument();
    });

    it("re-enables Start export button after a succeeded job", () => {
      render(<EditorScreen initialProject={sampleProject} />);
      openFilesOverlay();

      fireEvent.click(screen.getByRole("button", { name: "Start export" }));
      // After preflight (sync) the job is terminal — button must be re-enabled.
      expect(screen.getByRole("button", { name: "Start export" })).not.toBeDisabled();
    });
  });
});
