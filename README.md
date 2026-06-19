# Tinker Studio

**Screen Studio for agents** — a local-first editor for product-demo videos. A generated
`DemoProject` flows through a Porcelain web editor (preview, timeline, manual + AI edits,
save/load) and exports to MP4. `DemoProject` is the source of truth; MP4 is an export artifact.

## Run the one-user local demo

```bash
# prerequisites: Node 22.22.3 (.node-version), pnpm 10.33.0, ffmpeg (for real MP4 export)
pnpm install

# start the web app
pnpm --filter @tinker/web dev      # http://localhost:5173
```

In the app: land on **Create Demo** → paste a repo + a one-line brief and send (mock generation),
or click **"or start from a sample project"** → you're in the **Editor** with the Driftboard demo.
Preview/play, select clips/zooms on the timeline, edit them (item-aware, undoable), use the **Chat**
tab for AI edit proposals (preview/accept/reject), and open **Export** to validate the plan + see the
local render command. **Settings** (gear) has diagnostics, the export directory, and a storage reset.

Tinker generates repo-grounded product demos through one pipeline: analysis, understanding,
strategy, Playwright capture planning, smooth Playwright capture, `DemoProject`, and
`playwright/final.mp4`.

## Render a real MP4

```bash
pnpm --filter @tinker/rendering render:sample -- /tmp/tinker-demo.mp4   # H.264 1920x1080
```

## Verify everything

```bash
pnpm validate:schema       # fixtures validate against DemoProjectSchema 0.1.0
pnpm typecheck
pnpm -r test               # full monorepo test suite
pnpm --filter @tinker/web build
```

## Key docs

- `docs/dongha.md` — Person B execution board.
- `docs/reports/person-b-product-gate.md` — the one-user acceptance gate (commands + results).
- `docs/person-a-handoff-contract.md` — the Person A → Person B generation contract.
- `docs/reports/person-b-samuel-integration.md` — the golden-fixture integration proof.
- `DESIGN.md`, `UI.md`, `docs/design-spec.md` — the Porcelain design system the UI matches.

## Scope (MVP)

Demo-specific only: trim, zoom (auto/manual), speed, cursor/click, save/load, export. Out of scope:
captions, callouts, text overlays, voiceover/audio timeline, desktop automation, and generic video
editing. Web-first; desktop/Electron is deferred.
