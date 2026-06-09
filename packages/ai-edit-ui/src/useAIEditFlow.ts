import { useCallback, useMemo, useState } from "react";
import type { DemoProject } from "@tinker/project-schema";
import type { AIEditProposal, ApplyEditOperationsResult, EditorCommand, SelectedRange } from "@tinker/editor";
import { applyEditOperations } from "@tinker/editor";
import { mockAIEditClient, type MockAIEditProposal } from "./mockAIEditClient.js";

export type AIEditFlowStatus = "idle" | "generating" | "preview" | "accepted" | "rejected" | "error";

export type UseAIEditFlowOptions = {
  project: DemoProject;
  selectedRange?: SelectedRange;
  now?: () => Date | string;
  onPreviewProjectChange?: (project: DemoProject | undefined) => void;
  onAccept?: (project: DemoProject, command: EditorCommand) => void;
  onReject?: () => void;
};

export type UseAIEditFlowResult = {
  prompt: string;
  setPrompt: (prompt: string) => void;
  status: AIEditFlowStatus;
  proposal?: MockAIEditProposal;
  previewResult?: ApplyEditOperationsResult;
  error?: string;
  canGenerate: boolean;
  generateProposal: () => Promise<void>;
  acceptProposal: () => void;
  rejectProposal: () => void;
  reset: () => void;
};

function resultErrorMessage(result: ApplyEditOperationsResult) {
  if (result.ok) return undefined;
  const issueText = result.error.issues?.length ? `: ${result.error.issues.join(", ")}` : "";
  return `${result.error.message}${issueText}`;
}

export function useAIEditFlow({
  project,
  selectedRange,
  now,
  onPreviewProjectChange,
  onAccept,
  onReject,
}: UseAIEditFlowOptions): UseAIEditFlowResult {
  const [prompt, setPrompt] = useState("Make this range more polished.");
  const [status, setStatus] = useState<AIEditFlowStatus>("idle");
  const [proposal, setProposal] = useState<MockAIEditProposal>();
  const [previewResult, setPreviewResult] = useState<ApplyEditOperationsResult>();
  const [error, setError] = useState<string>();

  const canGenerate = Boolean(selectedRange && selectedRange.end > selectedRange.start);

  const reset = useCallback(() => {
    setStatus("idle");
    setProposal(undefined);
    setPreviewResult(undefined);
    setError(undefined);
    onPreviewProjectChange?.(undefined);
  }, [onPreviewProjectChange]);

  const generateProposal = useCallback(async () => {
    if (!selectedRange || selectedRange.end <= selectedRange.start) {
      setStatus("error");
      setError("Select a non-empty timeline range before asking AI to edit.");
      return;
    }

    setStatus("generating");
    setError(undefined);
    onPreviewProjectChange?.(undefined);

    const nextProposal = await mockAIEditClient({ project, selectedRange, prompt });
    const editProposal: AIEditProposal = {
      prompt: nextProposal.prompt,
      targetRange: nextProposal.targetRange,
      operations: nextProposal.operations,
    };
    const preview = applyEditOperations(project, editProposal, { mode: "preview" });

    setProposal(nextProposal);
    setPreviewResult(preview);

    if (!preview.ok) {
      setStatus("error");
      setError(resultErrorMessage(preview));
      return;
    }

    setStatus("preview");
    onPreviewProjectChange?.(preview.project);
  }, [onPreviewProjectChange, project, prompt, selectedRange]);

  const acceptProposal = useCallback(() => {
    if (!proposal) return;

    const accepted = applyEditOperations(
      project,
      {
        prompt: proposal.prompt,
        targetRange: proposal.targetRange,
        operations: proposal.operations,
      },
      { mode: "accept", now },
    );

    setPreviewResult(accepted);

    if (!accepted.ok) {
      setStatus("error");
      setError(resultErrorMessage(accepted));
      return;
    }

    setStatus("accepted");
    setError(undefined);
    onPreviewProjectChange?.(undefined);
    onAccept?.(accepted.project, {
      type: "ai-edit",
      id: accepted.aiEdit?.id ?? `ai-edit-${Date.now()}`,
      label: proposal.prompt,
      beforeProject: project,
      afterProject: accepted.project,
    });
  }, [now, onAccept, onPreviewProjectChange, project, proposal]);

  const rejectProposal = useCallback(() => {
    setStatus("rejected");
    setProposal(undefined);
    setPreviewResult(undefined);
    setError(undefined);
    onPreviewProjectChange?.(undefined);
    onReject?.();
  }, [onPreviewProjectChange, onReject]);

  return useMemo(
    () => ({
      prompt,
      setPrompt,
      status,
      proposal,
      previewResult,
      error,
      canGenerate,
      generateProposal,
      acceptProposal,
      rejectProposal,
      reset,
    }),
    [
      acceptProposal,
      canGenerate,
      error,
      generateProposal,
      previewResult,
      prompt,
      proposal,
      rejectProposal,
      reset,
      status,
    ],
  );
}
