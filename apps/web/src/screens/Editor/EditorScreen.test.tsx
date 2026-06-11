import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

describe("EditorScreen", () => {
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

  it("clears stale auto zoom suggestions when AI takes over preview", async () => {
    render(<EditorScreen initialProject={dwellProject()} />);

    fireEvent.click(screen.getByRole("button", { name: "Suggest zooms" }));
    expect(screen.getByText(/1 proposed zoom/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Generate mock proposal" }));

    await waitFor(() => {
      expect(screen.queryByText(/1 proposed zoom/i)).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Accept all suggestions" })).toBeDisabled();
  });

  it("clears stale AI proposals when auto zoom takes over preview", async () => {
    render(<EditorScreen initialProject={dwellProject()} />);

    fireEvent.click(screen.getByRole("button", { name: "Generate mock proposal" }));
    expect(await screen.findByRole("button", { name: "Accept edit" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Suggest zooms" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Accept edit" })).not.toBeInTheDocument();
    });
    expect(screen.getByText(/1 proposed zoom/i)).toBeInTheDocument();
  });
});
