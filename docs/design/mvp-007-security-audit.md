# MVP-007 Security Audit Design

## Goal

Close obvious local security risks in Person B-owned project loading, generation input validation, asset/export path handling, and user-facing export errors.

## Source Of Truth

- `docs/core-mvp-checklist.md` MVP-007
- `AGENTS.md` shared-contract caution
- `docs/architecture.md` local-first/export-artifact model
- `packages/project-schema/src/validators.ts`
- `packages/editor/src/project/projectPersistence.ts`
- `apps/web/src/screens/Editor/ProjectSaveLoadControls.tsx`
- `packages/rendering/src/node/assetResolution.ts`
- `packages/rendering/src/node/renderFinalToMp4.ts`
- `packages/rendering/src/node/exportJob.ts`
- `packages/generation-contract/src/createDemoRequest.ts`

## Current Baseline

Already strong:

- Project shape is validated with `DemoProjectSchema` in editor persistence, sample loading, render planning, and generation result parsing.
- Unknown schema versions are rejected by `schemaVersion: z.literal(PROJECT_SCHEMA_VERSION)`.
- Asset preflight rejects remote URLs, traversal, missing files, type mismatch, and MIME mismatch for export media.
- Existing ffmpeg and ffprobe execution uses `spawn(command, args)` with argv arrays.
- Browser UI renders project strings through React text nodes, not raw HTML.

Remaining security gaps:

- Loaded project JSON has no size cap before parse/read.
- Raw renderer output path is still too permissive; callers can write any process-writable `.mp4`.
- Output paths do not have an explicit allowed-root policy.
- Export failures can contain absolute local paths in user-facing UI.
- Static/manual checks are not documented as evidence.

## Design

### Project JSON Size Limit

Add a shared editor persistence limit:

```ts
export const MAX_DEMO_PROJECT_JSON_BYTES = 5 * 1024 * 1024;
```

`deserializeDemoProjectJson` should reject strings above the limit before `JSON.parse`. Browser file loading should reject `File.size` above the same limit before reading file contents.

This is not a perfect denial-of-service boundary, but it prevents accidental huge project files and avoids reading/parsing obvious bad inputs in the web prototype.

### Runtime Schema Validation

Keep using `DemoProjectSchema.safeParse` for all loaded JSON. Add explicit regression tests for:

- unknown schema version
- oversized JSON
- oversized browser file before `FileReader`

No schema migration is introduced in MVP-007.

### Export Output Path Policy

Add `allowedOutputRoots` to `RenderFinalToMp4Options` and therefore `ExportJobOptions`.

Policy:

- `allowedOutputRoots` must contain at least one explicit directory.
- `outputPath` must end in `.mp4`.
- normalized `outputPath` must live inside one allowed output root.
- traversal-style paths like `allowed/../outside/file.mp4` resolve outside the root and are rejected before directory creation or ffmpeg invocation.

The CLI can pass `dirname(outputPath)` as the explicit user-selected/app-owned output root. Tests should pass temporary roots explicitly.

This intentionally does not solve every symlink race. MVP-007 blocks the obvious local path traversal/write-anywhere risk. Future desktop packaging can tighten this with OS-native save dialogs and app-owned directories.

### User-Facing Error Redaction

The job state may contain developer-oriented command/error context. MVP-006 kept command args out of the browser UI. MVP-007 should also redact absolute local paths from user-facing export failure messages in `ProjectExportPanel`.

Policy:

- preserve actionable phase and high-level message
- replace absolute POSIX and Windows-looking paths with `[local path]`
- keep developer command context available in state, but do not display raw args

### Injection Safety

React text rendering should remain the only way generated project values enter the app shell. Add a regression test proving malicious-looking project title text is displayed as text, not inserted as HTML.

Static audit command:

```bash
rg -n "dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|new Function|eval\\(" apps packages
```

### Shell Execution Safety

Static audit command:

```bash
rg -n "shell:\\s*true|exec\\(|execFile\\(|spawn\\(" apps packages
```

Expected result:

- no `shell: true`
- ffmpeg/ffprobe use `spawn(command, args)` argv arrays
- tests may use `spawn` to inspect real media, also argv arrays

## Non-Goals

- Secret management or API key storage. PRD says secrets/API key management is out of local prototype scope.
- Private repo checkout sandboxing. Architecture keeps arbitrary dependency install/exec future-scoped.
- Full OS-level symlink race defense.
- Download/cache policy for remote media assets.
- Desktop app packaging permissions.

## Acceptance Evidence

MVP-007 is complete when evidence proves:

- Loaded project JSON is schema-validated and oversized files are rejected before parse/read.
- Unknown schema versions are rejected.
- Export output requires explicit allowed output roots and rejects traversal/outside paths before ffmpeg.
- Asset URI traversal and remote export assets remain rejected.
- User-facing export errors redact local paths.
- Generated project strings do not inject HTML/JS into the app shell.
- Static grep confirms no export path uses `shell: true`.
- Manual/static checks are documented with commands and results.
- Full verification passes.
