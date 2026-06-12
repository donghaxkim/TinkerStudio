# Person B App Metadata and Favicon Design

## Status

Approved for implementation planning.

## Context

The local web app reports a missing `favicon.ico` in the browser console. Metadata is still generic and can be improved without touching Create Demo screen code.

## Goal

Add minimal app metadata and a favicon so the local app looks intentional and the browser console is clean.

## Non-Goals

- No full brand system.
- No Create Demo redesign.
- No generated bitmap logo.
- No app navigation changes.

## Boundaries

### `apps/web/index.html`

Owns page title, description, theme color, and favicon link.

### `apps/web/public`

Owns static favicon asset.

## Required Behavior

- Browser can load a favicon without a 404.
- Page title and description identify Tinker as a demo-generation/editor app.
- Metadata remains small and production-safe.

## Implementation Plan

1. Add an SVG favicon under `apps/web/public`.
2. Link it from `apps/web/index.html`.
3. Add title/description/theme metadata.
4. Verify the app no longer 404s favicon.

## Verification

```bash
pnpm --filter @tinker/web build
```

