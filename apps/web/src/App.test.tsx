import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";

describe("App", () => {
  it("renders the exported Graphite reference design by default", () => {
    render(<App />);

    expect(screen.getByLabelText("Tinker editor")).toHaveClass("theme-graphite");
    expect(screen.getByTitle("Graphite reference design")).toHaveAttribute(
      "src",
      "/reference-designs/graphite.html",
    );
  });

  it("opens settings and switches to the Porcelain reference design", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    expect(screen.getByLabelText("Settings panel")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Theme" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Porcelain/i }));

    expect(screen.getByLabelText("Tinker editor")).toHaveClass("theme-porcelain");
    expect(screen.getByTitle("Porcelain reference design")).toHaveAttribute(
      "src",
      "/reference-designs/porcelain.html",
    );
  });

  it("switches to the Nocturne reference design", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: /Nocturne/i }));

    expect(screen.getByLabelText("Tinker editor")).toHaveClass("theme-nocturne");
    expect(screen.getByTitle("Nocturne reference design")).toHaveAttribute(
      "src",
      "/reference-designs/nocturne.html",
    );
  });
});
