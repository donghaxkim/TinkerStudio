# Contextual Zoom Properties — Design

**Date:** 2026-06-16
**Owner:** Person B (editor / UI)
**Branch:** `person-b/zoom-properties`

## Goal

When a zoom unit on the dedicated Zoom track is selected, let the user manually edit its
properties — scale/intensity, easing, start/end/duration — from the existing right panel,
with an editable target overlay in the preview. Manual zoom editing should feel Screen
Studio–like: simple, visual, polished. All edits ride the existing undo/redo history.

## Decisions (confirmed with user)

1. **Entry point:** a dedicated **Zoom tab** in the chat panel's tab strip. It appears and
   auto-activates the moment a zoom unit is selected; the **Chat tab stays present** so chat
   is one click away. Chat state (instruction draft, context chips) is preserved while the
   Zoom tab is active — it is hidden, not reset.
2. **Preview overlay:** the target box is **drag-to-move (focal point) + corner-resize
   (scale)**. The gesture previews live and commits a **single** undo step on release. The
   panel's scale slider stays in sync with the box.
3. **Placement:** the properties form **replaces** the chat body while the Zoom tab is
   active. Selecting the Chat tab (the "Done" path) returns to chat.

## Model changes (`packages/editor/src/composition/compositionTimelineModel.ts`)

Extend `ZoomUnit` with three **optional** look properties so existing fixtures, snapshots,
and the `addZoom` create path stay valid (defaults are applied at read time):

```ts
export type ZoomEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out";
export type ZoomTarget = { x: number; y: number }; // focal point, 0..1 of the frame

export type ZoomUnit = {
  id: string;
  start: number;
  end: number;
  scale?: number;        // punch-in level; default DEFAULT_ZOOM_SCALE
  easing?: ZoomEasing;   // transition curve; default DEFAULT_ZOOM_EASING
  target?: ZoomTarget;   // default DEFAULT_ZOOM_TARGET (center)
};
```

Constants + accessors (defaults live in one place):

```ts
export const MIN_ZOOM_SCALE = 1;
export const MAX_ZOOM_SCALE = 3;
export const DEFAULT_ZOOM_SCALE = 1.6;
export const DEFAULT_ZOOM_EASING: ZoomEasing = "ease-in-out";
export const DEFAULT_ZOOM_TARGET: ZoomTarget = { x: 0.5, y: 0.5 };

export function zoomScale(u: ZoomUnit): number;       // u.scale ?? default, clamped
export function zoomEasing(u: ZoomUnit): ZoomEasing;  // u.easing ?? default
export function zoomTarget(u: ZoomUnit): ZoomTarget;  // u.target ?? default
```

## Edit operation (`compositionEdits.ts`)

One new pure op for the *look* properties:

```ts
export type ZoomPropsPatch = Partial<{ scale: number; easing: ZoomEasing; target: ZoomTarget }>;
export function updateZoom(model, id, patch: ZoomPropsPatch): CompositionTimelineModel;
```

- Clamps `scale` to `[MIN_ZOOM_SCALE, MAX_ZOOM_SCALE]`, `target.x/y` to `[0,1]`.
- Merges into the unit; **returns the same model reference when nothing changes** (the
  established no-op convention) so the undo history stays clean.

**Timing** (start/end/duration) reuses the existing clamped ops — no new code:
- start input → `resizeZoom(id, "start", value)`
- end input → `resizeZoom(id, "end", value)`
- duration input → `resizeZoom(id, "end", start + value)`

Reset = `updateZoom` back to the three defaults (resets the *look*, not the timing).
Remove = existing `removeZoom`.

## Hook (`useTimelineEdits.ts`)

Add `updateZoom(id, patch)` mirroring the other zoom callbacks — routed through `apply`, so
undo/redo is automatic and no-ops don't dirty history.

## Components

### `ZoomProperties.tsx` (new, `packages/editor/src/composition/`)

Pure presentational form. Props: `unit`, `durationSeconds`, and callbacks
`onScale`/`onEasing`/`onStart`/`onEnd`/`onDuration`/`onReset`/`onRemove`/`onClose`.
Renders: a scale **slider + numeric readout**, an **easing** `select`, **start/end/duration**
number inputs, **Reset** and **Remove** buttons. The scale slider previews via local draft
state and commits `onScale` on release (pointer/mouse up, keyup, blur) → one undo step.
Discrete controls (easing, number inputs) commit on `change`.

### `CompositionPreview.tsx` (overlay)

New optional prop:

```ts
zoomOverlay?: {
  scale: number;
  target: ZoomTarget;
  onMoveTarget?: (t: ZoomTarget) => void;
  onScale?: (s: number) => void;
};
```

When present (a zoom is selected) renders a target box **inside `frameRef`** (so it aligns
with the letterboxed video, not the stage). Geometry: the box is the visible region after
zoom — width/height = `1/scale` of the frame, centered on `target`, clamped to stay in
frame. Body drag moves the target; corner handles resize → change scale (symmetric about
the center, horizontal extent drives `scale`). Live local preview during the gesture;
commit once on release via `onMoveTarget` / `onScale`. Mouse-event fallback mirrors
`ZoomTrack`/timeline for jsdom.

### `CompositionChatPanel.tsx` (host)

The right panel hosts the properties — no separate inspector. New optional props:
- `zoomProperties?: ReactNode` — when set, the panel shows a **Zoom** tab (active) and
  renders this node as the panel body in place of the composer/thread.
- `zoomTabActive?: boolean` + `onSelectChatTab?: () => void` / `onSelectZoomTab?: () => void`
  — tab strip wiring. The Chat tab remains and switches back without losing chat state.

### `CompositionEditorScreen.tsx` (wiring)

- Derive `selectedZoom = model.zooms.find(z => z.id === selectedZoomId)`. If it's gone
  (e.g. an undo removed it), the Zoom tab disappears — no stale unit stored.
- `zoomTab` state: selecting a zoom sets the active tab to `"zoom"`; selecting the Chat tab
  (or Remove) returns to `"chat"`.
- Pass `zoomOverlay` to `CompositionPreview` only when a zoom is selected.
- Map the panel/overlay callbacks to `updateZoom` (scale/easing/target), `resizeZoom`
  (start/end/duration), `updateZoom`-to-defaults (reset), `removeZoom` (remove).

## Data flow

```
ZoomProperties / preview overlay
        │ onScale/onEasing/onTarget/onStart/onEnd/onDuration/onReset/onRemove
        ▼
CompositionEditorScreen handlers
        │ updateZoom / resizeZoom / removeZoom  (via useTimelineEdits.apply)
        ▼
   model.zooms[i]  ──►  ZoomTrack block (timeline updates: start/end/duration)
                   └──►  preview overlay box (preview updates: scale/target)
```

## Undo/redo

Every edit goes through `apply`, which snapshots the model and clears the redo future.
No-op merges return the same reference → no spurious history entries. A drag gesture
(overlay move/resize) commits exactly once on release. The scale slider commits once per
adjustment (on release).

## Testing

- **`compositionEdits.test.ts`** — `updateZoom`: clamps scale/target, merges, no-op
  returns same ref, resets to defaults.
- **`compositionTimelineModel.test.ts`** — `zoomScale/zoomEasing/zoomTarget` defaults +
  clamping.
- **`useTimelineEdits.test.ts`** — `updateZoom` undo/redo; no-op doesn't dirty history.
- **`ZoomProperties.test.tsx`** — each control fires the right callback with the right
  value; slider commits on release; Reset/Remove.
- **`CompositionPreview.test.tsx`** — overlay renders at the right box geometry for a
  scale/target; drag moves target (commit on release); corner drag changes scale.
- **`CompositionChatPanel.test.tsx`** — Zoom tab appears with `zoomProperties`, replaces
  the composer; Chat tab returns and chat state is intact.
- **`CompositionEditorScreen.test.tsx`** — end-to-end: select zoom → Zoom tab opens →
  change scale (overlay box resizes) → undo restores → Remove closes the tab and clears
  selection; start/end/duration edits move the track block.

## Out of scope / follow-ups

- Applying the zoom transform to the iframe content itself (the overlay communicates the
  framing; actual punch-in rendering stays with the pipeline/export path).
- Per-keystroke vs. blur commit for number inputs (commit-on-change is acceptable for v1).
