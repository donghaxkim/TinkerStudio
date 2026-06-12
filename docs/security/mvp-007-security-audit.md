# MVP-007 Security Audit

## Automated Coverage

- Project JSON load size limit: covered by `packages/editor/src/project/projectPersistence.test.ts`.
- Browser file size rejection: covered by `apps/web/src/screens/Editor/ProjectSaveLoadControls.test.tsx`.
- Unknown schema version rejection: covered by `packages/editor/src/project/projectPersistence.test.ts`.
- Export output root policy: covered by `packages/rendering/src/node/renderFinalToMp4.test.ts`.
- Asset URI/path traversal: covered by `packages/rendering/src/node/assetResolution.test.ts`.
- Export job command/phase errors: covered by `packages/rendering/src/node/exportJob.test.ts`.
- User-facing path redaction: covered by `apps/web/src/screens/Editor/ProjectExportPanel.test.tsx`.
- React text injection safety: covered by `apps/web/src/screens/Editor/ProjectLoadPanel.test.tsx`.

## Static Checks

### Shell Execution

Command:

```bash
rg -n "shell:\\s*true" apps packages
```

Result:

- No `shell: true` usage found.

Broader command:

```bash
rg -n "shell:\\s*true|exec\\(|execFile\\(|spawn\\(" apps packages
```

Result:

- `packages/rendering/src/node/renderFinalToMp4.ts` and `packages/rendering/src/node/probeMp4Artifact.ts` use `spawn(command, args)` with argv arrays for ffmpeg/ffprobe.
- `packages/rendering/src/node/renderFinalToMp4.test.ts` uses `spawn` with argv arrays for media fixture/probe helpers.
- `packages/product-analysis/src/analyzeRepo.ts` uses `execFile("git", args)` with a validated GitHub URL and isolated git environment. This is outside the Person B editor/export surface.
- Regex `.exec(...)` matches in validators are string parsing only, not process execution.

### HTML/JS Injection

Person B-owned surface command:

```bash
rg -n "dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|new Function|eval\\(" apps/web packages/editor packages/rendering packages/ai-edit-ui packages/generation-contract packages/project-schema
```

Result:

- No React raw HTML insertion or dynamic code evaluation APIs found in the Person B-owned app/editor/export/schema surface.

Broader command:

```bash
rg -n "dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|new Function|eval\\(" apps packages
```

Result:

- `packages/product-analysis/src/analyzeWebsite.internal.ts` contains one Node-side `new Function` browser collector. This is outside the Person B editor/export surface and should be reviewed with the product-analysis owner before production hardening.

## Manual Notes

- Remote media assets remain non-exportable until a download/cache policy exists.
- Output roots protect obvious traversal/write-anywhere risks; OS-level symlink race hardening is future desktop packaging work.
- Error redaction is intentionally applied to browser-facing export messages; developer logs/state may still contain full paths until a logging policy is defined.
- The MVP-007 audit scope is the Person B local prototype path: project load, editor shell display, asset resolution, export job state, and local MP4 rendering.
