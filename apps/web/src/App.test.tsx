import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";

// Helper: fill and submit the Create Demo form with valid values
function fillAndSubmitCreateDemoForm() {
  fireEvent.change(screen.getByLabelText("GitHub repo URL"), {
    target: { value: "https://github.com/example/product" },
  });
  fireEvent.change(screen.getByLabelText("Product or local app URL"), {
    target: { value: "http://localhost:5173" },
  });
  fireEvent.change(screen.getByLabelText("Demo prompt"), {
    target: { value: "Show the analytics workflow" },
  });
  fireEvent.change(screen.getByLabelText("Duration cap"), {
    target: { value: "60" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create demo" }));
}

describe("App shell state machine", () => {
  it("initial render shows Create Demo screen (not just 'Tinker')", () => {
    render(<App />);

    // The create demo section should be visible
    expect(screen.getByLabelText("Create demo")).toBeInTheDocument();
    // The editor and settings should NOT be visible at start
    expect(screen.queryByLabelText("Project persistence")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Settings")).not.toBeInTheDocument();
  });

  it("successful mock generation transitions to Editor with Save/Export panels visible", async () => {
    render(<App />);

    fillAndSubmitCreateDemoForm();

    // Wait for generation to succeed and editor to appear
    await waitFor(() => {
      expect(screen.queryByLabelText("Create demo")).not.toBeInTheDocument();
    });

    // EditorScreen should be visible — check for its characteristic panels
    expect(screen.getByLabelText("Project persistence")).toBeInTheDocument();
    expect(screen.getByLabelText("Export")).toBeInTheDocument();
  });

  it("'use sample project' path opens the Editor", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Use sample project" }));

    await waitFor(() => {
      expect(screen.queryByLabelText("Create demo")).not.toBeInTheDocument();
    });

    expect(screen.getByLabelText("Project persistence")).toBeInTheDocument();
    expect(screen.getByLabelText("Export")).toBeInTheDocument();
  });

  it("opening Settings from Editor shows Settings; closing returns to Editor", async () => {
    render(<App />);

    // Get to Editor via sample project
    fireEvent.click(screen.getByRole("button", { name: "Use sample project" }));
    await waitFor(() => {
      expect(screen.queryByLabelText("Create demo")).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText("Project persistence")).toBeInTheDocument();

    // Open Settings
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByLabelText("Settings")).toBeInTheDocument();
    expect(screen.queryByLabelText("Project persistence")).not.toBeInTheDocument();

    // Close Settings returns to Editor
    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    expect(screen.queryByLabelText("Settings")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Project persistence")).toBeInTheDocument();
  });

  it("'Return to editor' button is absent before any project exists", () => {
    render(<App />);

    // On the initial Create route with no project yet, the button must not exist
    expect(screen.queryByRole("button", { name: "Return to editor" })).not.toBeInTheDocument();
  });

  it("returning from Editor to Create Demo preserves the in-progress project (identity check via title)", async () => {
    render(<App />);

    // Step 1: Drive a successful mock generation to open the Editor with a real project
    fillAndSubmitCreateDemoForm();
    await waitFor(() => {
      expect(screen.queryByLabelText("Create demo")).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText("Project persistence")).toBeInTheDocument();

    // Step 2: Capture the project title as shown in the Editor's <h1>
    const generatedTitle = screen.getByRole("heading", { level: 1 }).textContent;
    expect(generatedTitle).toBeTruthy();

    // Step 3: Click "New demo" to return to the Create route
    fireEvent.click(screen.getByRole("button", { name: "New demo" }));
    expect(screen.getByLabelText("Create demo")).toBeInTheDocument();
    expect(screen.queryByLabelText("Project persistence")).not.toBeInTheDocument();

    // Step 4: "Return to editor" button must now be visible (project is still in state)
    const returnBtn = screen.getByRole("button", { name: "Return to editor" });
    expect(returnBtn).toBeInTheDocument();

    // Step 5: Click "Return to editor" — must NOT load the sample or replace the project
    fireEvent.click(returnBtn);
    await waitFor(() => {
      expect(screen.queryByLabelText("Create demo")).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText("Project persistence")).toBeInTheDocument();

    // Step 6: Assert the Editor shows the same project (same title — project was NOT replaced)
    const titleAfterReturn = screen.getByRole("heading", { level: 1 }).textContent;
    expect(titleAfterReturn).toBe(generatedTitle);
  });
});
