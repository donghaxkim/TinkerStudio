# MVP-002 Asset Resolution Design

## Goal

Make asset handling deterministic and safe for preview and export. The editor should never crash on bad media references, and Node export should fail before invoking ffmpeg when a required media asset is missing, unsafe, or incompatible with its declared type.

## Source Of Truth

- `DemoProject` remains the editable product state.
- MP4 remains an export artifact.
- MVP media scope is captured video plus cursor/zoom/trim metadata. Captions, callouts, text rendering, audio timelines, and audio mixing stay out of scope.

## Current Problem

Preview currently checks asset URIs with inline string-prefix logic. Export currently builds a placeholder ffmpeg graph without resolving required source media first. That means local paths, remote URLs, traversal attempts, missing files, and type/MIME mismatches are not represented as one deterministic contract.

## Design

### Browser Preview Resolver

Add one browser-facing resolver in `packages/editor/src/project/assetResolver.ts`.

The resolver accepts an `Asset` and a consumer string and returns a structured result:

```ts
type BrowserAssetResolution =
  | { ok: true; assetId: string; consumer: string; url: string }
  | { ok: false; error: AssetResolutionIssue };
```

Browser preview accepts only `http:`, `https:`, `data:`, and `blob:` URLs. Relative paths and `file:` URLs are not browser-renderable in the local web app and should produce a placeholder, not a crash.

### Node Export Resolver

Add a Node resolver in `packages/rendering/src/node/assetResolution.ts`.

The resolver accepts:

```ts
{
  projectRoot: string;
  allowedRoots?: string[];
  consumer: "export";
}
```

It resolves local source video assets before ffmpeg starts.

Rules:

- Relative asset URIs resolve against `projectRoot`.
- Absolute paths and `file://` URLs are allowed only when they remain inside `projectRoot` or another explicit `allowedRoots` entry.
- `http:`, `https:`, `data:`, `blob:`, and unknown URI schemes are rejected for local export until a download/cache policy exists.
- Path traversal outside approved roots is rejected after path normalization.
- Missing files and non-file paths are detected before ffmpeg is invoked.
- Video clips must reference assets with `asset.type === "video"`.
- If `mimeType` is present for a video asset, it must start with `video/`.
- If the URI extension is known, it must be a video extension: `.mp4`, `.mov`, `.m4v`, `.webm`, `.mkv`, `.avi`.

### Structured Errors

Both resolvers use a shared error shape where practical:

```ts
type AssetResolutionIssue = {
  code:
    | "missing_asset"
    | "unsupported_scheme"
    | "path_traversal"
    | "missing_file"
    | "not_file"
    | "type_mismatch"
    | "mime_mismatch";
  assetId?: string;
  assetUri?: string;
  consumer: string;
  message: string;
};
```

Node export throws an `AssetResolutionError` containing one or more issues. The thrown message should be readable, while tests can assert the structured `issues`.

### Export Integration

`renderFinalToMp4` should accept an explicit `projectRoot` option and run `preflightExportAssets(project, options)` before creating output directories or invoking ffmpeg.

This is intentionally stricter than the current placeholder renderer. Even before MVP-005 replaces the placeholder graph with real media, export should refuse unsafe or missing required media. That gives MVP-005 a safe foundation.

### Preview Integration

`Preview` should call the browser resolver for the active asset. A failed browser resolution shows the existing placeholder with the asset id/name and a safe reason. It should not expose local absolute paths beyond what is already in project JSON unless a later redaction policy is added under MVP-007.

## Non-Goals

- Downloading remote assets.
- Rendering local files directly in browser preview.
- Building the real source-media ffmpeg graph. That remains MVP-005.
- Adding schema fields.
- Changing Person A capture internals.

## Verification

MVP-002 is done when:

- Asset resolver tests cover browser-supported URLs, browser-local placeholders, unsupported export schemes, missing files, path traversal, type mismatch, MIME mismatch, and valid local files.
- `renderFinalToMp4` tests prove ffmpeg is not invoked when preflight fails.
- Existing preview tests still prove missing media shows a non-crashing placeholder.
- `pnpm --filter @tinker/editor test`, `pnpm --filter @tinker/rendering test`, `pnpm typecheck`, and `pnpm validate:schema` pass.
