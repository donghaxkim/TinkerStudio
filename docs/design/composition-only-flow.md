# Playwright-Only Product Flow

## Context

This document replaces an older composition-only product-flow note. The current product flow
is Playwright-only.

Tinker generates repo-grounded product demos through one pipeline: analysis, understanding,
strategy, Playwright capture planning, smooth Playwright capture, `DemoProject`, and
`playwright/final.mp4`.

## Product URL Derivation

When the web client omits `productUrl`, `POST /api/jobs` derives it from the public GitHub
repository:

- First use the GitHub repository `homepage` metadata field when it is an HTTP(S) URL.
- Then fall back to `package.json.homepage` through the GitHub contents API when available.
- If neither source yields an HTTP(S) URL, return a validation error that explains the repo
  needs a public homepage/deployment URL.

The accepted job stored by the API always includes the derived `productUrl`, so
`runLocalGenerationJob` receives the explicit URL required for analysis and Playwright
capture.

## App Shape

`App.tsx` mounts `CompositionDemoScreen` as the product entry point, but generation now opens
a Playwright video preview shell backed by the completed job's `playwright-video` artifact.
The screen sends Playwright-compatible `ai-url-planning` requests only.

The form contains:

- Product URL
- GitHub repo URL
- Planning agent
- Generate controls

On successful generation, the screen opens `CompositionEditorScreen` with the generated
Playwright video artifact and repo context.

## Testing

Coverage focuses on the Playwright workflow boundary:

- API accepts repo+URL generation requests and stores the resolved product URL on the job.
- API returns a validation error when no product URL can be derived.
- Web HTTP client submits `ai-url-planning` requests without renderer fields.
- Create Demo UI does not expose removed renderer/import controls.
- Completed Playwright jobs open the standalone video preview shell.
