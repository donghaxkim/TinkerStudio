# Rendering / Export v0 Design

## Goal

Add the first MP4 export path for a validated `DemoProject`. `DemoProject` stays the source of truth; the MP4 is only an artifact generated from the current project state.

## Scope

Owned paths only:

- `packages/rendering`
- `packages/editor/src/export`
- `apps/web/src/screens/Editor`

This task does not change schema, generation, capture, or API contracts.

## Decision

Use a boring local ffmpeg renderer for v0.

Reasons:

- ffmpeg is already available in the local development environment.
- MP4 generation in the browser is not reliably supported without a heavier dependency or a local API/worker.
- A Node renderer can be tested with fake process execution and verified for real by rendering the sample project to an MP4 and probing it with `ffprobe`.

## Architecture

```text
DemoProject
  -> @tinker/rendering buildFinalRenderPlan(project)
  -> @tinker/rendering/node renderFinalToMp4(project, outputPath)
  -> MP4 artifact
```

The web editor uses the browser-safe render plan to show export readiness and the intended MP4 artifact details. The actual local renderer is exposed from a Node-only subpath so browser bundles do not import `child_process`.

## Export semantics v0

The renderer validates the project and builds a deterministic composition from:

- project duration, fps, aspect ratio
- video/audio clips as timeline layers
- captions
- zoom target boxes
- callouts
- cursor/click markers

Because the sample fixture references placeholder asset paths that are not present yet, v0 renders a visual placeholder timeline with overlays into MP4. This proves the export loop and makes editor state visible in the artifact without pretending missing capture assets exist.

## Non-goals

- No general video editor renderer.
- No schema changes.
- No API worker.
- No Electron path.
- No direct AI mutation of video files.
- No JSON/project export from the export action.

## Verification

Run:

```bash
pnpm validate:schema
pnpm typecheck
pnpm -r test
pnpm --filter @tinker/rendering build
pnpm --filter @tinker/rendering render:sample -- /tmp/tinker-sample-export.mp4
ffprobe -v error -show_entries format=format_name,duration -show_entries stream=codec_name,codec_type -of json /tmp/tinker-sample-export.mp4
pnpm --filter @tinker/web build
```
