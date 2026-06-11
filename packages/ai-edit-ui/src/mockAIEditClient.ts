import type { AIEditOperation, DemoProject } from "@tinker/project-schema";
import type { ProjectSlice, SelectedRange } from "@tinker/editor";
import { selectProjectSlice } from "@tinker/editor";

export type MockAIEditRequest = {
  project: DemoProject;
  selectedRange: SelectedRange;
  prompt: string;
};

export type MockAIEditProposal = {
  prompt: string;
  targetRange: SelectedRange;
  operations: AIEditOperation[];
  projectSlice: ProjectSlice;
};

function clampRange(range: SelectedRange, duration: number): SelectedRange {
  const start = Math.max(0, Math.min(duration, Math.min(range.start, range.end)));
  const end = Math.max(start, Math.min(duration, Math.max(range.start, range.end)));
  return { start, end };
}

export async function mockAIEditClient({
  project,
  selectedRange,
  prompt,
}: MockAIEditRequest): Promise<MockAIEditProposal> {
  const targetRange = clampRange(selectedRange, project.duration);
  const projectSlice = selectProjectSlice(project, targetRange);
  const safePrompt = prompt.trim() || "Polish the selected range.";
  const rangeDuration = targetRange.end - targetRange.start;
  const inset = Math.min(0.5, rangeDuration / 4);
  const operationStart = targetRange.start + inset;
  const operationEnd = targetRange.end - inset;

  const operations: AIEditOperation[] = [
    {
      type: "add_zoom",
      start: operationStart,
      end: operationEnd,
      target: { x: 620, y: 260, width: 620, height: 380 },
      easing: "easeInOut",
    },
  ];

  return { prompt: safePrompt, targetRange, operations, projectSlice };
}
