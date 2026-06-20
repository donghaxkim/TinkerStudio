import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CompositionEditorScreen } from "./CompositionEditorScreen.js";

describe("CompositionEditorScreen", () => {
  it("renders the standalone published video shell", () => {
    render(<CompositionEditorScreen standaloneVideoUrl="/api/jobs/j/artifacts/testreel/final.mp4" repo="acme/driftboard" />);

    expect(screen.getByLabelText("Editor status")).toHaveTextContent("Saved");
    expect(screen.getByTestId("composition-standalone-video")).toHaveAttribute("src", "/api/jobs/j/artifacts/testreel/final.mp4");
    expect(screen.getByRole("link", { name: "GitHub repository acme/driftboard" })).toHaveAttribute("href", "https://github.com/acme/driftboard");
  });
});
