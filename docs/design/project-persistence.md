# Project Persistence Design

Source of truth: `docs/vision.md`, `docs/architecture.md`, `docs/dongha.md`, and `packages/project-schema/README.md`. `docs/prd.md` is empty.

## Goal

Let the local web editor save and reload the current editable `DemoProject` as JSON without changing schema semantics. MP4 remains an export artifact; this task persists only project state.

## Decision

Use two V1 persistence paths:

1. Browser local storage for a temporary local prototype snapshot.
2. JSON file import/download for explicit user-controlled save/load.

No local API or filesystem backend is introduced in this branch. The interface is kept small so a later local API can replace storage without touching schema or editor internals.

## Boundaries

- `packages/editor/src/project/projectPersistence.ts`
  - Pure serialization/deserialization helpers.
  - Validates with `DemoProjectSchema` on save and load.
  - Formats validation errors for UI reuse.
- `apps/web/src/lib/projectStorage.ts`
  - Browser storage and download payload helpers.
  - Owns the local-storage key.
- `apps/web/src/screens/Editor/ProjectSaveLoadControls.tsx`
  - Save, load, download, and file-import controls.
  - Calls back with a validated `DemoProject` only after load succeeds.

No Person A packages are imported. No schema changes are needed.

## Rules

- Save the full parsed `DemoProject` JSON, including assets, tracks, captions, zooms, cursor events, callouts, AI edit history, and metadata.
- Validate before saving and before opening a loaded project.
- Show parse/schema/storage/file-read errors instead of opening invalid state.
- Preserve asset references by `asset.id`; do not duplicate asset paths into persistence metadata.
- Reset preview/history state after loading a different project snapshot.

## Acceptance criteria

- Valid projects serialize to pretty JSON and round-trip exactly after schema parsing.
- Invalid JSON fails with a parse error.
- Invalid project JSON fails with schema validation issues.
- Browser storage save/load round-trips the full project.
- Web UI exposes Save, Load saved, Download JSON, and Load project JSON file controls.
- Loaded projects replace the editor state only after validation.
