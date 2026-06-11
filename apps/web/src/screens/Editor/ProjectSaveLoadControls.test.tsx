import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { DemoProject } from "@tinker/project-schema";
import { MAX_DEMO_PROJECT_JSON_BYTES, serializeDemoProject } from "@tinker/editor";
import { loadSampleProject } from "../../fixtures/loadSampleProject.js";
import { LOCAL_PROJECT_STORAGE_KEY, saveProjectToStorage } from "../../lib/projectStorage.js";
import { ProjectSaveLoadControls } from "./ProjectSaveLoadControls.js";

const loadedSample = loadSampleProject();
if (!loadedSample.ok) throw new Error("sample project fixture must be valid");
const sampleProject = loadedSample.project;

function renderControls(onProjectLoaded: (project: DemoProject) => void = () => undefined) {
  render(<ProjectSaveLoadControls project={sampleProject} onProjectLoaded={onProjectLoaded} />);
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
});
