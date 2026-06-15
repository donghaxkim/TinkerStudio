# Composition-Only Product Flow

## Context

Dongha's locked product flow is now:

1. Create Demo page accepts a GitHub repository URL and a demo description.
2. The API generates a Hyperframes/HTML composition demo and opens it in the composition editor.
3. The editor supports optional AI chat refinement and export.

This supersedes older docs that still list `productUrl` as a user-facing Create Demo input. The underlying generation pipeline still needs a live product URL for browser analysis and recording; the product now derives that URL before queuing the job.

## Product URL Derivation

When the web client omits `productUrl`, `POST /api/jobs` derives it from the public GitHub repository:

- First use the GitHub repository `homepage` metadata field when it is an HTTP(S) URL.
- Then fall back to `package.json.homepage` through the GitHub contents API when available.
- If neither source yields an HTTP(S) URL, return a validation error that explains the repo needs a public homepage/deployment URL.

The accepted job stored by the API always includes the derived `productUrl`, so `runLocalGenerationJob` and Samuel's Hyperframes pipeline continue to receive the explicit URL they already require.

## App Shape

`App.tsx` mounts `CompositionDemoScreen` as the whole product. The old DemoProject Create Demo page, legacy editor route, sample-project entry, and mock generation clients are retired from the web product path.

The composition form contains only:

- GitHub repo URL
- Demo description
- Generate button

On successful generation, the screen opens `CompositionEditorScreen` with the generated composition index and output video artifact. The editor keeps using the existing AI chat edit API (`POST /api/jobs/:id/edits`) and render/export path.

## Testing

Coverage focuses on the new workflow boundary:

- API accepts repo+description without `productUrl`, resolves a URL, stores it on the job, and passes it to the runner.
- API returns a validation error when no product URL can be derived.
- Web HTTP client can submit a composition job without `productUrl`.
- Create Demo UI no longer exposes a product URL field and submits only repo+description.
- App initial render is the composition Create Demo workflow, not the legacy DemoProject shell.
