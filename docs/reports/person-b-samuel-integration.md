# Person B ↔ Samuel (Person A) Integration Report (PB-010)

## Summary

The golden generated-project fixture is in place and wired through the full Person B seam:
it is schema-valid, the mock generation client returns it, it opens through Create Demo →
Editor, it can be saved, and its export preflight succeeds. The fixture matches the editor
design reference (`.design-ref/editor-reference.png`, `docs/design-spec.md` SCREEN 2): the
"driftboard-demo" project with 4 named clips and 2 named zoom moves at 24s @ 60fps, 16:9.

## Golden fixture

- **Path:** `packages/project-schema/fixtures/person-a-generated-project.sample.json`
- **Identity:** `id: driftboard_demo`, `title: "Driftboard Demo"`, `schemaVersion: 0.1.0`,
  `duration: 24`, `fps: 60`, `aspectRatio: 16:9`.
- **Clips** (track "Main capture"):
  - "Open dashboard" 0.0–6.0s
  - "Invite teammates" 6.0–13.0s
  - "Workspace settings" 13.0–18.5s
  - "Share & wrap-up" 18.5–24.0s
- **Zooms:** "Invite modal" 8.0→12.4 ×1.6; "Share button" 19.6→22.6 ×1.5 (each with a
  positive-area `target` Rect and `easeInOut`).
- **Cursor:** 82 `move` events + 5 `click` events across the timeline; clicks land on the
  zoom regions (e.g. t=8.0 opens the invite modal → zoom 1; t=19.6 opens share → zoom 2) so
  the preview shows the cursor and the auto-zoom has dwell data.
- **Asset / media:** reuses the bundled captured asset `assets/capture-001.mp4`
  (`source: "captured"`, `type: "video"`). The real capture is **3.0s / 320×180**, so each
  clip reuses an in-bounds source segment (`sourceStart 0`, `sourceEnd 3`). The browser
  preview resolves this uri to the bundled MP4 via
  `packages/editor/src/project/assetResolver.ts`, identical to the prior sample.

## Seam wiring

| Seam | File | Behavior |
| --- | --- | --- |
| "Use sample project" | `apps/web/src/fixtures/loadSampleProject.ts` | Loads the golden fixture; the editor opens the driftboard timeline. |
| Mock generation success | `apps/web/src/lib/mockGenerationClient.ts` | A succeeded job's `result.project` IS the golden fixture (parsed once at load). Create Demo success shows the 4-scene storyboard and opens the editor on it. |
| `validate:schema` | `packages/project-schema/src/sampleProject.ts` | Now validates both `demo-project.sample.json` and the golden fixture. |

Untouched on purpose (blast radius zero): `packages/project-schema/fixtures/demo-project.sample.json`
and `packages/editor/src/test/sampleProject.ts` remain the unit-test fixture; the schema was
not changed (the golden fixture is purely additive).

## Evidence

| Step | Result | Evidence |
| --- | --- | --- |
| Fixture validates | Pass | `pnpm validate:schema` → "Validated DemoProject driftboard_demo with schema 0.1.0"; `packages/project-schema/src/goldenFixture.test.ts` (6 tests). |
| Mock client returns it | Pass | `apps/web/src/lib/mockGenerationClient.test.ts` — succeeded job's `result.project.id === "driftboard_demo"`, validates against `DemoProjectSchema`, carries the 4 scenes. |
| Opens via Create Demo → Editor | Pass | `apps/web/src/screens/CreateDemo/CreateDemoScreen.test.tsx` (storyboard + "Record & open in editor" → `driftboard_demo`); `apps/web/src/App.test.tsx`; `apps/web/src/screens/Editor/EditorScreen.test.tsx` "golden driftboard fixture (PB-010)" (4 clip bars, 2 zoom bars, title, 0:24.0 timecode). |
| Can be saved | Pass | `apps/web/src/lib/projectStorage.test.ts` (download filename `driftboard-demo-driftboard-demo.json`); `apps/web/src/screens/Editor/ProjectSaveLoadControls.test.tsx` (save/load round-trips `driftboard_demo`). |
| Export preflight succeeds | Pass | `EditorScreen.test.tsx` export test asserts a succeeded job with a `24s @ 60fps` artifact summary; `buildFinalRenderPlan(goldenFixture)` produces a 1920×1080, 24s@60fps plan with 4 clip layers + 2 zoom layers + cursor layers. |
| Web build | Pass | `pnpm --filter @tinker/web build` — 163 modules transformed; emits `dist/assets/capture-001-*.mp4` for browser preview. |

## Verification commands (exact output)

```
$ pnpm validate:schema
Validated DemoProject demo_project_sample with schema 0.1.0
Validated DemoProject driftboard_demo with schema 0.1.0

$ pnpm --filter @tinker/project-schema test
 Test Files  3 passed (3)
      Tests  18 passed (18)

$ pnpm --filter @tinker/generation-contract test
generation contract tests passed
 Test Files  1 passed (1)
      Tests  9 passed (9)

$ pnpm --filter @tinker/web test
 Test Files  14 passed (14)
      Tests  186 passed (186)

$ pnpm --filter @tinker/web build
✓ 163 modules transformed.
dist/assets/capture-001-F5Jk6np7.mp4   91.89 kB
dist/assets/index-B0kXHfAw.css          8.81 kB │ gzip:   2.33 kB
dist/assets/index-DfWiyJsy.js         394.55 kB │ gzip: 114.73 kB
✓ built in ~0.6s
```

## Real MP4 render

The browser export is honest preflight only (it validates the plan and prints the local
render command). The actual MP4 is produced on the node side:

```
pnpm --filter @tinker/rendering render:sample -- <output.mp4>
```

Verified producing a real H.264 / MP4 artifact (probed via ffprobe). Note: the
`render:sample` CLI currently renders `demo-project.sample.json`; rendering the golden
fixture directly is a one-line CLI change (or pass a project path) and is not required for
this seam, since the in-app preflight already builds the golden fixture's render plan.

## Assumptions Person A (Samuel) must satisfy

For the live generator to drop into this seam unchanged, each succeeded job's
`result.project` must:

1. Be a **valid `DemoProject` schema `0.1.0`** — passes `DemoProjectSchema.parse` (see
   `docs/person-a-handoff-contract.md` §5 for the full rule list).
2. Have **resolvable captured media** — `source: "captured"`, `type: "video"`, and a
   browser-resolvable `uri` (use `assets/capture-001.mp4` for the bundled sample, or an
   http/https video URL). Every `clip.assetId` must reference a present asset.
3. Have **consistent durations** — clip and zoom ranges ordered and within `duration`;
   `sourceStart/sourceEnd` within the real asset duration (reuse segments when the capture is
   shorter than the timeline).
4. Stay within **MVP scope** — no captions, callouts, audio, or voiceover (schema rejects them).
5. Return the success payload shape `job.result = { project, warnings: string[] }`
   (`AssistedGenerationResultSchema`), with `job.status === "succeeded"`.

When these hold, swap `apps/web/src/lib/mockGenerationClient.ts` for the live
`GenerationClient` and the editor seam needs no further changes.
