# Project Persistence Implementation Plan

> **For Hermes:** Implement with TDD. Keep changes inside Person B-owned app/editor paths. Do not push.

**Goal:** Save/load full `DemoProject` JSON in the local web editor.

**Architecture:** Pure persistence helpers live in `packages/editor`; browser storage/download helpers live in `apps/web`; the editor screen composes save/load controls and only accepts validated projects.

**Tech Stack:** TypeScript, Zod via `@tinker/project-schema`, React, Vitest, Testing Library, browser `localStorage`/File APIs.

---

## Task 1: Pure DemoProject JSON persistence

**Files:**
- Create: `packages/editor/src/project/projectPersistence.ts`
- Create: `packages/editor/src/project/projectPersistence.test.ts`
- Modify: `packages/editor/src/index.ts`

**Steps:**
1. Write failing tests for valid serialization, valid deserialization, invalid JSON, invalid schema, and validation issue formatting.
2. Implement `serializeDemoProject`, `deserializeDemoProjectJson`, and `formatProjectValidationIssues`.
3. Export the helpers from `@tinker/editor`.
4. Run `pnpm --filter @tinker/editor test -- projectPersistence`.

## Task 2: Browser storage/download helpers

**Files:**
- Create: `apps/web/src/lib/projectStorage.ts`
- Create: `apps/web/src/lib/projectStorage.test.ts`

**Steps:**
1. Write failing tests for local-storage save/load round-trip, invalid stored JSON, invalid stored project, and deterministic download payloads.
2. Implement `LOCAL_PROJECT_STORAGE_KEY`, `saveProjectToStorage`, `loadProjectFromStorage`, and `createProjectJsonDownload`.
3. Run `pnpm --filter @tinker/web test -- projectStorage`.

## Task 3: Editor save/load UI

**Files:**
- Create: `apps/web/src/screens/Editor/ProjectSaveLoadControls.tsx`
- Create: `apps/web/src/screens/Editor/ProjectSaveLoadControls.test.tsx`
- Modify: `apps/web/src/screens/Editor/EditorScreen.tsx`
- Modify: `apps/web/src/App.test.tsx`

**Steps:**
1. Write failing component tests for saving, loading, invalid saved-project errors, valid JSON file import, and invalid JSON file import.
2. Implement controls for Save project, Load saved project, Download JSON, and Load project JSON file.
3. Integrate controls into `EditorScreen`; on validated load, replace project and reset preview/history/current-time state.
4. Run `pnpm --filter @tinker/web test -- ProjectSaveLoadControls` and `pnpm --filter @tinker/web test -- App`.

## Final verification

Run from repo root:

```bash
pnpm validate:schema
pnpm typecheck
pnpm -r test
pnpm --filter @tinker/web build
```

Do not push. Commit locally after the gate passes.
