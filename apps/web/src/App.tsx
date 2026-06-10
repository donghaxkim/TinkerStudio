import { useMemo, useState } from "react";
import type { DemoProject } from "@tinker/project-schema";
import { createMockGenerationClient } from "./lib/mockGenerationClient.js";
import { CreateDemoScreen } from "./screens/CreateDemo/CreateDemoScreen.js";
import { EditorScreen } from "./screens/Editor/EditorScreen.js";

export function App() {
  const generationClient = useMemo(() => createMockGenerationClient(), []);
  const [generatedProject, setGeneratedProject] = useState<DemoProject | undefined>();

  return (
    <main style={{ display: "grid", gap: 24, padding: 24 }}>
      <CreateDemoScreen generationClient={generationClient} onProjectGenerated={setGeneratedProject} />
      {generatedProject ? <p style={{ margin: 0, color: "#bbf7d0" }}>Generated project loaded in editor.</p> : null}
      <EditorScreen key={generatedProject?.id ?? "sample"} initialProject={generatedProject} />
    </main>
  );
}
