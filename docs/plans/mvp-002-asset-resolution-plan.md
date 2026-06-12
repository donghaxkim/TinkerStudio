# MVP-002 Asset Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local asset resolution deterministic and safe for preview/export.

**Architecture:** Keep browser preview resolution in `packages/editor` and Node export resolution in `packages/rendering`. Preview returns structured placeholder reasons; export preflights required video assets and throws structured errors before ffmpeg can run.

**Tech Stack:** TypeScript, Zod-validated `DemoProject`, React preview, Node `path`/`fs`, Vitest.

---

## File Structure

- Modify `packages/editor/src/project/assetResolver.ts`: add structured browser preview resolver and preserve active clip helpers.
- Modify `packages/editor/src/project/assetResolver.test.ts`: cover browser URL support and placeholder/error cases.
- Modify `packages/editor/src/preview/Preview.tsx`: use browser resolver instead of inline URI checks.
- Modify `packages/editor/src/preview/Preview.test.tsx`: prove missing media still shows placeholder.
- Create `packages/rendering/src/node/assetResolution.ts`: Node path resolver, preflight, and structured `AssetResolutionError`.
- Create/modify `packages/rendering/src/node/assetResolution.test.ts`: cover valid local files, missing files, unsupported schemes, traversal, type mismatch, and MIME mismatch.
- Modify `packages/rendering/src/node/renderFinalToMp4.ts`: require `projectRoot`, run preflight before mkdir/ffmpeg.
- Modify `packages/rendering/src/node/renderFinalToMp4.test.ts`: prove preflight happens before ffmpeg and valid local fixture invokes ffmpeg.
- Modify `packages/rendering/src/node/index.ts`: export Node resolver types/functions if useful for future MVP tickets.
- Modify `packages/rendering/src/cli/renderSampleProject.ts`: pass an explicit project root.
- Modify `docs/core-mvp-checklist.md` and `docs/dongha.md`: check MVP-002 only after verification.

---

### Task 1: Browser Preview Resolver

**Files:**
- Modify: `packages/editor/src/project/assetResolver.ts`
- Modify: `packages/editor/src/project/assetResolver.test.ts`
- Modify: `packages/editor/src/preview/Preview.tsx`
- Modify: `packages/editor/src/preview/Preview.test.tsx`

- [x] **Step 1: Write failing tests**

Add tests that call `resolveBrowserPreviewAsset` directly:

```ts
expect(resolveBrowserPreviewAsset(remoteVideo, "preview")).toEqual({
  ok: true,
  assetId: "remote",
  consumer: "preview",
  url: "https://example.com/video.mp4",
});
expect(resolveBrowserPreviewAsset(localVideo, "preview")).toEqual({
  ok: false,
  error: expect.objectContaining({
    code: "unsupported_scheme",
    assetId: "local",
    assetUri: "assets/capture.mp4",
    consumer: "preview",
  }),
});
expect(resolveBrowserPreviewAsset(imageAsset, "preview")).toEqual({
  ok: false,
  error: expect.objectContaining({
    code: "type_mismatch",
    assetId: "image",
    consumer: "preview",
  }),
});
```

- [x] **Step 2: Run red tests**

Run:

```bash
pnpm --filter @tinker/editor test -- src/project/assetResolver.test.ts src/preview/Preview.test.tsx
```

Expected: fail because `resolveBrowserPreviewAsset` does not exist.

- [x] **Step 3: Implement browser resolver**

Add structured issue/result types and a resolver that accepts only video assets with `http:`, `https:`, `data:`, or `blob:` URLs.

- [x] **Step 4: Update Preview**

Use the resolver result to decide between `<video>` and placeholder. Keep the placeholder non-crashing and include the asset id/name.

- [x] **Step 5: Run green tests**

Run:

```bash
pnpm --filter @tinker/editor test -- src/project/assetResolver.test.ts src/preview/Preview.test.tsx
```

Expected: pass.

---

### Task 2: Node Export Asset Resolver

**Files:**
- Create: `packages/rendering/src/node/assetResolution.ts`
- Create: `packages/rendering/src/node/assetResolution.test.ts`
- Modify: `packages/rendering/src/node/index.ts`

- [x] **Step 1: Write failing tests**

Create tests with `mkdtemp`, `writeFile`, and explicit `projectRoot`:

```ts
await writeFile(join(projectRoot, "capture/video.mp4"), "fake video bytes");
const result = await resolveNodeAssetFilePath(videoAsset, {
  projectRoot,
  consumer: "export",
});
expect(result).toEqual(expect.objectContaining({
  ok: true,
  assetId: "asset_video",
  path: join(projectRoot, "capture/video.mp4"),
}));
```

Also test:

- missing file -> `missing_file`
- `https://example.com/video.mp4` -> `unsupported_scheme`
- `../outside.mp4` and symlink escapes -> `path_traversal`
- clip asset with `type: "image"` -> `type_mismatch`
- video asset with `mimeType: "image/png"` -> `mime_mismatch`

- [x] **Step 2: Run red tests**

Run:

```bash
pnpm --filter @tinker/rendering test -- src/node/assetResolution.test.ts
```

Expected: fail because the module does not exist.

- [x] **Step 3: Implement Node resolver**

Implement:

- `resolveNodeAssetFilePath(asset, options)`
- `preflightExportAssets(project, options)`
- `AssetResolutionError`

Use `resolve`, `relative`, `isAbsolute`, `fileURLToPath`, `stat`, `realpath`, and no shell commands.

- [x] **Step 4: Run green tests**

Run:

```bash
pnpm --filter @tinker/rendering test -- src/node/assetResolution.test.ts
```

Expected: pass.

---

### Task 3: Export Preflight Integration

**Files:**
- Modify: `packages/rendering/src/node/renderFinalToMp4.ts`
- Modify: `packages/rendering/src/node/renderFinalToMp4.test.ts`
- Modify: `packages/rendering/src/cli/renderSampleProject.ts`

- [x] **Step 1: Write failing integration tests**

Update `renderFinalToMp4` tests so valid exports create a temp `projectRoot` and write the sample asset path before calling the renderer.

Add missing-file test:

```ts
const calls: Array<{ command: string; args: string[] }> = [];
await expect(
  renderFinalToMp4(sampleProject, {
    projectRoot,
    outputPath: join(projectRoot, "out.mp4"),
    runCommand: async (command, args) => calls.push({ command, args }),
  }),
).rejects.toMatchObject({
  issues: [expect.objectContaining({ code: "missing_file", consumer: "export" })],
});
expect(calls).toEqual([]);
```

- [x] **Step 2: Run red tests**

Run:

```bash
pnpm --filter @tinker/rendering test -- src/node/renderFinalToMp4.test.ts
```

Expected: fail because `projectRoot` preflight is not integrated.

- [x] **Step 3: Integrate preflight**

Make `RenderFinalToMp4Options.projectRoot` required. Call `preflightExportAssets` before `mkdir(dirname(outputPath))` and before `runCommand`.

- [x] **Step 4: Update CLI**

Pass an explicit project root to `renderFinalToMp4`. If no project root argument is provided, use the sample fixture directory so fixture-relative asset paths resolve deterministically.

- [x] **Step 5: Run green tests**

Run:

```bash
pnpm --filter @tinker/rendering test -- src/node/renderFinalToMp4.test.ts
```

Expected: pass.

---

### Task 4: Verification, Docs, And Review

**Files:**
- Modify: `docs/core-mvp-checklist.md`
- Modify: `docs/dongha.md`

- [x] **Step 1: Run required verification**

Run:

```bash
pnpm --filter @tinker/editor test
pnpm --filter @tinker/rendering test
pnpm validate:schema
pnpm typecheck
pnpm test
```

Expected: all pass.

- [x] **Step 2: Search for duplicate/ad hoc asset handling**

Run:

```bash
rg -n "isBrowserRenderableMedia|asset\\.uri|fileURLToPath|process\\.cwd|spawn\\(" packages/editor packages/rendering apps/web
```

Expected: asset URI handling routes through the new preview/export resolver paths, except tests and ffmpeg/probe spawning.

- [x] **Step 3: Update checklists**

Mark MVP-002 complete only if all checklist and acceptance criteria are satisfied by current evidence.

- [x] **Step 4: Review with agent**

Spawn a review agent to compare `docs/core-mvp-checklist.md`, this plan, and the implementation. If it finds issues, spawn a fixer agent with exact findings, verify its changes locally, then spawn another review agent for re-review.
