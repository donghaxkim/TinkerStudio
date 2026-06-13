import { useState } from "react";
import type { DemoProject } from "@tinker/project-schema";
import { createMockGenerationClient } from "./lib/mockGenerationClient.js";
import { loadSampleProject } from "./fixtures/loadSampleProject.js";
import { CreateDemoScreen } from "./screens/CreateDemo/CreateDemoScreen.js";
import { EditorScreen, type ProjectOrigin } from "./screens/Editor/EditorScreen.js";
import { SettingsScreen } from "./screens/Settings/SettingsScreen.js";

// Route before settings (so Settings knows where to return)
type PreSettingsRoute = "create" | "editor";
type Route = "create" | "editor" | "settings";

type AppState = {
  route: Route;
  project: DemoProject | undefined;
  projectOrigin: ProjectOrigin;
  preSettingsRoute: PreSettingsRoute;
};

const generationClient = createMockGenerationClient();

export function App() {
  const [state, setState] = useState<AppState>({
    route: "create",
    project: undefined,
    projectOrigin: "generated",
    preSettingsRoute: "create",
  });

  function handleProjectGenerated(project: DemoProject) {
    setState((prev) => ({ ...prev, route: "editor", project, projectOrigin: "generated" }));
  }

  function handleUseSampleProject() {
    const result = loadSampleProject();
    if (result.ok) {
      setState((prev) => ({ ...prev, route: "editor", project: result.project, projectOrigin: "sample" }));
    }
  }

  function handleOpenSettings() {
    setState((prev) => ({
      ...prev,
      route: "settings",
      // Narrow without a cast: Settings is only reachable from create/editor, never from itself.
      preSettingsRoute: prev.route === "editor" ? "editor" : "create",
    }));
  }

  function handleCloseSettings() {
    setState((prev) => ({ ...prev, route: prev.preSettingsRoute }));
  }

  function handleExitToCreate() {
    // Navigate to create — do NOT clear project; only a new generation or explicit load changes project
    setState((prev) => ({ ...prev, route: "create" }));
  }

  function handleReturnToEditor() {
    // Return to editor with the existing in-progress project — does NOT replace it
    setState((prev) => ({ ...prev, route: "editor" }));
  }

  if (state.route === "editor") {
    return (
      <EditorScreen
        initialProject={state.project}
        projectOrigin={state.projectOrigin}
        onOpenSettings={handleOpenSettings}
        onExitToCreate={handleExitToCreate}
      />
    );
  }

  if (state.route === "settings") {
    return <SettingsScreen onClose={handleCloseSettings} />;
  }

  // route === "create"
  return (
    <CreateDemoScreen
      generationClient={generationClient}
      onProjectGenerated={handleProjectGenerated}
      onUseSampleProject={handleUseSampleProject}
      onReturnToEditor={handleReturnToEditor}
      hasInProgressProject={state.project !== undefined}
    />
  );
}
