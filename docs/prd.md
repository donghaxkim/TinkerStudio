# Tinker PRD

## Summary

Tinker helps builders turn a product repo and running product URL into an editable demo video project. The product state is a `DemoProject`; MP4 files are export artifacts generated from that state.

## Users

- Founders and product engineers who need polished product demos quickly.
- Agent-assisted builders who want a deterministic capture and editing loop.
- Teams that want reusable demo project state rather than one-off screen recordings.

## MVP Workflow

1. User enters a repo URL, product/local app URL, prompt, duration, and aspect ratio.
2. Tinker generates or loads a valid `DemoProject`.
3. User reviews the project in the editor.
4. User adjusts trims, zoom/camera motion, cursor/click effects, and AI edit proposals.
5. User saves the edited `DemoProject`.
6. User exports an MP4 artifact from the current project state.

## MVP Requirements

- Load and validate `DemoProject` JSON.
- Display preview, timeline, overlays, selected range, and project metadata.
- Support manual edits for trims, zoom/camera motion, and cursor/click effects.
- Support AI edit proposals that can be previewed, accepted, rejected, and undone.
- Persist full `DemoProject` JSON.
- Export MP4 from current project state.

## Non-Goals

- General-purpose video editing.
- Desktop app before the web loop is solid.
- Direct AI mutation of video files.
- Captions, callouts, text overlays, or text rendering.
- Audio/voiceover timeline or audio mixing.
- Private repo setup or dependency installation during generation.
- Secrets or API key management in the local prototype.

## Acceptance Criteria

- Typecheck and relevant tests pass.
- A valid sample `DemoProject` opens in the editor.
- A user can make at least one manual edit and undo it.
- Export verification can render and probe an MP4 artifact.
- Missing media assets show placeholders instead of crashing.
