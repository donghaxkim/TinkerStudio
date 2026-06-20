# Person A → Person B Handoff Contract (PB-002)

This document is the active contract Person A's generated-video pipeline (Samuel) must satisfy
so Person B's UI can track a job and preview the published video. The current generated-video
contract is the API job contract, not the legacy assisted `DemoProject` editor handoff.

The active success shape is an `ApiGenerationResult` with `method: "testreel"` and a primary
`published-video` artifact at `testreel/final.mp4`. See [`docs/demo-pipeline.md`](./demo-pipeline.md)
for the current Testreel pipeline.

Legacy assisted/editor fixtures still exist for historical Person B validation. The canonical
example of that old assisted handoff is the golden fixture:

> `packages/project-schema/fixtures/person-a-generated-project.sample.json`

It is a schema-valid `DemoProject` (schema `0.1.0`) that matches the editor design
reference (driftboard demo — 4 named clips + 2 named zoom moves, 24s @ 60fps, 16:9). This
fixture documents the removed/legacy assisted editor seam only; it is not the current
generated-video success payload.

## 1. Request: what the UI sends

Contract sources:

- Current API jobs: `packages/generation-contract/src/apiJob.ts`.
- Request parser compatibility: `packages/generation-contract/src/createDemoRequest.ts`
  (`CreateDemoRequestSchema` accepts AI URL planning requests and the legacy assisted shape).

| Mode | Schema | Required fields | Notes |
| --- | --- | --- | --- |
| `ai-url-planning` | `AiUrlPlanningCreateDemoRequestSchema` | `mode`, `durationCapSeconds`, `aspectRatio`, `repoUrl`, `productUrl` | `repoUrl` must be a public **GitHub repo root** URL; `productUrl` any http/https. |
| assisted | `AssistedCreateDemoRequestSchema` | `repoUrl`, `productUrl`, `prompt`, `durationCapSeconds`, `aspectRatio` | `.strict()`; `prompt` trimmed non-empty; `durationCapSeconds` integer ≤ 600. |

`aspectRatio` ∈ `{"16:9", "9:16", "1:1"}` (shared with the project schema).

Parse with `parseCreateDemoRequest` / `safeParseCreateDemoRequest` before acting on a request.

## 2. Job lifecycle the UI expects

Contract source: `packages/generation-contract/src/apiJob.ts` (`ApiGenerationJobSchema`).

`ApiGenerationJobStatus` ∈ `queued → running → capturing → assembling → completed → failed`.

The UI specifically branches on terminal states:

- **`completed`** — `job.result` is **required** (schema-enforced). The UI reads
  `job.result.artifacts` and opens the primary `published-video` artifact, normally
  `testreel/final.mp4`; it also reads `job.result.warnings` to surface non-fatal notes.
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

## 4. The exact current success payload

For the current Testreel path, a completed job's result is an `ApiGenerationResult`
(`packages/generation-contract/src/apiJob.ts`, `.strict()`):

```jsonc
job.result = {
  method: "testreel",                                    // REQUIRED
  artifacts: [                                           // REQUIRED
    {
      kind: "published-video",                          // REQUIRED for completed jobs
      relativePath: "testreel/final.mp4",
      url: "/api/jobs/<job-id>/artifacts/testreel/final.mp4",
      mediaType: "video/mp4"
    }
  ],
  warnings: string[]                                     // [] when clean
}
```

`ApiGenerationResultSchema` requires `method: "testreel"` and rejects completed results that
do not include a `published-video` artifact. The primary generated-video artifact is
`testreel/final.mp4`.

## 5. Legacy assisted `DemoProject` fixture requirements

This section is historical/legacy-assisted only. It describes the old editor fixture seam and
does not describe the current Testreel generated-video contract. Current generated videos use
the `ApiGenerationResult` contract in §4 and the Testreel pipeline in
[`docs/demo-pipeline.md`](./demo-pipeline.md).

Schema source: `packages/project-schema/src/validators.ts` (`DemoProjectSchema`, `.strict()`).
Legacy assisted `project` fixtures had to honor every rule below; the editor relies on them
when loading those old/sample projects:

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

## 6. Legacy guarantees about the golden fixture

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
- The legacy mock generation client returned it as `job.result.project` — proven by
  `apps/web/src/lib/mockGenerationClient.test.ts`.

Do not use the legacy `job.result.project` fixture seam for current generated-video jobs.
Current live jobs complete with the `ApiGenerationResult` shape in §4 and expose the primary
Testreel `published-video` artifact.
