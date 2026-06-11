import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";

describe("App", () => {
  it("renders only the bare reset shell", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Tinker" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Create demo")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sample Product Demo" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Project metadata")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Generation progress")).not.toBeInTheDocument();
  });
});
