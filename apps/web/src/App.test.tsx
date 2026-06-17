import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";

describe("App composition product flow", () => {
  it("opens directly into the planning-first Create Demo workspace", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /Tinker Studio/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("product.example.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("github.com/owner/repo")).toBeInTheDocument();
    expect(screen.getByLabelText("Product URL")).toBeInTheDocument();
    expect(screen.getByLabelText("GitHub repo URL")).toBeInTheDocument();
    expect(screen.queryByLabelText("Demo description")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open empty editor shell" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Composition demo (beta)" })).not.toBeInTheDocument();
  });

  it("does not expose the legacy sample-project entry", () => {
    render(<App />);

    expect(screen.queryByText("or start from a sample project")).not.toBeInTheDocument();
  });
});
