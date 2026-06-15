import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

// Helper: fill and submit the Create Demo composer with valid values.
// Requires fake timers to be active (for repo verification delay).
// After calling, you still need to flush async (flushAsync()) then
// click "Record & open in editor" to reach the Editor.
async function fillAndSubmitCreateDemoComposer() {
  // Enter a valid repo URL and advance timers past the 1100ms verification delay
  fireEvent.change(screen.getByLabelText("GitHub repo URL"), {
    target: { value: "github.com/example/product" },
  });
  await act(async () => {
    vi.advanceTimersByTime(1200);
  });

  // Type a prompt
  fireEvent.change(screen.getByLabelText("Demo prompt"), {
    target: { value: "Show the analytics workflow" },
  });

  // Click send
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
  });
}

// Flush pending microtasks after an async operation
async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("App shell state machine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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

    await fillAndSubmitCreateDemoComposer();
    await flushAsync();

    // Wait for generation to succeed — storyboard card appears
    expect(screen.getByText("Record & open in editor")).toBeInTheDocument();

    // Click "Record & open in editor" to open the editor
    await act(async () => {
      fireEvent.click(screen.getByText("Record & open in editor"));
    });

    expect(screen.queryByLabelText("Create demo")).not.toBeInTheDocument();
    // Open the project file overlay to access save/load and export
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(screen.getByLabelText("Project persistence")).toBeInTheDocument();
    // The Export section (aria-label="Export") must be reachable inside the overlay.
    expect(screen.getAllByLabelText("Export").some((el) => el.tagName === "SECTION")).toBe(true);
  });

  it("'use sample project' path opens the Editor", async () => {
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByText("or start from a sample project"));
    });

    expect(screen.queryByLabelText("Create demo")).not.toBeInTheDocument();
    // Open the project file overlay to access save/load and export
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(screen.getByLabelText("Project persistence")).toBeInTheDocument();
    // The Export section (aria-label="Export") must be reachable inside the overlay.
    expect(screen.getAllByLabelText("Export").some((el) => el.tagName === "SECTION")).toBe(true);
  });

  it("opening Settings from Editor shows Settings; closing returns to Editor", async () => {
    render(<App />);

    // Get to Editor via sample project
    await act(async () => {
      fireEvent.click(screen.getByText("or start from a sample project"));
    });

    expect(screen.queryByLabelText("Create demo")).not.toBeInTheDocument();
    // Verify Project persistence is reachable via the overlay
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(screen.getByLabelText("Project persistence")).toBeInTheDocument();
    // Close overlay before testing Settings
    fireEvent.click(screen.getByRole("button", { name: "Close project file panel" }));

    // Open Settings
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    // SettingsScreen renders a Close settings button; Editor is gone
    expect(screen.getByRole("button", { name: "Close settings" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Project persistence")).not.toBeInTheDocument();

    // Close Settings returns to Editor
    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    expect(screen.queryByRole("button", { name: "Close settings" })).not.toBeInTheDocument();
    // Open overlay to verify Project persistence is reachable in the returned Editor
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(screen.getByLabelText("Project persistence")).toBeInTheDocument();
  });

  it("'Return to editor' button is absent before any project exists", () => {
    render(<App />);

    // On the initial Create route with no project yet, the button must not exist
    expect(screen.queryByText("Return to editor")).not.toBeInTheDocument();
  });

  it("returning from Editor to Create Demo preserves the in-progress project (identity check via title)", async () => {
    render(<App />);

    // Step 1: Drive a successful mock generation to open the Editor with a real project
    await fillAndSubmitCreateDemoComposer();
    await flushAsync();
    expect(screen.getByText("Record & open in editor")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("Record & open in editor"));
    });

    expect(screen.queryByLabelText("Create demo")).not.toBeInTheDocument();
    // Open overlay to verify Project persistence is accessible in the Editor
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(screen.getByLabelText("Project persistence")).toBeInTheDocument();
    // Close overlay so we can click the top bar freely
    fireEvent.click(screen.getByRole("button", { name: "Close project file panel" }));

    // Step 2: Capture the project title as shown in the Editor's <h1>
    const generatedTitle = screen.getByRole("heading", { level: 1 }).textContent;
    expect(generatedTitle).toBeTruthy();

    // Step 3: Click "New demo" to return to the Create route
    fireEvent.click(screen.getByRole("button", { name: "New demo" }));
    expect(screen.getByLabelText("Create demo")).toBeInTheDocument();
    expect(screen.queryByLabelText("Project persistence")).not.toBeInTheDocument();

    // Step 4: "Return to editor" link must now be visible (project is still in state)
    const returnLink = screen.getByText("Return to editor");
    expect(returnLink).toBeInTheDocument();

    // Step 5: Click "Return to editor" — must NOT load the sample or replace the project
    await act(async () => {
      fireEvent.click(returnLink);
    });

    expect(screen.queryByLabelText("Create demo")).not.toBeInTheDocument();
    // Open overlay to verify Project persistence is accessible after returning to Editor
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(screen.getByLabelText("Project persistence")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close project file panel" }));

    // Step 6: Assert the Editor shows the same project (same title — project was NOT replaced)
    const titleAfterReturn = screen.getByRole("heading", { level: 1 }).textContent;
    expect(titleAfterReturn).toBe(generatedTitle);
  });
});

describe("App composition route", () => {
  it("opens the composition demo from the create screen entry", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Composition demo" }));
    expect(screen.getByRole("button", { name: "Generate" })).toBeInTheDocument();
  });

  it("returns to the create screen via the composition Back button", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Composition demo" }));
    expect(screen.queryByRole("button", { name: "Composition demo" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Composition demo" })).toBeInTheDocument();
  });
});
