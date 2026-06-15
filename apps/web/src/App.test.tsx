import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";

describe("App composition product flow", () => {
  it("opens directly into the original Porcelain Create Demo composer", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /Tinker Studio/i })).toBeInTheDocument();
    expect(screen.getByText("github.com/owner/repo")).toBeInTheDocument();
    expect(screen.getByLabelText("GitHub repo URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Demo description")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Product URL")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Composition demo (beta)" })).not.toBeInTheDocument();
  });

  it("does not expose the legacy sample-project entry", () => {
    render(<App />);

    expect(screen.queryByText("or start from a sample project")).not.toBeInTheDocument();
  });
});
