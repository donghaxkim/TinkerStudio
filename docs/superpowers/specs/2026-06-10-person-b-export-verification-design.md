# Person B Export Verification Design

## Status

Approved for implementation planning.

## Context

`@tinker/rendering` already builds a browser-safe render plan and exposes a Node ffmpeg renderer. The export panel currently previews artifact metadata, but the MVP checklist still needs proof that a rendered MP4 plays and that project edits affect export output.

## Goal

Add a repeatable export verification path that renders the sample project to MP4, probes it, and tests that edited project state changes the render plan/output semantics.

## Non-Goals

- No browser-triggered MP4 download yet.
- No Create Demo UI changes.
- No replacement renderer.
- No real captured media dependency; placeholder rendering remains acceptable for v0.

## Boundaries

### `packages/rendering`

Owns Node export verification helpers, tests, and CLI behavior.

### `packages/editor/src/export`

Owns browser-safe export readiness only.

## Required Behavior

- Render sample `DemoProject` to MP4 using ffmpeg.
- Probe the MP4 with ffprobe when available.
- Verify duration, container, and video/audio streams.
- Verify accepted edits or manual edits change the render plan layer list.
- Keep tests deterministic without requiring ffmpeg for ordinary unit tests.

## Implementation Plan

1. Add a small ffprobe helper or script in `packages/rendering/src/node`.
2. Add injectable-command tests so ffprobe behavior is unit-testable.
3. Add render-plan regression tests for changed caption/callout/zoom/project state.
4. Keep real ffmpeg/ffprobe verification as a documented command or script.

## Verification

```bash
pnpm --filter @tinker/rendering test
pnpm --filter @tinker/rendering render:sample -- /tmp/tinker-sample-export.mp4
ffprobe -v error -show_entries format=format_name,duration -show_entries stream=codec_name,codec_type -of json /tmp/tinker-sample-export.mp4
pnpm validate:schema
pnpm typecheck
pnpm -r test
```

