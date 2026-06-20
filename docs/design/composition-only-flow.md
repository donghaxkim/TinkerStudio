# Testreel Published-Video Product Flow

## Context

This document replaces an older composition-only product-flow note. The current generated-video
flow is Testreel-based. For the complete active contract, see `../demo-pipeline.md`.

Tinker generates repo-grounded product demos through one pipeline: analysis, understanding,
strategy, Testreel recording planning, local Testreel execution/finalization, and a primary
`published-video` artifact at `testreel/final.mp4`.

## Product URL Derivation

When the web client omits `productUrl`, `POST /api/jobs` derives it from the public GitHub
repository:

- First use the GitHub repository `homepage` metadata field when it is an HTTP(S) URL.
- Then fall back to `package.json.homepage` through the GitHub contents API when available.
- If neither source yields an HTTP(S) URL, return a validation error that explains the repo
  needs a public homepage/deployment URL.

The accepted job stored by the API always includes the derived `productUrl`, so
`runLocalGenerationJob` receives the explicit URL required for analysis and Testreel
recording.

## App Shape

`App.tsx` mounts `CompositionDemoScreen` as the product entry point, and generation opens
a video preview shell backed by the completed job's `published-video` artifact. The screen
sends `ai-url-planning` requests for the Testreel published-video pipeline.

The form contains:

- Product URL
- GitHub repo URL
- Planning agent
- Generate controls

On successful generation, the screen opens `CompositionEditorScreen` with the generated
Testreel video artifact and repo context.

## Testing

Coverage focuses on the Testreel workflow boundary:

- API accepts repo+URL generation requests and stores the resolved product URL on the job.
- API returns a validation error when no product URL can be derived.
- Web HTTP client submits `ai-url-planning` requests without renderer fields.
- Create Demo UI does not expose removed renderer/import controls.
- Completed Testreel jobs open the standalone video preview shell through `published-video`.
