# MVP-009 Preview/Export Parity Design

## Goal

Make preview and export prove they use the same camera/cursor motion math so the MP4 matches what the editor communicates.

## Source Of Truth

- `docs/core-mvp-checklist.md` MVP-009
- `docs/design/mvp-003-motion-preview.md`
- `docs/design/mvp-005-real-media-export.md`
- `packages/motion/src/cameraTransform.ts`
- `packages/motion/src/cursorTelemetry.ts`
- `packages/editor/src/preview/previewMotionState.ts`
- `packages/rendering/src/node/ffmpegFilterGraph.ts`

## Current Baseline

Already done:

- Preview resolves camera state through `resolveCameraTransformWithCursorFollow`.
- Preview reconstructs cursor-follow state deterministically when seeking.
- Export uses shared zoom normalization and applies camera crop/scale stages.
- Export already maps cursor/click positions from source coordinates to padded output coordinates.

Known gap:

- Export camera intervals are static windows sampled with `resolveCameraTransform`.
- Preview uses cursor-follow and transition/easing strength at timestamps.
- Export does not yet sample ramp/easing or cursor-follow at frame cadence.

## Design

### Shared Deterministic Camera Resolver

Move preview's deterministic reconstruction logic into `@tinker/motion` as a pure helper:

```ts
resolveDeterministicCameraTransform(regions, cursorPoints, time, options)
```

It should:

- collect relevant prior sample times from zoom starts/transition boundaries/cursor events
- replay `resolveCameraTransformWithCursorFollow` from a fresh state
- return the same `CameraTransform` for the same input regardless of previous seeks

Preview should call this helper instead of owning a private copy.

### Export Frame-Sampled Camera Intervals

Export should build camera intervals from frame samples:

- sample at `1 / fps` cadence
- include every frame start plus the final duration boundary
- resolve each sample with the shared deterministic camera helper
- merge adjacent intervals when the resulting static crop/scale filter is identical

This keeps ffmpeg output simple: split/trim/static crop/scale/concat. It avoids per-frame expression complexity while making ramp/easing and cursor-follow visible in exported frames.

### Shared Coordinate Normalization

Preview and export should continue to normalize cursor and zoom coordinates through:

- `normalizeCursorTelemetry`
- `smoothCursorTelemetry`
- `normalizeZoomRegions`

MVP-009 tests should prove aspect-ratio fixtures do not misplace focus/cursor by comparing normalized transform/focus values at fixed timestamps.

### Verification Strategy

Add tests that compare preview and export camera transforms directly at fixed timestamps. Because ffmpeg graph strings are an implementation detail, export should expose a testable camera interval builder from `ffmpegFilterGraph.ts`.

Coverage:

- same project/time yields same preview and export camera transform
- aspect ratios preserve focus dimensions and output cursor placement
- ramp/easing samples change during transition instead of staying static
- cursor-follow can move export camera focus the same way preview does

## Non-Goals

- No new schema fields.
- No real per-fixture MP4 exports for every parity case.
- No audio/text/caption/callout behavior.
- No generalized rendering engine replacement.

## Acceptance Evidence

MVP-009 is complete when:

- preview and export share deterministic motion transform calculation
- preview and export share coordinate normalization utilities
- camera transform snapshots pass at fixed timestamps
- export camera intervals show frame-sampled ramp/easing behavior
- cursor-follow parity is covered
- aspect ratio checks prove cursor/focus placement does not drift
- full verification passes
