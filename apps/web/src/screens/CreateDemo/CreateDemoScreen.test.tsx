import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GenerationClient } from "../../lib/generationClient.js";
import { createMockGenerationClient } from "../../lib/mockGenerationClient.js";
import { CreateDemoScreen } from "./CreateDemoScreen.js";

function fillValidForm() {
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
}

describe("CreateDemoScreen", () => {
  it("renders all V1 create-demo fields and all progress phases", () => {
    render(<CreateDemoScreen generationClient={createMockGenerationClient()} onProjectGenerated={() => undefined} />);

    expect(screen.getByLabelText("GitHub repo URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Product or local app URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Demo prompt")).toBeInTheDocument();
    expect(screen.getByLabelText("Duration cap")).toBeInTheDocument();
    expect(screen.getByLabelText("Aspect ratio")).toBeInTheDocument();
    expect(screen.queryByLabelText("Enable narration")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Narration style")).not.toBeInTheDocument();

    for (const label of [
      "Queued",
      "Analyzing product",
      "Creating storyboard",
      "Planning capture",
      "Capturing",
      "Compiling project",
      "Validating project",
      "Complete",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("validates before submit", async () => {
    render(<CreateDemoScreen generationClient={createMockGenerationClient()} onProjectGenerated={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Create demo" }));

    expect(await screen.findByText(/Fix the highlighted fields/)).toBeInTheDocument();
    expect(screen.getByText(/prompt is required/i)).toBeInTheDocument();
  });

  it("submits through the generation client and opens a validated project on success", async () => {
    const generatedProjects: string[] = [];
    const client = createMockGenerationClient();
    render(
      <CreateDemoScreen
        generationClient={client}
        onProjectGenerated={(project) => generatedProjects.push(project.id)}
      />,
    );

    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Create demo" }));

    expect(await screen.findByText("Generation succeeded. Opening editor…")).toBeInTheDocument();
    await waitFor(() => expect(generatedProjects).toEqual(["demo_project_sample"]));
  });

  it("renders failed jobs and does not open the editor", async () => {
    const generatedProjects: string[] = [];
    const client = createMockGenerationClient({ mode: "failed" });
    render(
      <CreateDemoScreen
        generationClient={client}
        onProjectGenerated={(project) => generatedProjects.push(project.id)}
      />,
    );

    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Create demo" }));

    expect(await screen.findByText("Capture failed in mock generator")).toBeInTheDocument();
    expect(generatedProjects).toEqual([]);
  });

  it("rejects invalid generation results and does not open the editor", async () => {
    const generatedProjects: string[] = [];
    const client = createMockGenerationClient({ mode: "invalid-result" }) as GenerationClient;
    render(
      <CreateDemoScreen
        generationClient={client}
        onProjectGenerated={(project) => generatedProjects.push(project.id)}
      />,
    );

    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Create demo" }));

    expect(await screen.findByText(/Generated project failed validation/)).toBeInTheDocument();
    expect(generatedProjects).toEqual([]);
  });
});
