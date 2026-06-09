# Dongha Checklist

Person B checklist for building the editor, AI edit UX, and export side of **Tinker / Screen Studio for agents**.

## v0.2 MVP Update

Dongha's current direction is a **Screen Studio + Cursor-inspired web UI**.

Build only:

- video preview
- video timeline
- cursor-following auto zoom
- Screen Studio-style manual zoom
- trim
- speed
- selected range/current frame attachments
- full-height AI chat with mock zoom/trim/speed proposals

Do not build for MVP:

- captions
- callouts
- narration
- separate audio tracks
- text overlays
- a permanent inspector

All operation ranges use project timeline seconds and `[start, end)` semantics:

```text
0 <= start < end <= project.duration
```

Older checklist items mentioning captions, callouts, narration, or separate audio are obsolete for the MVP.

## Role

You are **Person B**.

You own:

```text
DemoProject -> editor -> manual edits -> AI edit operations -> export
```

Owned areas:

```text
/apps/web
/apps/desktop
/packages/editor
/packages/ai-edit-ui
/packages/rendering
```

Do not casually edit Person A's generation/capture internals:

```text
/packages/product-ingestion
/packages/ai-generator
/packages/capture
```

Shared contract areas require coordination/review:

```text
/packages/project-schema
/packages/generation-contract
/apps/api
```

---

## 0. Local setup

- [ ] Install/use Node from `.node-version`:
  - required: `22.22.3`
- [ ] Enable/install pnpm declared in `package.json`:
  - required: `pnpm@10.33.0`
- [ ] Run install:
  - `pnpm install`
- [ ] Verify schema package works:
  - `pnpm validate:schema`
  - `pnpm typecheck`
- [ ] Confirm `main` stays runnable before starting feature work.
- [ ] Create your working branch:
  - `person-b/web-editor`

---

## 1. Understand the source of truth

- [ ] Read `docs/vision.md`.
- [ ] Read `docs/architecture.md`.
- [ ] Read `packages/project-schema/README.md`.
- [ ] Read `packages/project-schema/src/validators.ts`.
- [ ] Read `packages/project-schema/fixtures/demo-project.sample.json`.
- [ ] Internalize the core rule:
  - `DemoProject` is the product state.
  - MP4 is only an export artifact.
- [ ] Do not build a generic video editor.
- [ ] Keep V1 demo-specific:
  - trim
  - zooms
  - captions
  - callouts
  - cursor/click effects
  - backgrounds
  - aspect ratio
  - export

---

## 2. Shared schema sanity checks

- [ ] Confirm `DemoProject` has everything the editor needs for Milestone 1.
- [ ] Confirm `Asset`, `Track`, and `Clip` are enough for timeline rendering.
- [ ] Confirm captions, zooms, cursor events, and callouts can be previewed from the sample fixture.
- [ ] Check if editor needs extra fields before adding them.
- [ ] If schema changes are needed:
  - [ ] Make a small isolated PR.
  - [ ] Update validators.
  - [ ] Update TS types.
  - [ ] Update sample fixture.
  - [ ] Run `pnpm validate:schema`.
  - [ ] Run `pnpm typecheck`.
  - [ ] Ask Person A to review.

---

## 3. Workspace/app scaffolding

- [ ] Add apps to `pnpm-workspace.yaml` if app package manifests are added:

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

- [ ] Create `apps/web/package.json`.
- [ ] Pick a boring web stack for V1:
  - React
  - Vite
  - TypeScript
- [ ] Add `apps/web/src` app entrypoint files.
- [ ] Add scripts:
  - `dev`
  - `build`
  - `typecheck`
- [ ] Make root `pnpm -r typecheck` include the web app.
- [ ] Keep Electron untouched until the web/editor loop works.

---

## 4. Milestone 1: Manual project to editor/export

Goal:

> Load a hand-written `DemoProject`, show it in an editor, support basic edits, and export.

Use this fixture first:

```text
packages/project-schema/fixtures/demo-project.sample.json
```

### Project loading

- [ ] Load the sample `DemoProject` in the web app.
- [ ] Validate it with `DemoProjectSchema` before rendering.
- [ ] Display project metadata:
  - title
  - duration
  - fps
  - aspect ratio
  - asset count
  - track count
- [ ] Show validation errors clearly if the project is invalid.

### Timeline v0

- [ ] Create a timeline package/module under `packages/editor/src/timeline`.
- [ ] Render tracks from `project.tracks`.
- [ ] Render clips as time-based bars.
- [ ] Render captions as overlay rows.
- [ ] Render zooms as overlay rows.
- [ ] Render callouts as overlay rows.
- [ ] Add current-time playhead state.
- [ ] Add click-to-seek.
- [ ] Add selected range state:
  - start time
  - end time
- [ ] Make range selection visible.

### Preview v0

- [ ] Create preview module under `packages/editor/src/preview`.
- [ ] Render video assets where possible.
- [ ] Render audio assets where possible.
- [ ] Show current time.
- [ ] Show active captions at current time.
- [ ] Show active callouts at current time.
- [ ] Apply active zoom metadata visually enough to prove the model.
- [ ] Show cursor/click events if present.

### Manual edits v0

- [ ] Add caption create/edit/delete.
- [ ] Add callout create/edit/delete.
- [ ] Add zoom create/edit/delete.
- [ ] Add clip trim editing if practical for V1.
- [ ] Validate the whole project after each edit.
- [ ] Keep edits immutable: return a new `DemoProject`, do not mutate in place.

---

## 5. AI edit operation applier

Primary file:

```text
packages/editor/src/applyEditOperations.ts
```

- [ ] Implement operation application for:
  - `add_zoom`
  - `add_callout`
  - `add_caption`
  - `remove_entity`
- [ ] Generate stable IDs for inserted entities.
- [ ] Preserve existing project fields.
- [ ] Update `updatedAt` after accepted edits.
- [ ] Append accepted edits to `aiEditHistory`.
- [ ] Validate result with `DemoProjectSchema`.
- [ ] Return errors instead of silently producing invalid projects.
- [ ] Add tests for each operation type.
- [ ] Add tests for invalid ranges.
- [ ] Add tests for removing unknown IDs.
- [ ] Add tests that operations cannot create invalid project duration ranges.

---

## 6. AI edit UX

Goal:

> Cursor-for-video over selected timeline ranges.

- [ ] Add selected timeline range context to the editor state.
- [ ] Add AI chat side panel.
- [ ] Pass selected range, captions, callouts, zooms, and project slice into the chat request.
- [ ] For first version, allow hardcoded/mock operation responses.
- [ ] Show proposed operations before applying.
- [ ] Let user accept/reject proposed operations.
- [ ] On accept:
  - apply operations
  - validate project
  - append `aiEditHistory`
- [ ] On reject:
  - preserve project unchanged
  - mark proposal rejected if stored
- [ ] Make all AI edits undoable or at least reversible from history.

---

## 7. Generation contract integration

Shared package:

```text
/packages/generation-contract
```

Needed by Create Demo UI and progress UI.

- [ ] Define/check `CreateDemoRequest`.
- [ ] Define/check `GenerationJob`.
- [ ] Define/check `GenerationStatus`.
- [ ] Define/check `GenerationResult`.
- [ ] Define progress event types.
- [ ] Build Create Demo screen fields:
  - GitHub repo URL
  - product URL/local app URL
  - prompt
  - duration cap
  - aspect ratio
  - optional voice/narration style
- [ ] Submit create-demo request through the contract, not Person A internals.
- [ ] Render generation progress states.
- [ ] Load generated `DemoProject` into editor when the job completes.

---

## 8. Project persistence

- [ ] Add project save/load behavior.
- [ ] Decide where local web prototype stores projects:
  - local file picker
  - local API
  - browser local storage only for temporary prototype
- [ ] Save full `DemoProject` JSON.
- [ ] Validate loaded project before opening.
- [ ] Show validation errors in UI.
- [ ] Keep asset references by `asset.id`, not duplicated paths.

---

## 9. Rendering/export

Owned packages:

```text
/packages/rendering
/packages/editor/src/export
```

- [ ] Implement `renderPreview.ts` for editor preview composition.
- [ ] Implement `renderFinal.ts` for final export composition.
- [ ] Decide early export approach:
  - ffmpeg
  - canvas capture
  - HyperFrames
  - another license-safe renderer
- [ ] Preserve schema semantics in export:
  - tracks
  - clips
  - trims
  - captions
  - zooms
  - callouts
  - cursor/click effects
  - aspect ratio
- [ ] Export MP4 from the current `DemoProject` state.
- [ ] Verify exported MP4 plays.
- [ ] Verify edits are reflected in exported MP4.
- [ ] Do not make AI directly mutate video files.

---

## 10. App screens

### Create Demo

Path:

```text
apps/web/src/screens/CreateDemo
```

- [ ] Form for repo URL.
- [ ] Form for product/local app URL.
- [ ] Prompt field.
- [ ] Duration field.
- [ ] Aspect ratio selector.
- [ ] Optional narration style field.
- [ ] Submit button.
- [ ] Progress display.
- [ ] Open editor when generation returns a project.

### Editor

Path:

```text
apps/web/src/screens/Editor
```

- [ ] Project loader.
- [ ] Timeline.
- [ ] Preview.
- [ ] Properties panel for selected item/range.
- [ ] AI chat side panel.
- [ ] Export button.
- [ ] Save button.

### Settings

Path:

```text
apps/web/src/screens/Settings
```

- [ ] Keep minimal for V1.
- [ ] Add only required local/API settings.

---

## 11. Testing checklist

- [ ] Add unit tests for `applyEditOperations.ts`.
- [ ] Add validation tests around `DemoProjectSchema` if schema changes.
- [ ] Add component tests for timeline rendering if test stack exists.
- [ ] Add component tests for preview overlays if test stack exists.
- [ ] Add smoke test for loading `demo-project.sample.json`.
- [ ] Add smoke test for accepting an AI edit operation.
- [ ] Add smoke test for export once export exists.
- [ ] Always run before claiming done:
  - `pnpm validate:schema`
  - `pnpm typecheck`
  - relevant package tests
  - relevant app build

---

## 12. Git workflow

- [ ] Work on branch:
  - `person-b/web-editor`
- [ ] Keep `main` runnable.
- [ ] Make small PRs.
- [ ] Commit after coherent chunks.
- [ ] Keep schema PRs isolated.
- [ ] Do not mix schema changes with large editor changes.
- [ ] Ask Person A to review schema/contract changes.
- [ ] Review Person A schema changes before relying on them.

Suggested PR sequence:

- [ ] PR 1: web app scaffold + workspace config.
- [ ] PR 2: load/validate sample project.
- [ ] PR 3: timeline v0.
- [ ] PR 4: preview v0.
- [ ] PR 5: edit operation applier + tests.
- [ ] PR 6: AI edit side panel mock flow.
- [ ] PR 7: save/load project.
- [ ] PR 8: export v0.
- [ ] PR 9: generation-contract Create Demo integration.

---

## 13. Licensing/commercial safety

Safe references/foundations mentioned in architecture:

- [ ] `microsoft/playwright` — Apache-2.0
- [ ] `browserbase/stagehand` — MIT
- [ ] `vercel-labs/webreel` — Apache-2.0
- [ ] `heygen-com/hyperframes` — Apache-2.0
- [ ] `walterlow/freecut` — MIT
- [ ] `farzaa/clicky` / `jasonkneen/openclicky` — MIT

Use as inspiration only unless license is clarified:

- [ ] `CristianOlivera1/openvid` — PolyForm Noncommercial; do not fork/copy for commercial product.
- [ ] `designcombo/react-video-editor` — no detected license.
- [ ] `heygen-com/website-to-hyperframes-demo` — no detected license.
- [ ] `remotion-dev/remotion` — commercial-license considerations.

---

## 14. Definition of done for Person B MVP

- [ ] A valid `DemoProject` can be loaded.
- [ ] The project can be viewed in an editor.
- [ ] Timeline displays tracks/clips/overlays.
- [ ] Preview reflects captions/zooms/callouts/cursor events.
- [ ] User can make at least one manual edit.
- [ ] AI edit operations can be previewed and accepted/rejected.
- [ ] Accepted AI edits mutate `DemoProject`, not video files.
- [ ] Edited project can be saved.
- [ ] Current project can be exported to MP4.
- [ ] Export reflects editor state.
- [ ] Typecheck passes.
- [ ] Relevant tests pass.

---

## 15. Current repo gaps to remember

- [ ] `docs/prd.md` is empty.
- [ ] `packages/project-schema/fixtures/storyboard.sample.json` is empty.
- [ ] `packages/project-schema/fixtures/capture-result.sample.json` is empty.
- [ ] `packages/editor/src/applyEditOperations.ts` is empty.
- [ ] `packages/rendering/src/renderPreview.ts` is empty.
- [ ] `packages/rendering/src/renderFinal.ts` is empty.
- [ ] `packages/generation-contract/src/*.ts` are empty.
- [ ] `/packages/ai-edit-ui` does not exist yet.
- [ ] `/apps/web` has only placeholder screen directories.
- [ ] `/apps/desktop` is placeholder-only and should wait until the web loop works.
