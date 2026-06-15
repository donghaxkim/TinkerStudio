# Composition AI Editing — Phase 3c: Export — Design

## Status

Draft design, approved for implementation planning. Person B owned. Builds on
the composition AI-edit work (Phases 0–3b). The new write endpoint lives in
shared `apps/api` and is flagged for **Person A review**.

## Summary

Make the composition editor's reserved **Export** button work. Export saves the
**current committed revision's already-rendered mp4** to a user-configured
directory on disk. There is nothing to render at export time — the mp4 already
exists as the `output-video` artifact (produced upstream by Person A's
`runHyperframesRender`, per revision). Export is **delivery, not encoding**.

This is the Screen Studio export *shape* (Export → file lands in your folder →
"Saved to …") minus its re-encode *options* (format/resolution/fps/quality),
which would require a transcode pipeline we do not have. Those are explicit
non-goals for 3c.

## Background

- The composition editor (`apps/web/.../CompositionEditor`) already renders a
  disabled **Export** button in its app bar
  (`CompositionEditorScreen.tsx`, `title="Export (coming soon)"`).
- Every composition — the base generated one (`rev-0`) and every accepted edit
  revision — has an `output-video` mp4 artifact, served same-origin via the Vite
  `/api` proxy by the artifacts route.
- `useCompositionEditFlow` exposes `currentVideoUrl` (the current revision's
  `output-video` URL) and `currentCompositionUrl`. Accept/Reject/Undo are a
  **client-side pointer** over server-retained revisions — the server does **not**
  know which revision the client currently considers "current."
- The existing Settings export directory (`appSettings.ts`) is **relative and
  sandboxed by design**: `sanitizeExportDirectory` rejects absolute paths and
  `..` segments and defaults to `"generated"`.
- `apps/api/config.ts` exposes `repoRoot` — the natural base root under which a
  relative export directory resolves.
- The artifacts route (`apps/api/src/routes/artifacts.ts`) already contains
  hardened path-traversal-safe artifact resolution (`safeArtifactPath`,
  `realArtifactPathInsideOutputRoot`, artifact-membership check). Export reuses
  this rather than duplicating security-critical logic.

## Goals

1. Clicking **Export** copies the current committed revision's mp4 into the
   configured directory and reports the saved path.
2. Export is **disabled** while an edit is previewing or running, and when there
   is no video or no `jobId` (you save what you've committed, never an unaccepted
   draft).
3. The endpoint is secure: the client picks the *directory* (a sandboxed relative
   path under `repoRoot`); the server picks the *filename* and writes exactly one
   mp4.
4. Swapping in or extending export later (transcode options) requires no rework
   of this delivery path.

## Non-Goals

- No format/resolution/fps/quality options. No GIF. No in-browser transcode or
  re-render. (Future "transcode" phase.)
- No native "Reveal in Finder" (a browser cannot; we will not fake it). We show
  the saved path with a copy-path affordance.
- No progress bar beyond a brief "exporting" state (a file copy is near-instant).
- No absolute / arbitrary destination paths. Exports stay sandboxed under
  `repoRoot`, consistent with the existing Settings contract. (Allowing
  `~/Desktop`-style absolute targets would be a separate Settings-model change.)
- No change to generation or the edit pipeline.

## Architecture

```text
[Export button]  (CompositionEditorScreen)
      │  enabled iff: currentVideoUrl set AND jobId set AND not previewing/running
      ▼
useCompositionExport(jobId)   ── POST /api/jobs/:id/export  { destinationDir, videoUrl }
      │                                            │
      │                                            ▼
      │            apps/api:  resolveArtifactFile(record, videoUrl)  ── reuse artifacts hardening
      │                       resolveExportDir(repoRoot, destinationDir)  ── relative, sandboxed
      │                       mkdir -p → copyFile(source → dir/<server-filename>)
      │                                            │
      ◄──────────────  { savedPath }  ◄────────────┘
      ▼
UI:  "Saved to <savedPath>"  + copy-path     (or inline error)
```

### Component 1 — shared artifact resolver (refactor, `apps/api`)

Extract the artifacts route's resolution into a reusable helper so the export
route shares the exact same hardening (no duplicated security code):

```ts
// apps/api/src/jobs/resolveArtifact.ts (new)
// Given a job record and an artifact URL or relative path, return the real,
// on-disk absolute file path IFF it is a known, completed artifact of the job
// and resolves safely inside the job's output root. Otherwise undefined.
resolveJobArtifactFile(record: JobRecord, artifactUrlOrPath: string): Promise<string | undefined>
```

This moves `rawArtifactPath`, `safeArtifactPath`,
`realArtifactPathInsideOutputRoot`, and the artifact-membership check into the
helper. `registerArtifactsRoutes` is refactored to call it (behavior unchanged;
its existing tests stay green). The export route calls the same helper.

### Component 2 — export directory resolver (`apps/api`)

```ts
// resolve a client-supplied RELATIVE directory under repoRoot, safely.
resolveExportDir(repoRoot: string, destinationDir: string): string | undefined
```

Validation mirrors `safeArtifactPath`: reject empty, null bytes, encoded
separators, absolute paths, drive-letter prefixes, and any `..` segment; resolve
under `repoRoot`; require the result to be inside `repoRoot`. Returns the
absolute directory path or `undefined`.

### Component 3 — `POST /api/jobs/:id/export` (`apps/api`, new — Person A review)

Registered alongside the other jobs routes. Request body
`{ destinationDir: string, videoUrl: string }` (validated with a small zod schema,
matching the repo's contract style).

Behavior:
1. Look up the job record; `404` if absent.
2. `source = await resolveJobArtifactFile(record, videoUrl)`; `404` if undefined.
3. `dir = resolveExportDir(config.repoRoot, destinationDir)`; `400` if undefined.
4. `await mkdir(dir, { recursive: true })`.
5. `filename = exportFilename(jobId, videoUrl)` →
   `tinker-<jobId>[-<revId>].mp4` (the `<revId>` is parsed from a
   `revisions/<revId>/…` source path; base composition omits it). Server-derived;
   the client never supplies the leaf name.
6. `await copyFile(source, join(dir, filename))`.
7. Respond `200 { savedPath }` where `savedPath` is the path relative to
   `repoRoot` (for display/copy), e.g. `generated/tinker-job-1-rev-1.mp4`.

Errors map through the existing error handler: invalid dir → `400`, unknown
job/artifact → `404`, copy/mkdir failure → `500` with a structured `{ message }`.

### Component 4 — `useCompositionExport` hook (`apps/web`)

Thin controller mirroring existing client/hook patterns. State machine:
`idle → exporting → saved | failed`. Holds `savedPath` and `error`. Exposes
`export(videoUrl, destinationDir)` and `isExporting`. Uses an injectable
`fetchFn` for tests. Posts to `/api/jobs/:id/export`, parses `{ savedPath }` on
success, surfaces server `{ message }` on failure.

### Component 5 — wire the Export button (`apps/web` `CompositionEditorScreen`)

- Enable the button iff `edit.currentVideoUrl !== undefined && jobId !==
  undefined && !edit.isPreviewing && edit.status !== "running"`.
- On click: call `export(edit.currentVideoUrl, getExportDirectory())`.
- Render result inline near the button: `idle` (nothing), `exporting`
  ("Exporting…", button disabled), `saved` ("Saved to `<savedPath>`" + copy-path
  button), `failed` (the error message + the button re-enabled to retry).

## Data Flow

1. User clicks Export (only reachable when committed video exists and no edit is
   in flight).
2. Web reads the relative export dir from Settings (`getExportDirectory()`,
   default `generated`) and the current `output-video` URL it already holds.
3. `POST /api/jobs/:id/export { destinationDir, videoUrl }`.
4. Server resolves the source artifact (shared hardening), resolves the
   destination dir under `repoRoot`, `mkdir -p`, copies to a server-named mp4.
5. Server returns `{ savedPath }`; UI shows "Saved to `<savedPath>`".

## Error Handling

- **No video / mid-edit / no jobId** → Export disabled (prevented in UI).
- **Invalid destination dir** (absolute, traversal, empty) → server `400`,
  surfaced inline. (Client values are pre-sanitized, but the server re-validates;
  it never trusts the client.)
- **Unknown job or artifact / traversal `videoUrl`** → `404`.
- **`mkdir`/`copyFile` failure** (permissions, disk) → `500`, surfaced with a
  retry.
- All failures leave the source artifacts untouched; export is read-only on the
  job.

## Security

- Client controls only a **relative, sandboxed** directory; the server resolves
  it under `repoRoot` and rejects anything escaping it — same discipline as the
  artifacts route.
- The server derives the **filename**; the client cannot inject a path via the
  leaf name. The server writes exactly one mp4.
- The source file is resolved through the existing artifact hardening
  (`realpath` inside the job output root, must be a known completed artifact),
  so `videoUrl` cannot be used to read arbitrary files.
- Loopback-only single-user posture is unchanged.

## Testing

**Server (`apps/api`):**
- copies the correct source mp4 into the resolved dir with the server-derived
  filename; `savedPath` is repoRoot-relative.
- base composition → `tinker-<jobId>.mp4`; revision → `tinker-<jobId>-<revId>.mp4`.
- rejects an absolute / `..` / empty `destinationDir` → `400`.
- unknown job → `404`; `videoUrl` pointing outside the job / traversal → `404`.
- `mkdir -p` creates a missing nested dir.
- refactor guard: existing artifacts-route tests stay green after extracting the
  shared resolver.

**Web (`apps/web`):**
- `useCompositionExport`: success maps `{ savedPath }`; failure maps server
  `{ message }`; state transitions idle→exporting→saved/failed.
- `CompositionEditorScreen`: Export disabled while previewing/running and when no
  video; enabled otherwise; click triggers a POST with the current video URL +
  Settings dir; shows "Saved to …" on success and the error on failure.

## Ownership / Review

- New write endpoint + resolvers in shared `apps/api` → **Person A review**.
- No generation/edit-pipeline changes. No schema changes (uses existing
  `revisions`/artifacts shapes).

## Future Work (out of scope for 3c)

- Transcode phase: real Export options (format/resolution/fps/quality) via an
  ffmpeg/re-render step — full Screen Studio parity.
- Optional absolute-path / OS-native save destinations (Settings-model change).
- "Open file" / OS reveal once a desktop shell exists.

## Success Criteria

- Clicking Export on a generated (and on an edited→accepted) composition writes
  the correct mp4 into the configured directory and shows its path.
- Export is impossible to trigger on an unaccepted preview or mid-edit.
- The endpoint rejects unsafe directories and artifact paths.
- `pnpm --filter @tinker/api test` and `pnpm --filter @tinker/web test` green;
  both typecheck clean.
