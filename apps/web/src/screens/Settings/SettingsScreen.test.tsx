import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LOCAL_PROJECT_STORAGE_KEY } from "../../lib/projectStorage.js";
import { SettingsScreen } from "./SettingsScreen.js";

describe("SettingsScreen", () => {
  it("shows local prototype settings", () => {
    render(<SettingsScreen />);

    expect(screen.getByLabelText("Settings")).toHaveTextContent("Mock local client");
    expect(screen.getByText(LOCAL_PROJECT_STORAGE_KEY)).toBeInTheDocument();
    expect(screen.getByText("generated/local-job/<jobId>")).toBeInTheDocument();
  });

  it("clears saved project storage", () => {
    window.localStorage.setItem(LOCAL_PROJECT_STORAGE_KEY, "{}");

    render(<SettingsScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Reset saved project" }));

    expect(window.localStorage.getItem(LOCAL_PROJECT_STORAGE_KEY)).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("cleared");
  });
});
