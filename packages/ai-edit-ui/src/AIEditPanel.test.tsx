import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DemoProjectSchema } from "@tinker/project-schema";
import { applyEditOperations } from "@tinker/editor";
import { describe, expect, it, vi } from "vitest";
import sampleProjectInput from "../../project-schema/fixtures/demo-project.sample.json";
import { AIEditPanel } from "./AIEditPanel.js";
import { mockAIEditClient } from "./mockAIEditClient.js";

const sampleProject = DemoProjectSchema.parse(sampleProjectInput);

describe("mockAIEditClient", () => {
  it("returns a project slice and structured operations", async () => {
    const proposal = await mockAIEditClient({
      project: sampleProject,
      selectedRange: { start: 12, end: 18 },
      prompt: "Highlight analytics",
    });

    expect(proposal.targetRange).toEqual({ start: 12, end: 18 });
    expect(proposal.projectSlice.zooms.map((zoom) => zoom.id)).toEqual(["zoom_001"]);
    expect(proposal.operations.map((operation) => operation.type)).toEqual(["add_zoom"]);
  });

  it("keeps mock operations valid for short and boundary ranges", async () => {
    for (const selectedRange of [
      { start: 12, end: 12.1 },
      { start: sampleProject.duration - 0.1, end: sampleProject.duration },
      { start: 18, end: 12 },
    ]) {
      const proposal = await mockAIEditClient({
        project: sampleProject,
        selectedRange,
        prompt: "Tight edit",
      });

      const result = applyEditOperations(sampleProject, proposal, { mode: "preview" });
      expect(result.ok).toBe(true);
      for (const operation of proposal.operations) {
        if (operation.type === "remove_entity") continue;
        expect(operation.start).toBeGreaterThanOrEqual(proposal.targetRange.start);
        expect(operation.end).toBeLessThanOrEqual(proposal.targetRange.end);
        expect(operation.end).toBeLessThanOrEqual(sampleProject.duration);
        expect(operation.end).toBeGreaterThan(operation.start);
      }
    }
  });
});

describe("AIEditPanel", () => {
  it("is disabled without a selected range", () => {
    render(<AIEditPanel project={sampleProject} />);

    expect(screen.getByRole("button", { name: /generate mock proposal/i })).toBeDisabled();
    expect(screen.getByText(/select a timeline range to edit it with the assistant/i)).toBeInTheDocument();
  });

  it("mock-generates and previews operations", async () => {
    const onPreviewProjectChange = vi.fn();
    render(
      <AIEditPanel
        project={sampleProject}
        selectedRange={{ start: 12, end: 18 }}
        onPreviewProjectChange={onPreviewProjectChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /generate mock proposal/i }));

    expect(await screen.findByText("add_zoom")).toBeInTheDocument();
    expect(screen.queryByText("add_caption")).not.toBeInTheDocument();
    expect(screen.queryByText("add_callout")).not.toBeInTheDocument();
    await waitFor(() => expect(onPreviewProjectChange).toHaveBeenCalledWith(expect.objectContaining({ id: sampleProject.id })));
  });

  it("accept returns an updated project", async () => {
    const onAccept = vi.fn();
    render(
      <AIEditPanel project={sampleProject} selectedRange={{ start: 12, end: 18 }} onAccept={onAccept} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /generate mock proposal/i }));
    fireEvent.click(await screen.findByRole("button", { name: /accept edit/i }));

    await waitFor(() => expect(onAccept).toHaveBeenCalled());
    const [updatedProject, command] = onAccept.mock.calls[0];
    expect(updatedProject.aiEditHistory).toHaveLength(sampleProject.aiEditHistory.length + 1);
    expect(command.beforeProject).toBe(sampleProject);
    expect(command.afterProject).toBe(updatedProject);
  });

  it("reject preserves the project", async () => {
    const onReject = vi.fn();
    const onAccept = vi.fn();
    render(
      <AIEditPanel
        project={sampleProject}
        selectedRange={{ start: 12, end: 18 }}
        onAccept={onAccept}
        onReject={onReject}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /generate mock proposal/i }));
    fireEvent.click(await screen.findByRole("button", { name: /reject edit/i }));

    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
    expect(screen.getByText(/proposal rejected/i)).toBeInTheDocument();
  });
});
