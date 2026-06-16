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
  it("renders the chat-to-edit composer", () => {
    render(<CompositionChatPanel {...props({ contextRefs: [], onSend: () => undefined })} />);
    expect(screen.getByLabelText("Chat to edit")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Type something you want to change…")).toBeInTheDocument();
  });

  it("has no model selector — the composer matches the design", () => {
    render(<CompositionChatPanel {...props({ contextRefs: [], onSend: () => undefined })} />);
    expect(screen.queryByRole("button", { name: "Change model" })).not.toBeInTheDocument();
    expect(screen.queryByText("GPT-5.5")).not.toBeInTheDocument();
  });

  it("renders the assistant intro message and the icon tab header", () => {
    render(<CompositionChatPanel {...props({ contextRefs: [], onSend: () => undefined, intro: "I watched the recording — 3 scenes, 12 seconds." })} />);
    expect(screen.getByText("I watched the recording — 3 scenes, 12 seconds.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chat to edit" })).toBeInTheDocument();
  });

  it("shows suggestion chips and fills the composer when one is clicked", () => {
    const onInstructionChange = vi.fn();
    render(
      <CompositionChatPanel
        {...props({ contextRefs: [], onSend: () => undefined, onInstructionChange, suggestions: ["Tighten the pacing", "Smooth the cursor"] })}
      />,
    );
    expect(screen.getByRole("button", { name: "Smooth the cursor" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tighten the pacing" }));
    expect(onInstructionChange).toHaveBeenCalledWith("Tighten the pacing");
  });

  it("hides suggestions once the composer has text", () => {
    render(
      <CompositionChatPanel
        {...props({ contextRefs: [], onSend: () => undefined, instruction: "punch in", suggestions: ["Tighten the pacing"] })}
      />,
    );
    expect(screen.queryByRole("button", { name: "Tighten the pacing" })).not.toBeInTheDocument();
  });

  it("keeps the composer disabled before editing is available without extra explanatory copy", () => {
    render(<CompositionChatPanel {...props({ contextRefs: [] })} />);
    expect(screen.getByLabelText("Edit instruction")).toBeDisabled();
    expect(screen.queryByText(/generate a demo/i)).not.toBeInTheDocument();
  });

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

  const zp = <div data-testid="zp-body">ZP</div>;

  it("renders a Zoom tab and shows the properties when it is active", () => {
    render(<CompositionChatPanel {...props({ contextRefs: [], onSend: () => undefined, zoomProperties: zp, zoomTabActive: true })} />);
    expect(screen.getByRole("button", { name: "Zoom properties" })).toBeInTheDocument();
    expect(screen.getByTestId("zp-body")).toBeInTheDocument();
    // the chat composer is replaced while editing zoom properties
    expect(screen.queryByLabelText("Edit instruction")).not.toBeInTheDocument();
  });

  it("returns to chat from the Zoom tab", () => {
    const onSelectChatTab = vi.fn();
    render(<CompositionChatPanel {...props({ instruction: "punch in", onSend: () => undefined, zoomProperties: zp, zoomTabActive: true, onSelectChatTab })} />);
    fireEvent.click(screen.getByRole("button", { name: "Chat to edit" }));
    expect(onSelectChatTab).toHaveBeenCalledTimes(1);
  });

  it("shows the Zoom tab but keeps chat visible until it is activated", () => {
    render(<CompositionChatPanel {...props({ contextRefs: [], onSend: () => undefined, zoomProperties: zp, zoomTabActive: false })} />);
    expect(screen.getByRole("button", { name: "Zoom properties" })).toBeInTheDocument();
    expect(screen.getByLabelText("Edit instruction")).toBeInTheDocument(); // chat still shown
    expect(screen.queryByTestId("zp-body")).not.toBeInTheDocument();
  });

  it("has no Zoom tab when no zoom is selected", () => {
    render(<CompositionChatPanel {...props({ contextRefs: [], onSend: () => undefined })} />);
    expect(screen.queryByRole("button", { name: "Zoom properties" })).not.toBeInTheDocument();
  });
});
