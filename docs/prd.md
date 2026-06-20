# Tinker PRD

## Summary

Tinker helps builders turn a product repo and running product URL into a published demo video. Current generated-video jobs use the Testreel pipeline and complete with an `ApiGenerationResult` whose primary `published-video` artifact is `testreel/final.mp4`. `DemoProject` remains the editable project state for loaded/sample editor projects and manual export flows.

## Users

- Founders and product engineers who need polished product demos quickly.
- Agent-assisted builders who want a deterministic capture and editing loop.
- Teams that want repo-grounded demo videos with reusable editor project state where applicable.

## MVP Workflow

1. User enters a repo URL, product/local app URL, prompt, duration, and aspect ratio.
2. Tinker generates a Testreel `published-video` artifact or loads a valid `DemoProject`.
3. User reviews the generated video preview or loaded project in the editor.
4. For editable projects, user adjusts trims, zoom/camera motion, cursor/click effects, and AI edit proposals.
5. User saves the edited `DemoProject` when working in the editor flow.
6. User exports or downloads the MP4 artifact from the current flow.

## MVP Requirements

- Generate and serve completed Testreel jobs with a primary `published-video` artifact.
- Load and validate `DemoProject` JSON for editor/sample project flows.
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
- A completed generated-video job exposes `method: "testreel"` and a `published-video` artifact at `testreel/final.mp4`.
- A valid sample `DemoProject` opens in the editor.
- A user can make at least one manual edit and undo it.
- Export verification can render and probe an MP4 artifact.
- Missing media assets show placeholders instead of crashing.
