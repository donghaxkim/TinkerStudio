import type { DemoProject } from "@tinker/project-schema";

export type EditorCommandType = "ai-edit" | "manual-edit";

export type EditorCommand = {
  type: EditorCommandType;
  id: string;
  label: string;
  beforeProject: DemoProject;
  afterProject: DemoProject;
};

export type EditorHistory = {
  past: EditorCommand[];
  future: EditorCommand[];
};

export type HistoryStepResult = {
  history: EditorHistory;
  project: DemoProject;
  command?: EditorCommand;
};

export function createEditorHistory(): EditorHistory {
  return { past: [], future: [] };
}

export function pushEditorCommand(history: EditorHistory, command: EditorCommand): EditorHistory {
  return {
    past: [...history.past, command],
    future: [],
  };
}

export function undoEditorCommand(history: EditorHistory, currentProject: DemoProject): HistoryStepResult {
  const command = history.past.at(-1);
  if (!command) {
    return { history, project: currentProject };
  }

  return {
    history: {
      past: history.past.slice(0, -1),
      future: [command, ...history.future],
    },
    project: command.beforeProject,
    command,
  };
}

export function redoEditorCommand(history: EditorHistory, currentProject: DemoProject): HistoryStepResult {
  const command = history.future[0];
  if (!command) {
    return { history, project: currentProject };
  }

  return {
    history: {
      past: [...history.past, command],
      future: history.future.slice(1),
    },
    project: command.afterProject,
    command,
  };
}
