import { render, screen } from "@testing-library/react";
import { DemoProjectSchema } from "@tinker/project-schema";
import { describe, expect, it } from "vitest";
import sampleProjectInput from "../../../../../packages/project-schema/fixtures/demo-project.sample.json";
import { ProjectExportPanel } from "./ProjectExportPanel.js";

const sampleProject = DemoProjectSchema.parse(sampleProjectInput);

describe("ProjectExportPanel", () => {
  it("shows the MP4 artifact details for the current project", () => {
    render(<ProjectExportPanel project={sampleProject} />);

    expect(screen.getByRole("heading", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByText("sample-product-demo.mp4")).toBeInTheDocument();
    expect(screen.getByText("video/mp4")).toBeInTheDocument();
    expect(screen.getByText("1920 × 1080")).toBeInTheDocument();
    expect(screen.getByText(/7 render layers/)).toBeInTheDocument();
  });
});
