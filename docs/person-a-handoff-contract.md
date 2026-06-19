# Person A → Person B Handoff Contract (PB-002)

This document is the contract Person A's generation pipeline (Samuel) must satisfy so its
output opens, edits, and exports cleanly in Person B's editor. The canonical example of a
valid handoff is the golden fixture:

> `packages/project-schema/fixtures/person-a-generated-project.sample.json`

It is a schema-valid `DemoProject` (schema `0.1.0`) that matches the editor design
reference (driftboard demo — 4 named clips + 2 named zoom moves, 24s @ 60fps, 16:9). The
web app loads it as both the "Use sample project" content and the mock generation success
result. **If Person A's generator emits projects shaped like this fixture, they will open
and export in the editor with zero further changes.**

## 1. Request: what the UI sends

Contract source: `packages/generation-contract/src/createDemoRequest.ts`
(`CreateDemoRequestSchema` accepts AI URL planning requests and the legacy assisted shape).

| Mode | Schema | Required fields | Notes |
| --- | --- | --- | --- |
| `ai-url-planning` | `AiUrlPlanningCreateDemoRequestSchema` | `mode`, `durationCapSeconds`, `aspectRatio`, `repoUrl`, `productUrl` | `repoUrl` must be a public **GitHub repo root** URL; `productUrl` any http/https. |
| assisted | `AssistedCreateDemoRequestSchema` | `repoUrl`, `productUrl`, `prompt`, `durationCapSeconds`, `aspectRatio` | `.strict()`; `prompt` trimmed non-empty; `durationCapSeconds` integer ≤ 600. |

`aspectRatio` ∈ `{"16:9", "9:16", "1:1"}` (shared with the project schema).

Parse with `parseCreateDemoRequest` / `safeParseCreateDemoRequest` before acting on a request.

## 2. Job lifecycle the UI expects

Contract source: `packages/generation-contract/src/generationJob.ts` (`GenerationJobSchema`).

`GenerationStatus` ∈ `queued → running → capturing → assembling → completed → succeeded → failed → canceled`.

The UI specifically branches on terminal states:

- **`succeeded`** — `job.result` is **required** (schema-enforced). The UI reads
  `job.result.project` to open the editor and `job.result.warnings` to surface non-fatal notes.
- **`failed`** — `job.error` is **required** (`{ code, message, retryable }`). The UI shows
  `error.message` in the chat thread and preserves the user's repo + prompt for retry.

A `GenerationJob` also carries `id`, `request` (echoes the accepted request), `createdAt`,
`updatedAt`, and `progressEvents`.

## 3. Progress events the UI renders

Contract source: `packages/generation-contract/src/progress.ts`.

The assisted/AI progress stream uses `AssistedGenerationProgressEventSchema` with a `phase`
field rendered through `GENERATION_PHASE_LABELS`:

| `phase` | Label shown |
| --- | --- |
| `queued` | Queued |
| `analyzing_product` | Analyzing product |
| `creating_storyboard` | Creating storyboard |
| `planning_capture` | Planning capture |
| `capturing` | Capturing |
| `compiling_project` | Compiling project |
| `validating_project` | Validating project |
| `complete` | Complete |

(There is also a runner progress event schema with a `status` field for local/API jobs;
the assisted phases above are what the legacy in-app mock flow renders.)

## 4. The exact success payload

For the assisted/in-app path, a succeeded job's result is an `AssistedGenerationResult`
(`packages/generation-contract/src/generationResult.ts`, `.strict()`):

```jsonc
job.result = {
  project: <valid DemoProject, schemaVersion "0.1.0">,  // REQUIRED
  artifacts?: {                                          // optional
    storyboardAssetId?, captureTraceAssetId?, previewVideoAssetId?
  },
  warnings: string[]                                     // non-empty strings; [] when clean
}
```

`project` must validate against `DemoProjectSchema` (`@tinker/project-schema`). The golden
fixture is exactly such a `project`.

## 5. What a valid `DemoProject` must satisfy

Schema source: `packages/project-schema/src/validators.ts` (`DemoProjectSchema`, `.strict()`).
Person A's generated `project` MUST honor every rule below — these are enforced and the
editor relies on them:

- `schemaVersion` is the literal `"0.1.0"`. `duration` > 0, `fps` > 0, `aspectRatio` valid.
- **Asset refs resolve.** Every `clip.assetId` references an `asset.id` present in `assets`.
  Asset ids, track ids, clip ids, and zoom ids are each unique.
- **Captured media is referenced realistically.** Use `source: "captured"`, `type: "video"`.
  In the editor's browser preview, the asset `uri` `assets/capture-001.mp4` is mapped to the
  bundled sample capture (`packages/editor/src/project/assetResolver.ts`); use that uri (or a
  browser-resolvable http/https video URL) so the preview renders.
- **Clip bounds are ordered and in range.** `0 ≤ start < end ≤ duration`. `sourceStart ≥ 0`;
  if `sourceEnd` is set, `sourceEnd > sourceStart` and must stay within the real asset
  duration (reuse segments when the capture is shorter than the timeline — the golden fixture
  reuses the 3s capture across all four clips).
- **Zoom bounds are ordered and in range.** `0 ≤ start < end ≤ duration`. Give each zoom a
  positive-area `target` Rect, an optional `scale`, and an `easing`.
- **`ZoomKeyframe.name` (PB-012, optional additive field — Person A review requested).**
  `ZoomKeyframeSchema` now accepts an optional `name: string` (min 1 char). When present, the
  editor displays it in the timeline zoom bar and the Zoom-panel rowcard list instead of the
  generic "Zoom N" fallback. The golden fixture sets `name: "Invite modal"` and
  `name: "Share button"` to match the design reference. Existing generated projects that omit
  `name` continue to validate unchanged. **Person A: consider setting `name` on generated
  zooms** (e.g. derived from the surrounding clip name or the closest cursor-click label) so
  the editor labels match what the generation storyboard intended. Do not make it required.
- **Cursor events** are within `[0, duration]`. A realistic stream (mostly `move`, a few
  `click`) gives the preview a cursor and the auto-zoom dwell data.
- **MVP scope only** — no captions, callouts, text overlays, audio tracks, or voiceover.
  The schema rejects them (`.strict()`).
- The optional `cursor` display block (PB-006) may be omitted; defaults apply
  (cursor shown, "ring" click effect, 500ms). Do not make it required.

## 6. Guarantees about the golden fixture

- It validates with `DemoProjectSchema` — proven by
  `packages/project-schema/src/goldenFixture.test.ts` and `pnpm validate:schema` (which now
  validates both `demo-project.sample.json` and the golden fixture).
- It **opens and edits** in Person B's editor — proven by
  `apps/web/src/screens/Editor/EditorScreen.test.tsx` ("golden driftboard fixture (PB-010)"):
  the timeline shows the 4 named clips and 2 zoom moves, the title is "Driftboard Demo", and
  the timecode reads `0:24.0`.
- It **export-preflights** in the editor — the same test asserts a succeeded export job with
  a `24s @ 60fps` artifact summary. The real MP4 is produced by running
  `pnpm --filter @tinker/rendering render:sample`.
- The mock generation client returns it as `job.result.project` — proven by
  `apps/web/src/lib/mockGenerationClient.test.ts`.

When Person A's real generator is ready, swap the mock client (`apps/web/src/lib/
mockGenerationClient.ts`) for the live `GenerationClient`. As long as the live client returns
a `succeeded` job whose `result.project` satisfies §5, the editor seam needs no changes.
