# Upload an existing HyperFrames demo into the editor

**Date:** 2026-06-16
**Status:** Approved-by-direction (steered via `/goal`; two load-bearing decisions confirmed by the user)
**Owner:** Person B (editor/UI), with a small API addition

## Problem

Users often already have a generated HyperFrames demo and just want to make edits,
without re-running the full plan → generate pipeline (which needs a product URL + repo
and is slow/expensive). Today the only way into the editor with a real, AI-editable
composition is to generate one. There is no way to bring an existing demo in.

We want a button on the main (create) screen that takes the user straight to an upload
step, where they drop the folder of an already-generated HyperFrames demo and land in the
editor ready to edit.

## Key findings that shape the design

1. **A generated HyperFrames `index.html` is self-contained.** The real
   `hyperframes/index.html` inlines all CSS/JS/SVG and pulls only GSAP from a CDN — there
   are no local asset files to resolve. The editor reads clips directly from
   `.scene[data-start]` DOM nodes and the `window.__timelines` registry. Loading a
   composition is just pointing the preview iframe at that HTML.

2. **The whole edit/render/export pipeline only needs the `index.html` in a job's
   `outputRoot/hyperframes/`.** `composeRunEdit` copies the hyperframes dir, runs
   search/replace on `index.html`, re-lints, and `runHyperframesRender` renders the edited
   HTML to `output.mp4`. The source repo / product analysis are needed only for *initial
   generation* — never for edits or re-renders.

3. **A completed generation job and the editor are already decoupled through artifact
   URLs.** `CompositionDemoScreen` opens `CompositionEditorScreen` for any completed
   hyperframes job, passing `compositionIndexUrl`, `outputVideoUrl`, `jobId`, `editClient`,
   and a `repo` parsed from the request. The editor needs nothing job-specific beyond these.

**Consequence:** if we register an uploaded bundle as an already-`completed` API job, an
uploaded demo becomes indistinguishable from a freshly generated one. AI chat-edits,
render-on-demand, and Export all work with **zero new edit logic**.

## Decisions (confirmed)

- **Edit scope: full editable import.** The uploaded demo is registered as a real API job
  so AI edits + render + Export all work — not a read-only/manual-only preview.
- **Upload unit: the whole folder.** The user drops the generated demo folder; the client
  picks out the canonical files automatically.

## Approach (chosen)

**Import the dropped folder as an already-completed API job, then reuse the existing
editor + edit pipeline unchanged.**

Rejected alternative — *client-only preview/manual mode*: load the `index.html` into the
iframe purely client-side for playback + manual timeline edits. Rejected because manual
timeline edits are preview-only (never rendered), AI edits would be unavailable, and Export
could only download the original mp4 — it duplicates editor wiring while delivering far less.

## Part A — API: `POST /api/jobs/import`

New route registered in `registerJobsRoutes` (or a sibling `registerImportRoutes`).

### Transport
- Add `@fastify/multipart` (new dependency) and register it on the server.
- The client sends `multipart/form-data`; each file part carries its relative path (e.g.
  field name or filename = `hyperframes/index.html`). `output.mp4` is binary, so multipart
  is the right transport (avoids base64 bloat).
- Apply sane multipart limits (file size, file count).

### Handler (runs inline — no queue; it is just file I/O, returns the completed job)
1. **Collect & locate** the canonical files from the parts:
   - `hyperframes/index.html` — **required**
   - `hyperframes/output.mp4` — **required** (the result schema requires an output-video
     artifact, and every real generated bundle has one)
   - `hyperframes/generation-manifest.json` — optional (metadata source)
   - `hyperframes/asset-manifest.json` — optional
   - `hyperframes/assets/**` — optional
   - Ignore anything under a `revisions/` segment and any other files.
   - Be lenient about the dropped root: match on the `hyperframes/` segment wherever it
     appears in the relative path; if no `hyperframes/index.html` is found, fall back to any
     `index.html` not under `revisions/`.
2. **Sanitize** every relative path with the same guards as
   `apps/api/src/routes/artifacts.ts` (reject `..`, absolute paths, drive letters, encoded
   separators, NUL). Write only inside the new `outputRoot`.
3. **Validate** the `index.html` with the existing `lintComposition`. On failure return
   `422` with a clear message. Return `422` if `index.html` or `output.mp4` is missing.
4. Mint an `id`, set `outputRoot = <repoRoot>/generated/local-job/<id>`, and write the files
   into the `hyperframes/` layout (stream the mp4 to disk).
5. **Synthesize a valid request** (`AiUrlPlanningCreateDemoRequest`, `renderer:
   "hyperframes"`) from `generation-manifest.json` when present
   (`productUrl`, `sourceRepoUrl` → `repoUrl`, `durationCapSeconds`, `aspectRatio`),
   falling back to safe schema-valid placeholders. The `repoUrl` is what surfaces the repo
   link in the editor header.
6. **Register the job:** build the `ApiGenerationResult` for hyperframes via the existing
   `indexArtifacts` indexing (composition-index + output-video, plus optional manifests),
   then `store.create(...)` followed by `store.complete(id, result, now)`.
7. Respond `200` with the completed `ApiGenerationJob` snapshot.

### Why inline (no queue)
Import performs only file writes + a lint; there is no long render. It completes within the
request, so it does not consume the generation queue and the client gets the editable job
immediately.

## Part B — Web: entry point, upload screen, wiring

### Entry point
On `CompositionDemoScreen` (the create screen), add a secondary **"Edit an existing demo"**
button beside the existing **"Open empty editor shell"** button. Disabled while planning or
a generation job is running, matching the sibling button's gating.

### Upload screen
A focused screen shown when the user clicks "Edit an existing demo":
- A **drop zone** supporting folder drag-drop (traverse `DataTransferItem.webkitGetAsEntry`)
  **and** a **"Choose folder"** button (`<input type="file" webkitdirectory>`).
- The client filters the dropped/selected tree to the canonical files (Part A list,
  skipping `revisions/**`) and uploads only those — keeping the payload small and the import
  deterministic.
- States: idle/instructions, busy ("Importing…"), and inline validation/errors (e.g.
  "Couldn't find hyperframes/index.html", lint failure message, missing output.mp4).
- A Back affordance to return to the create screen.

### Client
A small `httpCompositionImportClient` with `importComposition(files): Promise<ApiGenerationJob>`
that builds the `FormData` and POSTs to `/api/jobs/import` (same-origin via the Vite `/api`
proxy), mirroring the existing HTTP client patterns and error handling.

### Editor reuse
On success, store the returned job in an `importedJob` state and feed it into the existing
completed-job resolution in `CompositionDemoScreen`:
`const completedJob = importedJob ?? initialCompletedJob ?? (job.phase === "completed" ? job.job : undefined)`.
That path already renders `CompositionEditorScreen` with `jobId`, `editClient`, the
manifest-derived `repo`, and the composition/video artifact URLs — so the editor opens with
**full AI-edit + Export** and the repo link, **with no changes to `CompositionEditorScreen`**.

## Part C — Validation, security, testing

### Security / robustness
- Path-traversal guards on every uploaded relative path (reuse the artifacts.ts rules).
- Only the known file set is written; unknown/extra files are ignored.
- Multipart size/count limits.
- `lintComposition` gate ensures only editable compositions enter the pipeline.

### Tests
- **API import** (`apps/api`): happy path (folder → completed job with correct artifacts);
  missing `index.html` → 422; missing `output.mp4` → 422; lint-failing HTML → 422;
  path-traversal part rejected; request synthesized from manifest (repoUrl surfaced);
  request falls back to placeholders when manifest absent/invalid.
- **Web import client**: builds correct FormData, parses success, surfaces errors.
- **Upload screen**: folder pick and drop both collect the canonical files; error display;
  success transitions into the editor with edit enabled. Follow existing
  `CompositionDemoScreen`/client test patterns.

## Out of scope (YAGNI)

- Importing Playwright-method demos (this feature is HyperFrames-only).
- Persisting imported jobs across API restarts (job store is in-memory today; generated
  jobs already behave this way).
- Importing `.zip` archives or individual loose files (folder upload was the chosen unit).
- Any change to manual-timeline-edit rendering semantics.

## File touch list (anticipated)

- `apps/api/package.json` — add `@fastify/multipart`.
- `apps/api/src/server.ts` — register multipart + the import route.
- `apps/api/src/routes/importComposition.ts` (new) — the import handler.
- `apps/api/src/jobs/...` — reuse `indexArtifacts`; possibly a small helper to build a
  completed hyperframes result from written files.
- `apps/web/src/lib/httpCompositionImportClient.ts` (+ test) — new client.
- `apps/web/src/screens/CompositionEditor/CompositionDemoScreen.tsx` — entry button +
  upload screen + `importedJob` wiring.
- `apps/web/src/App.tsx` — construct and pass the import client.
- Tests alongside the above.
