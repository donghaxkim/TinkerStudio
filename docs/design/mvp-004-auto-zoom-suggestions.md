# MVP-004 Auto-Zoom Suggestion Flow Design

## Goal

Add an editor flow that proposes zoom keyframes from cursor dwell, previews them without mutating the project, and applies accepted suggestions through the existing undoable command path.

## Current State

The pure motion utility already exists:

- `packages/editor/src/motion/autoZoomSuggestions.ts`
- `suggestAutoZooms(cursorEvents, existingZooms, options)`

The editor already has:

- `Preview` that renders project zooms through motion-core camera transforms
- manual zoom operations through `applyManualEditOperation`
- undo/redo through `EditorCommand` and `pushEditorCommand`
- a temporary `previewProject` state used by the AI edit panel

## Architecture

Add a pure helper under `packages/editor/src/autoZoomSuggestionFlow.ts`:

- `buildAutoZoomSuggestionState(project)` returns proposed zooms plus a `previewProject`
- `acceptAutoZoomSuggestions(project, suggestions)` validates and applies suggestions into one undoable `EditorCommand`

Then add a small `EditorAutoZoomPanel` in the web editor:

- “Suggest zooms” generates suggestions and sets `previewProject`
- suggestions are shown as proposed rows
- “Accept all” applies suggestions to the real project and pushes the returned command
- “Reject” clears suggestions and preview state

## Frame Selection

The suggestion helper needs a frame for `suggestAutoZooms`. It should use the same deterministic frame policy as motion preview:

1. primary/active video asset dimensions if present
2. fallback by project aspect ratio:
   - `16:9` -> `1920x1080`
   - `9:16` -> `1080x1920`
   - `1:1` -> `1080x1080`

## Preview-Only Behavior

Generating suggestions must not mutate the real `DemoProject`.

The helper returns:

```ts
{
  suggestions,
  previewProject: {
    ...project,
    zooms: [...project.zooms, ...suggestions]
  }
}
```

The web panel owns that preview state until accept/reject.

## Accept Behavior

Accepting suggestions should:

- return unchanged/error if there are no suggestions
- apply each suggestion through `applyManualEditOperation`
- validate each intermediate project
- return one aggregate `EditorCommand` with:
  - `type: "manual-edit"`
  - `label: "Accept auto zoom suggestions"`
  - `beforeProject` as the original project
  - `afterProject` as the final project

This keeps one undo action for a batch of suggestions, which is better UX than requiring multiple undos for one “Accept all” action.

## Duplicate/Overlap Avoidance

`suggestAutoZooms` already avoids existing zoom overlaps by default. The helper will keep `excludeExistingZooms` enabled and use deterministic ids with the existing `auto_zoom` prefix.

## Error Handling

The UI should handle:

- no cursor dwell found
- no suggestions because all candidates overlap existing zooms
- validation failure while accepting suggestions

Errors stay in the auto-zoom panel and do not corrupt the project.

## Tests

Add tests for:

- suggestions are deterministic for the same cursor events
- generated preview project includes proposed zooms while original project is unchanged
- existing zoom overlap suppresses duplicate suggestions
- accepting suggestions returns one undoable command
- rejecting suggestions leaves the project unchanged in the web flow
- accepting in the web flow enables Undo and restores the previous project

## Out Of Scope

- automatically selecting one suggestion
- per-suggestion accept/reject
- timeline-specific proposed zoom rendering beyond previewing the temporary project
- export rendering of zoomed media; that is MVP-005
