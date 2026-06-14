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

  it("enables Send when onSend is provided and instruction is non-empty", () => {
    const onSend = vi.fn();
    render(<CompositionChatPanel {...props({ instruction: "punch in", onSend })} />);
    const send = screen.getByRole("button", { name: /send/i });
    expect(send).not.toBeDisabled();
    fireEvent.click(send);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("disables Send while drafting and shows a drafting state", () => {
    render(<CompositionChatPanel {...props({ instruction: "x", onSend: () => undefined, status: "drafting" })} />);
    expect(screen.getByText(/drafting/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("shows Accept and Reject while previewing", () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    render(<CompositionChatPanel {...props({ status: "preview", isPreviewing: true, onAccept, onReject })} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject edit" }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("shows an error message", () => {
    render(<CompositionChatPanel {...props({ status: "error", error: "Server error" })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Server error");
  });

  it("shows Undo when canUndo", () => {
    const onUndo = vi.fn();
    render(<CompositionChatPanel {...props({ canUndo: true, onUndo })} />);
    fireEvent.click(screen.getByRole("button", { name: "Undo last edit" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
