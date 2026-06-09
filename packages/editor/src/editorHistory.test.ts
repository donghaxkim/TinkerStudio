import { describe, expect, it } from "vitest";
import type { EditorCommand } from "./editorHistory.js";
import {
  createEditorHistory,
  pushEditorCommand,
  redoEditorCommand,
  undoEditorCommand,
} from "./editorHistory.js";
import { sampleProject } from "./test/sampleProject.js";

function makeCommand(id: string): EditorCommand {
  const afterProject = {
    ...sampleProject,
    title: `${sampleProject.title} ${id}`,
  };

  return {
    type: "ai-edit",
    id,
    label: `AI edit ${id}`,
    beforeProject: sampleProject,
    afterProject,
  };
}

describe("editorHistory", () => {
  it("pushes a command onto the undo stack", () => {
    const command = makeCommand("one");
    const history = pushEditorCommand(createEditorHistory(), command);

    expect(history.past).toEqual([command]);
    expect(history.future).toEqual([]);
  });

  it("undo restores the exact previous project", () => {
    const command = makeCommand("one");
    const history = pushEditorCommand(createEditorHistory(), command);
    const result = undoEditorCommand(history, command.afterProject);

    expect(result.project).toBe(sampleProject);
    expect(result.history.past).toEqual([]);
    expect(result.history.future).toEqual([command]);
  });

  it("redo reapplies the after project", () => {
    const command = makeCommand("one");
    const history = pushEditorCommand(createEditorHistory(), command);
    const undoResult = undoEditorCommand(history, command.afterProject);
    const redoResult = redoEditorCommand(undoResult.history, undoResult.project);

    expect(redoResult.project).toBe(command.afterProject);
    expect(redoResult.history.past).toEqual([command]);
    expect(redoResult.history.future).toEqual([]);
  });

  it("new commands clear the redo stack", () => {
    const first = makeCommand("one");
    const second = makeCommand("two");
    const history = pushEditorCommand(createEditorHistory(), first);
    const undoResult = undoEditorCommand(history, first.afterProject);
    const nextHistory = pushEditorCommand(undoResult.history, second);

    expect(nextHistory.past).toEqual([second]);
    expect(nextHistory.future).toEqual([]);
  });

  it("keeps project unchanged when undo/redo has no command", () => {
    const history = createEditorHistory();

    expect(undoEditorCommand(history, sampleProject).project).toBe(sampleProject);
    expect(redoEditorCommand(history, sampleProject).project).toBe(sampleProject);
  });
});
