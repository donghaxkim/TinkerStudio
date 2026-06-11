# Person B Settings Screen Design

## Status

Approved for implementation planning.

## Context

`apps/web/src/screens/Settings` exists only as a placeholder directory. Create Demo and Editor already run locally with mock generation and local project persistence. The V1 settings screen should stay minimal and avoid taking over app navigation while the Create Demo redesign is in progress.

## Goal

Add a minimal settings surface for local prototype configuration:

- generation mode display
- local project storage key
- default output directory hint
- reset local project storage

## Non-Goals

- No Create Demo layout/nav changes.
- No API key handling.
- No secrets.
- No full preferences system.
- No desktop settings.

## Boundaries

### `apps/web/src/screens/Settings`

Owns the component and tests.

### `apps/web/src/lib/projectStorage.ts`

May expose storage-key/reset helpers if needed.

## Required Behavior

- Render minimal settings with current local/mock assumptions.
- Show the browser storage key used for saved projects.
- Provide a reset button for local saved project state.
- Do not require adding route/nav until the main app shell is redesigned.

## Implementation Plan

1. Add `SettingsScreen.tsx`.
2. Add tests for rendering and reset behavior.
3. Export storage key/reset helper from project storage if needed.
4. Leave app shell integration to the Create Demo redesign.

## Verification

```bash
pnpm --filter @tinker/web test -- SettingsScreen
pnpm --filter @tinker/web typecheck
pnpm --filter @tinker/web build
```

