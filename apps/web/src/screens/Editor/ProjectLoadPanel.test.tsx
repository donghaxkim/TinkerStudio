import { render, screen } from "@testing-library/react";
import { DemoProjectSchema } from "@tinker/project-schema";
import { describe, expect, it } from "vitest";
import sampleProjectInput from "../../../../../packages/project-schema/fixtures/demo-project.sample.json";
import { ProjectLoadPanel } from "./ProjectLoadPanel.js";

const sampleProject = DemoProjectSchema.parse(sampleProjectInput);

describe("ProjectLoadPanel", () => {
  it("renders generated project strings as text instead of HTML", () => {
    render(
      <ProjectLoadPanel
        result={{
          ok: true,
          project: {
            ...sampleProject,
            title: "<img src=x onerror=alert(1)>",
          },
        }}
      />,
    );

    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});
