# MVP-004 Auto-Zoom Suggestion Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an editor auto-zoom suggestion flow that previews cursor-dwell zooms without mutation and accepts them as one undoable command.

**Architecture:** Implement pure suggestion/accept helpers in `packages/editor`, then mount a small web panel in `apps/web/src/screens/Editor`. The helper delegates suggestion generation to `suggestAutoZooms`, builds a preview project, and applies accepted suggestions through `applyManualEditOperation` plus the existing `EditorCommand` history path.

**Tech Stack:** TypeScript, React, Vitest, Testing Library, existing `@tinker/editor` motion/manual edit/history utilities.

---

## File Structure

- Create: `packages/editor/src/autoZoomSuggestionFlow.ts`
- Create: `packages/editor/src/autoZoomSuggestionFlow.test.ts`
- Modify: `packages/editor/src/index.ts`
- Create: `apps/web/src/screens/Editor/EditorAutoZoomPanel.tsx`
- Create: `apps/web/src/screens/Editor/EditorAutoZoomPanel.test.tsx`
- Modify: `apps/web/src/screens/Editor/EditorScreen.tsx`
- Modify: `apps/web/src/App.test.tsx` if needed
- Modify: `docs/core-mvp-checklist.md`
- Modify: `docs/dongha.md`

---

### Task 1: Pure Auto-Zoom Suggestion Helper

**Files:**
- Create: `packages/editor/src/autoZoomSuggestionFlow.ts`
- Create: `packages/editor/src/autoZoomSuggestionFlow.test.ts`
- Modify: `packages/editor/src/index.ts`

- [x] **Step 1: Write failing helper tests**

Add tests that prove:

```ts
const state = buildAutoZoomSuggestionState(projectWithDwell);
expect(state.suggestions).toHaveLength(1);
expect(state.previewProject.zooms).toHaveLength(projectWithDwell.zooms.length + 1);
expect(projectWithDwell.zooms).toHaveLength(0);
```

Also test:

- repeated calls with the same project return the same suggestions
- suggestions overlap existing zooms only when explicitly allowed; default should avoid overlap
- `acceptAutoZoomSuggestions` returns one `manual-edit` command with undo snapshots

- [x] **Step 2: Run red tests**

Run:

```bash
pnpm --filter @tinker/editor test -- src/autoZoomSuggestionFlow.test.ts
```

Expected: fail because the module does not exist.

- [x] **Step 3: Implement helper**

Implement:

```ts
export type AutoZoomSuggestionState = {
  suggestions: ZoomKeyframe[];
  previewProject: DemoProject;
  frame: MotionFrame;
};

export type AcceptAutoZoomSuggestionsResult =
  | { ok: true; project: DemoProject; command: EditorCommand }
  | { ok: false; error: ManualEditOperationsError };
```

Use:

- `suggestAutoZooms`
- `applyManualEditOperation`
- deterministic frame inference from asset dimensions or aspect ratio
- one aggregate command labeled `Accept auto zoom suggestions`

- [x] **Step 4: Export helper**

Export the helper types/functions from `packages/editor/src/index.ts`.

- [x] **Step 5: Run green helper tests**

Run:

```bash
pnpm --filter @tinker/editor test -- src/autoZoomSuggestionFlow.test.ts
```

Expected: pass.

---

### Task 2: Editor Auto-Zoom Panel

**Files:**
- Create: `apps/web/src/screens/Editor/EditorAutoZoomPanel.tsx`
- Create: `apps/web/src/screens/Editor/EditorAutoZoomPanel.test.tsx`
- Modify: `apps/web/src/screens/Editor/EditorScreen.tsx`

- [x] **Step 1: Write failing panel tests**

Add tests that prove:

```ts
fireEvent.click(screen.getByRole("button", { name: "Suggest zooms" }));
expect(screen.getByText(/proposed zoom/i)).toBeInTheDocument();
expect(onPreviewProjectChange).toHaveBeenCalledWith(expect.objectContaining({
  zooms: expect.arrayContaining([expect.objectContaining({ id: expect.stringMatching(/^auto_zoom_/) })]),
}));
```

Also test:

- Reject clears preview and does not call `onAccept`
- Accept all calls `onAccept(updatedProject, command)` with command label `Accept auto zoom suggestions`
- No suggestions shows a non-crashing status message

- [x] **Step 2: Run red panel tests**

Run:

```bash
pnpm --filter @tinker/web test -- src/screens/Editor/EditorAutoZoomPanel.test.tsx
```

Expected: fail because the component does not exist.

- [x] **Step 3: Implement panel**

Props:

```ts
type EditorAutoZoomPanelProps = {
  project: DemoProject;
  onPreviewProjectChange: (project: DemoProject | undefined) => void;
  onAccept: (project: DemoProject, command: EditorCommand) => void;
};
```

The component should:

- call `buildAutoZoomSuggestionState(project)` on “Suggest zooms”
- show proposed zoom count and ranges
- call `onPreviewProjectChange(state.previewProject)`
- call `acceptAutoZoomSuggestions(project, state.suggestions)` on “Accept all”
- call `onPreviewProjectChange(undefined)` on reject

- [x] **Step 4: Wire into EditorScreen**

Mount `EditorAutoZoomPanel` near manual edit controls or the AI panel. Use the same history path as manual/AI edits:

```ts
onAccept={(updatedProject, command) => {
  setProject(updatedProject);
  setPreviewProject(undefined);
  setHistory((currentHistory) => pushEditorCommand(currentHistory, command));
}}
```

- [x] **Step 5: Run green web tests**

Run:

```bash
pnpm --filter @tinker/web test -- src/screens/Editor/EditorAutoZoomPanel.test.tsx src/App.test.tsx
```

Expected: pass.

---

### Task 3: Verification, Docs, And Review

**Files:**
- Modify: `docs/core-mvp-checklist.md`
- Modify: `docs/dongha.md`
- Modify: `docs/plans/mvp-004-auto-zoom-suggestions-plan.md`

- [x] **Step 1: Run focused verification**

Run:

```bash
pnpm --filter @tinker/editor test -- src/autoZoomSuggestionFlow.test.ts src/motion/autoZoomSuggestions.test.ts src/manualEditOperations.test.ts
pnpm --filter @tinker/web test -- src/screens/Editor/EditorAutoZoomPanel.test.tsx src/App.test.tsx
```

Expected: pass.

- [x] **Step 2: Run required verification gate**

Run:

```bash
pnpm validate:schema
pnpm typecheck
pnpm -r test
pnpm --filter @tinker/web build
```

Expected: all pass.

- [x] **Step 3: Update checklists**

Mark MVP-004 complete only if all checklist and acceptance criteria are satisfied by current evidence.

- [x] **Step 4: Review with agent**

Spawn a review agent to compare `docs/core-mvp-checklist.md`, this plan, the design doc, and implementation. If it finds issues, spawn a fixer agent with exact findings, verify locally, then spawn another review agent for re-review.
