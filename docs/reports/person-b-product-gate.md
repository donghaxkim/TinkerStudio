# Person B — One-User Product Acceptance Gate (PB-011)

**Branch:** `person-b/product-shell`
**Scope:** the end-to-end editable demo loop (Create Demo → Editor → AI/manual edits → save/load → export), built to match the Porcelain design one-to-one.

This report records the reproducible acceptance gate for the one-user local product.

## Commands (all green)

```bash
pnpm validate:schema      # both fixtures validate against DemoProjectSchema 0.1.0
pnpm typecheck            # all packages typecheck
pnpm -r test              # full monorepo suite
pnpm --filter @tinker/web build
pnpm --filter @tinker/rendering render:sample -- /tmp/tinker-final-gate.mp4
```

### Results

- **`pnpm validate:schema`** → `Validated DemoProject demo_project_sample with schema 0.1.0` and `Validated DemoProject driftboard_demo with schema 0.1.0`.
- **`pnpm typecheck`** → Done (no errors).
- **`pnpm -r test`** → all packages pass:
  - `@tinker/web` 187, `@tinker/editor` 89, `@tinker/rendering` 70, `@tinker/project-schema` 22,
    `@tinker/motion` 29, `@tinker/ai-edit-ui` 6, `@tinker/generation-contract` 9, plus the Person A
    packages (browser-capture, product-analysis, demo-assembly) — all green.
- **`pnpm --filter @tinker/web build`** → built successfully (bundles the Driftboard dashboard image + capture).
- **`render:sample`** → produced a real MP4, probed with `ffprobe`:
  `codec_name=h264`, `width=1920`, `height=1080`, `duration=45.0`, `format=mp4`.

## Design fidelity (one-to-one)

The running web app was audited surface-by-surface against the Porcelain design references
(`design/createdemo.jsx`, `.design-ref/editor-reference.png`, `docs/design-spec.md`, `DESIGN.md`,
`UI.md`). Verdict: **one-to-one with the design and fully functional** (~45 controls exercised, 0
console errors). Highlights:

- **Create Demo** matches `createdemo.jsx`: hero, repo-verify row, typewriter ghost, composer, thread
  + storyboard, "Record & open in editor".
- **Editor** matches `editor-reference.png`: top bar (`driftboard-demo.tinker` mono slug, Settings ·
  Preview · Export), deep-blue stage rendering the **Driftboard dashboard**, floating tool rail,
  playback bar (`1080p · 60fps`), timeline (4 named clips, 2 named zoom moves, ruler, click markers).
- **Right panel** tabs Chat · Zoom · Speed · Cursor · Frame are all Porcelain. Zoom tab shows
  AUTO ZOOM ("Zoom on clicks" toggle + Intensity ×1.6 slider) and the named ZOOM MOVES rowcards.
- Palette is exact Porcelain (accent `#3B5BD9`, bg `#FBFAF6`, stage `#10192C`); no purple/indigo/slate/amber.

## "Perfect for one user" script — verified

1. Opens the web app → the real product (Create Demo), not a placeholder. ✓
2. Sees Create Demo. ✓
3. Can submit a mock/local generation request (repo + prompt). ✓
4. Sees progress (typing indicator + thread). ✓
5. Lands in the Editor with a valid `DemoProject` (the golden Driftboard fixture). ✓
6. Can preview real captured media (the Driftboard dashboard image renders on the stage). ✓
7. Can select a timeline item or range (click a clip/zoom → selects + drives the controls). ✓
8. Can manually edit a clip or zoom and undo/redo it (item-aware editor; every edit undoable). ✓
9. Can preview, accept, reject, and undo an AI edit proposal (Chat tab, live preview). ✓
10. Can save/download the project (`Save project`, `Download JSON` → `driftboard-demo.json`). ✓
11. Can reload/import the project (`Load saved project` / `Load project JSON file`, warn-before-replace). ✓
12. Can export an MP4 (in-app export job → validated plan; `render:sample` produces the real file). ✓
13. Can see where the MP4 went and what it contains (artifact summary + output path + render command). ✓
14. Can recover from invalid project JSON (structured validation errors, no crash). ✓
15. Can recover from missing/unsafe assets (calm placeholder; resolution restricted). ✓
16. Can reset local prototype state (Settings → Reset saved project). ✓
17. Person A can replace the mock generation client with real output through the shared contract
    (`docs/person-a-handoff-contract.md` + golden fixture). ✓

## Known residual risks / deferred

- **Preview media for the sample** is the captured Driftboard dashboard *image* (the design's own
  dashboard, captured one-to-one). Real per-scene screen-recording capture is Person A's generation
  output; the seam is proven by the golden fixture (`person-a-generated-project.sample.json`).
- **`render:sample` CLI** renders `demo-project.sample.json` (the unit-test sample). The in-app export
  builds the golden fixture's render plan; rendering the golden fixture from the CLI is a one-line
  change documented in `docs/reports/person-b-samuel-integration.md`.
- **Schema additions** (`cursor` settings, `ZoomKeyframe.name`) are optional + backward-compatible and
  flagged for Person A review (`docs/schema-change-pb-006-cursor-settings.md`, handoff contract).
- Desktop/Electron, multi-user, cloud, billing, captions/audio remain intentionally out of MVP scope.

## Person A handoff status

- Contract: `docs/person-a-handoff-contract.md`.
- Integration proof: `docs/reports/person-b-samuel-integration.md`.
- Golden fixture: `packages/project-schema/fixtures/person-a-generated-project.sample.json` (validates,
  opens, edits, exports). Person A can implement against the contract without reading Person B internals.
