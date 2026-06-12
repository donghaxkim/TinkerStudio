# Person B Manual Edit Controls Design

## Status

Approved for implementation planning.

## Context

The editor can already load and preview a `DemoProject`, display timeline overlays, apply AI edit operations, and keep undo/redo command snapshots. The remaining Person B MVP gap is direct user-driven editing from the editor surface.

## Goal

Add manual edit controls for the existing demo-specific entities:

- captions
- callouts
- zooms
- clip trims

Manual edits must mutate `DemoProject`, not media files. The editor should validate the resulting project and push undoable `"manual-edit"` commands.

## Non-Goals

- No Create Demo UI changes.
- No schema changes.
- No general multi-track video editor.
- No visual drag handles on the timeline yet.
- No real media trimming or destructive asset editing.

## Boundaries

### `packages/editor`

Owns pure manual edit helpers and tests. Helpers should accept a `DemoProject`, return a validated project, and never mutate input.

### `apps/web/src/screens/Editor`

Owns the small React control surface that calls the pure helpers and pushes editor history.

## Required Behavior

- Add caption using the selected range.
- Add callout using the selected range.
- Add zoom using the selected range.
- Trim an existing clip by id.
- Delete existing caption, callout, or zoom by id.
- Validate every result with `DemoProjectSchema`.
- Surface validation errors instead of changing state.
- Push a `"manual-edit"` history command for successful edits.

## Implementation Plan

1. Add `packages/editor/src/manualEditOperations.ts`.
2. Add tests for add/update/delete caption, callout, zoom, trim clip, invalid ranges, unknown ids, immutability, and command labels.
3. Export helpers from `@tinker/editor`.
4. Add `EditorManualControls.tsx` under `apps/web/src/screens/Editor`.
5. Integrate it into `EditorScreen` without touching Create Demo files.
6. Add focused web component tests.

## Verification

```bash
pnpm --filter @tinker/editor test -- manualEditOperations
pnpm --filter @tinker/web test -- EditorManualControls
pnpm validate:schema
pnpm typecheck
pnpm -r test
pnpm --filter @tinker/web build
```
