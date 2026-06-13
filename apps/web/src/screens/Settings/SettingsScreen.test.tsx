import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PROJECT_SCHEMA_VERSION } from "@tinker/project-schema";
import {
  DEFAULT_EXPORT_DIRECTORY,
  EXPORT_DIRECTORY_STORAGE_KEY,
  getExportDirectory,
} from "../../lib/appSettings.js";
import { loadSampleProject } from "../../fixtures/loadSampleProject.js";
import { LOCAL_PROJECT_STORAGE_KEY, saveProjectToStorage } from "../../lib/projectStorage.js";
import { APP_VERSION, SettingsScreen } from "./SettingsScreen.js";

afterEach(() => {
  window.localStorage.removeItem(LOCAL_PROJECT_STORAGE_KEY);
  window.localStorage.removeItem(EXPORT_DIRECTORY_STORAGE_KEY);
});

// ─── diagnostics rendering ────────────────────────────────────────────────────

describe("SettingsScreen diagnostics", () => {
  it("shows app version", () => {
    render(<SettingsScreen />);
    expect(screen.getByLabelText("Settings")).toHaveTextContent(APP_VERSION);
  });

  it("shows PROJECT_SCHEMA_VERSION", () => {
    render(<SettingsScreen />);
    expect(screen.getByLabelText("Settings")).toHaveTextContent(PROJECT_SCHEMA_VERSION);
  });

  it("shows generation mode", () => {
    render(<SettingsScreen />);
    expect(screen.getByLabelText("Settings")).toHaveTextContent("Mock local client");
  });

  it("shows the project storage key", () => {
    render(<SettingsScreen />);
    // The storage key appears at least once in the diagnostics section
    const matches = screen.getAllByText(LOCAL_PROJECT_STORAGE_KEY);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("shows 'none' when no saved project exists", () => {
    render(<SettingsScreen />);
    expect(screen.getByTestId("saved-project-summary")).toHaveTextContent("none");
  });

  it("shows a summary when a saved project exists", () => {
    // Load the real sample fixture (validated against the full schema) and persist it
    // so that getSavedProjectSummary() can round-trip it through loadProjectFromStorage.
    const loaded = loadSampleProject();
    if (!loaded.ok) throw new Error("Sample project fixture failed to load: " + loaded.error.message);
    const saved = saveProjectToStorage(loaded.project);
    if (!saved.ok) throw new Error("Failed to seed project storage: " + saved.error.message);

    render(<SettingsScreen />);

    const summary = screen.getByTestId("saved-project-summary");
    // The summary must show the project's real title and id, not the fallback "none".
    expect(summary).toHaveTextContent(loaded.project.title);
    expect(summary).toHaveTextContent(loaded.project.id);
    expect(summary).not.toHaveTextContent("none");
  });
});

// ─── reset button ─────────────────────────────────────────────────────────────

describe("SettingsScreen reset", () => {
  it("clears saved project storage and shows success", () => {
    window.localStorage.setItem(LOCAL_PROJECT_STORAGE_KEY, "{}");

    render(<SettingsScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Reset saved project" }));

    expect(window.localStorage.getItem(LOCAL_PROJECT_STORAGE_KEY)).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("cleared");
  });
});

// ─── close button ─────────────────────────────────────────────────────────────

describe("SettingsScreen close", () => {
  it("calls onClose when the close button is clicked", () => {
    let closed = false;
    render(<SettingsScreen onClose={() => { closed = true; }} />);
    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    expect(closed).toBe(true);
  });

  it("does not render the close button when onClose is not provided", () => {
    render(<SettingsScreen />);
    expect(screen.queryByRole("button", { name: "Close settings" })).not.toBeInTheDocument();
  });
});

// ─── export directory field ───────────────────────────────────────────────────

describe("SettingsScreen export directory", () => {
  it("shows the persisted export directory value (default when nothing set)", () => {
    render(<SettingsScreen />);
    const input = screen.getByLabelText("Export directory");
    expect((input as HTMLInputElement).value).toBe(DEFAULT_EXPORT_DIRECTORY);
  });

  it("shows a previously saved export directory", () => {
    window.localStorage.setItem(EXPORT_DIRECTORY_STORAGE_KEY, "my-videos");
    render(<SettingsScreen />);
    const input = screen.getByLabelText("Export directory");
    expect((input as HTMLInputElement).value).toBe("my-videos");
  });

  it("persists the new export directory when Save is clicked", () => {
    render(<SettingsScreen />);
    const input = screen.getByLabelText("Export directory");
    fireEvent.change(input, { target: { value: "custom-output" } });
    fireEvent.click(screen.getByRole("button", { name: "Save export directory" }));
    expect(getExportDirectory()).toBe("custom-output");
  });

  it("shows a success message after saving", () => {
    render(<SettingsScreen />);
    const input = screen.getByLabelText("Export directory");
    fireEvent.change(input, { target: { value: "output" } });
    fireEvent.click(screen.getByRole("button", { name: "Save export directory" }));
    expect(screen.getByRole("status")).toHaveTextContent("Export directory set");
  });

  it("sanitizes '..' traversal to the default on save", () => {
    render(<SettingsScreen />);
    const input = screen.getByLabelText("Export directory");
    fireEvent.change(input, { target: { value: "../danger" } });
    fireEvent.click(screen.getByRole("button", { name: "Save export directory" }));
    expect(getExportDirectory()).toBe(DEFAULT_EXPORT_DIRECTORY);
    expect((screen.getByLabelText("Export directory") as HTMLInputElement).value).toBe(DEFAULT_EXPORT_DIRECTORY);
  });

  it("shows a warning (not plain success) when the input is rejected and sanitized", () => {
    render(<SettingsScreen />);
    const input = screen.getByLabelText("Export directory");
    fireEvent.change(input, { target: { value: "../escape" } });
    fireEvent.click(screen.getByRole("button", { name: "Save export directory" }));

    // Should show a warning status message, not a plain success
    const statusMsg = screen.getByRole("status");
    expect(statusMsg).toHaveTextContent(/isn't allowed/i);
    expect(statusMsg).toHaveTextContent(/generated/i);
    // Must NOT say "set to" (the success wording)
    expect(statusMsg).not.toHaveTextContent(/export directory set to/i);
  });

  it("shows success when a valid directory is saved unchanged", () => {
    render(<SettingsScreen />);
    const input = screen.getByLabelText("Export directory");
    fireEvent.change(input, { target: { value: "my-renders" } });
    fireEvent.click(screen.getByRole("button", { name: "Save export directory" }));

    const statusMsg = screen.getByRole("status");
    expect(statusMsg).toHaveTextContent(/export directory set to/i);
    expect(statusMsg).toHaveTextContent("my-renders");
  });
});
