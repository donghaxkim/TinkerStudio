import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompositionChatPanel } from "./CompositionChatPanel.js";
import type { ChatContextRef } from "../../lib/chatContext.js";

const refs: ChatContextRef[] = [
  { id: "a", kind: "range", start: 2, end: 6 },
  { id: "b", kind: "clip", clipId: "feature", label: "Feature", start: 6, end: 10 },
];

function props(over = {}) {
  return {
    instruction: "", onInstructionChange: () => undefined, contextRefs: refs,
    onRemoveRef: () => undefined, hasSelection: true, onAddToChat: () => undefined, ...over,
  };
}

describe("CompositionChatPanel", () => {
  it("renders a chip per context ref with its label", () => {
    render(<CompositionChatPanel {...props()} />);
    expect(screen.getByText("2.0s–6.0s")).toBeInTheDocument();
    expect(screen.getByText("Feature")).toBeInTheDocument();
  });
  it("removes a chip", () => {
    const onRemoveRef = vi.fn();
    render(<CompositionChatPanel {...props({ onRemoveRef })} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove 2.0s–6.0s from chat" }));
    expect(onRemoveRef).toHaveBeenCalledWith("a");
  });
  it("enables Add to chat only with a selection", () => {
    const onAddToChat = vi.fn();
    const { rerender } = render(<CompositionChatPanel {...props({ hasSelection: false, onAddToChat })} />);
    expect(screen.getByRole("button", { name: "Add selection to chat" })).toBeDisabled();
    rerender(<CompositionChatPanel {...props({ hasSelection: true, onAddToChat })} />);
    fireEvent.click(screen.getByRole("button", { name: "Add selection to chat" }));
    expect(onAddToChat).toHaveBeenCalledTimes(1);
  });
  it("disables send in 2a", () => {
    render(<CompositionChatPanel {...props()} />);
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });
});
