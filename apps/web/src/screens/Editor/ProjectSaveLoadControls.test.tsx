import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DemoProject } from "@tinker/project-schema";
import { MAX_DEMO_PROJECT_JSON_BYTES, serializeDemoProject } from "@tinker/editor";
import { loadSampleProject } from "../../fixtures/loadSampleProject.js";
import { LOCAL_PROJECT_STORAGE_KEY, saveProjectToStorage } from "../../lib/projectStorage.js";
import type { PersistenceOrigin } from "./EditorScreen.js";
import { ProjectSaveLoadControls } from "./ProjectSaveLoadControls.js";

const loadedSample = loadSampleProject();
if (!loadedSample.ok) throw new Error("sample project fixture must be valid");
const sampleProject = loadedSample.project;

function renderControls(
  onProjectLoaded: (project: DemoProject, origin: PersistenceOrigin) => void = () => undefined,
  options: { dirty?: boolean; onSaved?: () => void; onDownloaded?: () => void } = {},
) {
  render(
    <ProjectSaveLoadControls
      project={sampleProject}
      onProjectLoaded={onProjectLoaded}
      dirty={options.dirty}
      onSaved={options.onSaved}
      onDownloaded={options.onDownloaded}
    />,
  );
}

describe("ProjectSaveLoadControls", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("saves the current full DemoProject JSON to browser storage", () => {
    renderControls();

    fireEvent.click(screen.getByRole("button", { name: "Save project" }));

    expect(screen.getByText("Project saved to browser storage.")).toBeInTheDocument();
    const storedJson = window.localStorage.getItem(LOCAL_PROJECT_STORAGE_KEY);
    expect(storedJson).toContain('"assets"');
    expect(storedJson).toContain('"aiEditHistory"');
    expect(JSON.parse(storedJson ?? "null")).toEqual(sampleProject);
  });

  it("loads a saved project only after validation", () => {
    const loadedIds: string[] = [];
    saveProjectToStorage(sampleProject);
    renderControls((project) => loadedIds.push(project.id));

    fireEvent.click(screen.getByRole("button", { name: "Load saved project" }));

    expect(screen.getByText("Project loaded from browser storage.")).toBeInTheDocument();
    expect(loadedIds).toEqual(["demo_project_sample"]);
  });

  it("shows validation errors for invalid saved projects", () => {
    window.localStorage.setItem(LOCAL_PROJECT_STORAGE_KEY, JSON.stringify({ ...sampleProject, duration: -1 }));
    const loadedIds: string[] = [];
    renderControls((project) => loadedIds.push(project.id));

    fireEvent.click(screen.getByRole("button", { name: "Load saved project" }));

    expect(screen.getByText("DemoProject validation failed")).toBeInTheDocument();
    expect(screen.getAllByText(/duration/).length).toBeGreaterThan(0);
    expect(loadedIds).toEqual([]);
  });

  it("loads a valid project JSON file and rejects invalid JSON files", async () => {
    const loadedIds: string[] = [];
    const serialized = serializeDemoProject(sampleProject);
    if (!serialized.ok) throw new Error("expected sample serialization success");
    renderControls((project) => loadedIds.push(project.id));

    fireEvent.change(screen.getByLabelText("Load project JSON file"), {
      target: { files: [new File([serialized.json], "project.json", { type: "application/json" })] },
    });

    expect(await screen.findByText("Project loaded from JSON file.")).toBeInTheDocument();
    expect(loadedIds).toEqual(["demo_project_sample"]);

    fireEvent.change(screen.getByLabelText("Load project JSON file"), {
      target: { files: [new File(["{bad json"], "bad.json", { type: "application/json" })] },
    });

    await waitFor(() => expect(screen.getByText("Project JSON could not be parsed")).toBeInTheDocument());
    expect(loadedIds).toEqual(["demo_project_sample"]);
  });

  it("rejects oversized project files before reading them", async () => {
    const loadedIds: string[] = [];
    renderControls((project) => loadedIds.push(project.id));
    const file = new File(["x".repeat(MAX_DEMO_PROJECT_JSON_BYTES + 1)], "huge-project.json", {
      type: "application/json",
    });
    Object.defineProperty(file, "text", {
      value: async () => {
        throw new Error("oversized project file should not be read");
      },
    });

    fireEvent.change(screen.getByLabelText("Load project JSON file"), { target: { files: [file] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("Project JSON is too large");
    expect(loadedIds).toEqual([]);
  });

  // ── New tests for PB-007 ──────────────────────────────────────────────────

  describe("onSaved / onDownloaded callbacks", () => {
    it("calls onSaved after a successful save to storage", () => {
      const onSaved = vi.fn();
      renderControls(undefined, { onSaved });

      fireEvent.click(screen.getByRole("button", { name: "Save project" }));

      expect(onSaved).toHaveBeenCalledTimes(1);
    });

    it("does not call onSaved when storage is empty (no save made)", () => {
      const onSaved = vi.fn();
      renderControls(undefined, { onSaved });
      // No "Save project" click — onSaved must not fire.
      expect(onSaved).not.toHaveBeenCalled();
    });

    it("calls onDownloaded when the Download JSON link is clicked", () => {
      const onDownloaded = vi.fn();
      renderControls(undefined, { onDownloaded });

      fireEvent.click(screen.getByRole("link", { name: "Download JSON" }));

      expect(onDownloaded).toHaveBeenCalledTimes(1);
    });
  });

  describe("origin passed to onProjectLoaded", () => {
    it("passes origin='saved' when loading from browser storage", () => {
      const loadedOrigins: PersistenceOrigin[] = [];
      saveProjectToStorage(sampleProject);
      renderControls((_project, origin) => loadedOrigins.push(origin));

      fireEvent.click(screen.getByRole("button", { name: "Load saved project" }));

      expect(loadedOrigins).toEqual(["saved"]);
    });

    it("passes origin='imported' when loading from a JSON file", async () => {
      const loadedOrigins: PersistenceOrigin[] = [];
      const serialized = serializeDemoProject(sampleProject);
      if (!serialized.ok) throw new Error("expected sample serialization success");
      renderControls((_project, origin) => loadedOrigins.push(origin));

      fireEvent.change(screen.getByLabelText("Load project JSON file"), {
        target: { files: [new File([serialized.json], "project.json", { type: "application/json" })] },
      });

      await screen.findByText("Project loaded from JSON file.");
      expect(loadedOrigins).toEqual(["imported"]);
    });
  });

  describe("invalid JSON and schema errors — no replacement", () => {
    it("shows an error for invalid JSON without calling onProjectLoaded", async () => {
      const onProjectLoaded = vi.fn();
      renderControls(onProjectLoaded);

      fireEvent.change(screen.getByLabelText("Load project JSON file"), {
        target: { files: [new File(["{bad json"], "bad.json", { type: "application/json" })] },
      });

      await waitFor(() => expect(screen.getByText("Project JSON could not be parsed")).toBeInTheDocument());
      expect(onProjectLoaded).not.toHaveBeenCalled();
    });

    it("shows schema validation errors without calling onProjectLoaded", async () => {
      const onProjectLoaded = vi.fn();
      const serialized = serializeDemoProject({ ...sampleProject, duration: -1 } as DemoProject);
      const badJson = serialized.ok ? serialized.json : JSON.stringify({ ...sampleProject, duration: -1 });
      renderControls(onProjectLoaded);

      fireEvent.change(screen.getByLabelText("Load project JSON file"), {
        target: { files: [new File([badJson], "invalid.json", { type: "application/json" })] },
      });

      await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
      expect(onProjectLoaded).not.toHaveBeenCalled();
    });

    it("shows validation errors for invalid stored project without calling onProjectLoaded", () => {
      const onProjectLoaded = vi.fn();
      window.localStorage.setItem(LOCAL_PROJECT_STORAGE_KEY, JSON.stringify({ ...sampleProject, duration: -1 }));
      renderControls(onProjectLoaded);

      fireEvent.click(screen.getByRole("button", { name: "Load saved project" }));

      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(onProjectLoaded).not.toHaveBeenCalled();
    });
  });

  describe("warn-before-replace inline confirm (dirty=true)", () => {
    it("shows an inline confirm when loading from storage with dirty=true", () => {
      const onProjectLoaded = vi.fn();
      saveProjectToStorage(sampleProject);
      renderControls(onProjectLoaded, { dirty: true });

      fireEvent.click(screen.getByRole("button", { name: "Load saved project" }));

      expect(screen.getByRole("alertdialog", { name: "You have unsaved changes — replace anyway?" })).toBeInTheDocument();
      expect(screen.getByText(/You have unsaved changes — replace anyway\?/i)).toBeInTheDocument();
      // onProjectLoaded has NOT been called yet
      expect(onProjectLoaded).not.toHaveBeenCalled();
    });

    it("moves focus to the Replace button when the confirm dialog appears", () => {
      saveProjectToStorage(sampleProject);
      renderControls(undefined, { dirty: true });

      fireEvent.click(screen.getByRole("button", { name: "Load saved project" }));

      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Replace" }));
    });

    it("Cancel preserves the current project and hides the confirm", () => {
      const onProjectLoaded = vi.fn();
      saveProjectToStorage(sampleProject);
      renderControls(onProjectLoaded, { dirty: true });

      fireEvent.click(screen.getByRole("button", { name: "Load saved project" }));
      expect(screen.getByRole("alertdialog", { name: "You have unsaved changes — replace anyway?" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("alertdialog", { name: "You have unsaved changes — replace anyway?" })).not.toBeInTheDocument();
      expect(onProjectLoaded).not.toHaveBeenCalled();
    });

    it("Replace proceeds after confirmation and calls onProjectLoaded with correct origin", () => {
      const loadedOrigins: PersistenceOrigin[] = [];
      const onProjectLoaded = vi.fn((_p: DemoProject, origin: PersistenceOrigin) => loadedOrigins.push(origin));
      saveProjectToStorage(sampleProject);
      renderControls(onProjectLoaded, { dirty: true });

      fireEvent.click(screen.getByRole("button", { name: "Load saved project" }));
      fireEvent.click(screen.getByRole("button", { name: "Replace" }));

      expect(onProjectLoaded).toHaveBeenCalledTimes(1);
      expect(loadedOrigins).toEqual(["saved"]);
      expect(screen.queryByRole("alertdialog", { name: "You have unsaved changes — replace anyway?" })).not.toBeInTheDocument();
      expect(screen.getByText("Project loaded from browser storage.")).toBeInTheDocument();
    });

    it("shows inline confirm when importing a JSON file while dirty=true", async () => {
      const onProjectLoaded = vi.fn();
      const serialized = serializeDemoProject(sampleProject);
      if (!serialized.ok) throw new Error("expected sample serialization success");
      renderControls(onProjectLoaded, { dirty: true });

      fireEvent.change(screen.getByLabelText("Load project JSON file"), {
        target: { files: [new File([serialized.json], "project.json", { type: "application/json" })] },
      });

      expect(await screen.findByRole("alertdialog", { name: "You have unsaved changes — replace anyway?" })).toBeInTheDocument();
      expect(onProjectLoaded).not.toHaveBeenCalled();
    });

    it("file import: Cancel preserves the project", async () => {
      const onProjectLoaded = vi.fn();
      const serialized = serializeDemoProject(sampleProject);
      if (!serialized.ok) throw new Error("expected sample serialization success");
      renderControls(onProjectLoaded, { dirty: true });

      fireEvent.change(screen.getByLabelText("Load project JSON file"), {
        target: { files: [new File([serialized.json], "project.json", { type: "application/json" })] },
      });

      await screen.findByRole("alertdialog", { name: "You have unsaved changes — replace anyway?" });
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("alertdialog", { name: "You have unsaved changes — replace anyway?" })).not.toBeInTheDocument();
      expect(onProjectLoaded).not.toHaveBeenCalled();
    });

    it("file import: Replace confirmed replaces and passes origin='imported'", async () => {
      const loadedOrigins: PersistenceOrigin[] = [];
      const onProjectLoaded = vi.fn((_p: DemoProject, origin: PersistenceOrigin) => loadedOrigins.push(origin));
      const serialized = serializeDemoProject(sampleProject);
      if (!serialized.ok) throw new Error("expected sample serialization success");
      renderControls(onProjectLoaded, { dirty: true });

      fireEvent.change(screen.getByLabelText("Load project JSON file"), {
        target: { files: [new File([serialized.json], "project.json", { type: "application/json" })] },
      });

      await screen.findByRole("alertdialog", { name: "You have unsaved changes — replace anyway?" });
      fireEvent.click(screen.getByRole("button", { name: "Replace" }));

      expect(onProjectLoaded).toHaveBeenCalledTimes(1);
      expect(loadedOrigins).toEqual(["imported"]);
      expect(screen.getByText("Project loaded from JSON file.")).toBeInTheDocument();
    });

    it("does NOT show confirm when dirty=false (loads immediately)", () => {
      const onProjectLoaded = vi.fn();
      saveProjectToStorage(sampleProject);
      renderControls(onProjectLoaded, { dirty: false });

      fireEvent.click(screen.getByRole("button", { name: "Load saved project" }));

      expect(screen.queryByRole("alertdialog", { name: "You have unsaved changes — replace anyway?" })).not.toBeInTheDocument();
      expect(onProjectLoaded).toHaveBeenCalledTimes(1);
    });

    it("invalid file while dirty shows the validation error, NOT the replace confirm, and does not call onProjectLoaded", async () => {
      const onProjectLoaded = vi.fn();
      renderControls(onProjectLoaded, { dirty: true });

      fireEvent.change(screen.getByLabelText("Load project JSON file"), {
        target: { files: [new File(["{bad json"], "bad.json", { type: "application/json" })] },
      });

      await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
      expect(screen.queryByRole("alertdialog", { name: "You have unsaved changes — replace anyway?" })).not.toBeInTheDocument();
      expect(onProjectLoaded).not.toHaveBeenCalled();
    });
  });
});
