# MVP-003 Motion Preview Design

## Goal

Wire the existing motion-core utilities into editor preview so preview cursor, click, and camera behavior uses the same deterministic math intended for final export.

## Current State

`packages/editor/src/preview/Preview.tsx` currently renders:

- active zooms as a fixed rectangle overlay
- cursor and click positions with hardcoded `x / 19.2` and `y / 10.8`
- no actual media-layer camera transform

The reusable motion-core logic already exists under `packages/editor/src/motion`:

- `normalizeCursorTelemetry`
- `smoothCursorTelemetry`
- `normalizeZoomRegions`
- `resolveCameraTransformWithCursorFollow`

## Architecture

Add a small preview motion adapter in `packages/editor/src/preview/previewMotionState.ts`.
This adapter converts a `DemoProject` and timestamp into one render-ready state:

- active frame dimensions
- normalized and smoothed cursor sample
- active click indicators
- normalized zoom regions
- active camera transform

`Preview.tsx` should consume the adapter and render from normalized coordinates. It should not know about raw project pixel coordinate math beyond applying percentages and CSS transforms.

## Frame Selection

The preview frame comes from the active video asset when possible:

1. use active asset `width` and `height` if both are positive finite numbers
2. otherwise fall back to aspect-ratio dimensions:
   - `16:9` -> `1920x1080`
   - `9:16` -> `1080x1920`
   - `1:1` -> `1080x1080`

This keeps cursor positions correct for landscape, portrait, and square projects, even when fixture media is unavailable in the browser.

## Determinism

`resolveCameraTransformWithCursorFollow` is stateful because cursor-follow behavior remembers prior focus while zooming. Preview must still be deterministic when seeking backward and forward.

The adapter will reconstruct cursor-follow state from project data on every call:

1. build normalized zoom regions and smoothed cursor points
2. collect deterministic sample times up to the requested timestamp:
   - zoom start
   - zoom start plus transition duration
   - zoom end minus transition duration
   - cursor event times
   - requested timestamp
3. replay `resolveCameraTransformWithCursorFollow` from a fresh state in ascending time order
4. return the transform for the requested timestamp

This trades tiny preview CPU work for correctness and removes hidden mutable render state.

## Rendering

`Preview.tsx` will wrap the media/placeholder in a single transformed layer:

- `scale` comes from the camera transform
- `x` and `y` are normalized translation fractions from motion-core and applied as CSS percentages
- `transformOrigin` remains the center of the preview stage

Cursor and click indicators render from normalized cursor coordinates:

- `left: cursor.cx * 100%`
- `top: cursor.cy * 100%`

Active zoom should affect the actual media layer. The old static zoom rectangle overlay can be removed or reduced to a non-authoritative debug indicator. For MVP-003, removing the rectangle keeps preview behavior aligned with final export intent.

## Error Handling

Preview remains non-crashing:

- missing or browser-unsupported media still renders the existing placeholder
- invalid cursor events are filtered by `normalizeCursorTelemetry`
- invalid zoom ranges are filtered by `normalizeZoomRegions`
- missing dimensions use aspect-ratio fallback dimensions

## Tests

Add tests for the adapter and preview component:

- frame fallback returns correct dimensions for `16:9`, `9:16`, and `1:1`
- cursor positions are normalized from project dimensions, not hardcoded `1920x1080`
- active zoom changes the media-layer transform
- repeated calls at the same timestamp return identical state after seeking through other timestamps
- `Preview` renders transformed media/placeholder layer and cursor/click indicators from normalized positions

## Out Of Scope

- export rendering changes; that is MVP-005
- auto-zoom suggestion UI; that is MVP-004
- schema changes; schema review happens after preview/export prove the motion model
