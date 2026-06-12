# Schema change: `cursor` display settings (PB-006)

**Added by:** Person B
**Status:** NEEDS PERSON A REVIEW
**Package:** `@tinker/project-schema` (`packages/project-schema/src/validators.ts`, `types.ts`)

## What changed

A new **optional** top-level field `cursor` was added to `DemoProject`. It carries the
user-tunable *visible* cursor/click display settings. This is distinct from the existing
`cursorEvents` telemetry (recorded cursor moves/clicks); `cursor` controls how the cursor
and click emphasis are *rendered* in both the preview and the export.

```ts
cursor?: {
  hidden?: boolean;                          // hide the cursor overlay entirely
  clickEffect?: "ring" | "ripple" | "none";  // click emphasis style
  clickEffectDurationMs?: number;            // positive; how long the click emphasis shows
}
```

The object is validated with a `.strict()` Zod schema (unknown keys rejected), and the whole
`cursor` field is `.optional()`.

## Defaults (when `cursor` is absent or a member is omitted)

Resolved via the shared helper `resolveCursorSettings(project.cursor)`:

| field                  | default | rationale                                  |
| ---------------------- | ------- | ------------------------------------------ |
| `hidden`               | `false` | cursor shown (prior behavior)              |
| `clickEffect`          | `"ring"`| accent ring on clicks (prior behavior)     |
| `clickEffectDurationMs`| `500`   | matches the prior 0.5s click display window|

## Why it is backward compatible

- The field is `.optional()` — it is **never injected** and **never required**. Every existing
  project and any generated output that omits `cursor` continues to validate unchanged.
- `resolveCursorSettings(undefined)` returns the exact prior behavior, so preview and export are
  byte-for-byte identical for projects without a `cursor` field (covered by a parity test).
- No existing field was changed.

Tests proving this live in `packages/project-schema/src/validators.test.ts`
("cursor display settings (PB-006, Person B)").

## Parity mechanism (preview ↔ export)

Both consumers read the field through the single shared resolver `resolveCursorSettings`:

- Preview: `packages/editor/src/preview/previewMotionState.ts` + `Preview.tsx`.
- Export: `packages/rendering/src/node/ffmpegFilterGraph.ts` (`appendCursorFilters`).

`hidden` suppresses the cursor in both; `clickEffect:"none"` suppresses click emphasis in both;
`clickEffectDurationMs` drives the click-emphasis display window in both. The preview/export
parity is asserted in `packages/rendering/src/node/previewExportParity.test.ts`
("preview/export cursor-settings parity (PB-006)").

## Person A review asks

1. Should generated `DemoProject` output set `cursor` explicitly, or rely on the defaults above?
2. Confirm `"ring" | "ripple" | "none"` is the right enum for the generation side.
3. Keep the field **optional** — do not promote it to required on the generation side.
