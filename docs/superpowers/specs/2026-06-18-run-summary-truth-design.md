# Design: Run-summary truth — execution block + core coverage

**Date:** 2026-06-18
**Status:** Approved (design); pending implementation plan
**Branch context:** `feat/understanding-strategy-agents`
**Related:** `docs/superpowers/specs/2026-06-18-understanding-strategy-agents-design.md`, memory `tinker-demo-pipeline`

## Goal

Make `run-summary.json` tell the honest truth about what a generation run actually did, so its
quality is observable: which mode each phase ran in (real agent vs deterministic fallback),
whether `final.mp4` was rendered from the editable project or flat-transcoded, whether
`director-plan.json` / `render-plan.json` were actually applied, and whether the demo's chosen
strategy messages + selected flow were actually captured on camera.

Today the summary lists artifacts and a shallow per-beat coverage (every beat = "captured", same
evidence) — it cannot prove the video communicated the core product concepts, nor reveal which
"nice" planning JSON wasn't applied.

## Scope

**This build targets the `renderer: "playwright"` path only.** The `execution` block and
`coreCoverage` are designed for, and derived from, Playwright artifacts (storyboard / action-trace
/ capture-lineage / final.mp4). HyperFrames is not a priority and must not shape the design. The
`run-summary.json` schema is shared across renderers, so the new fields still appear for other
renderers (type compatibility), but **no HyperFrames-specific behavior is added** — on a
non-playwright run the fields carry honest playwright-centric defaults (`finalVideoSource: "none"`,
coverage `planned`/`missing`) without special-casing. HyperFrames code is otherwise unchanged.

**In scope:**
- **(A) `execution` block** in `run-summary.json` — honesty flags for modes + applied-status.
- **(C) `coreCoverage`** array in `run-summary.json` — per-concept captured/planned/missing.
- Exported fallback-warning constants from the Understanding + Strategy agents (so mode
  detection keys off constants, not regexed English).
- Surfacing `finalVideoSource` / `finalVideoMode` / `editDecisionListApplied` from the playwright
  renderer to the summary builder.

**Out of scope (explicit non-goals):**
- **(B) Canonical camera source** — rewiring `compileProject` zooms to derive from
  `render-plan.json`. This is a rendering-behavior refactor; it gets its own spec with isolated
  render tests. This build only *reports* the current truth (`renderPlanApplied: "none"`,
  `cameraSource` naming the real source).
- Fixed-rubric coverage (problem/audience/solution/…) as a canonical source — at most a future
  strategy-quality lint.
- `valueNarrative` as a canonical coverage source — it informs strategy; coverage measures
  whether the chosen strategy/storyboard was captured.
- Pixel/vision verification of the video. Coverage is heuristic and says so.
- HyperFrames-specific reporting. No `finalVideoSource: "hyperframes"`, no HyperFrames coverage
  logic, no HyperFrames status handling. HyperFrames stays unchanged for shared-type compatibility
  only.

## Constraints (from the brief)

- **Additive schema changes only** — existing `run-summary.json` fields untouched; existing
  generated artifacts keep validating.
- **No new JSON artifacts** that aren't consumed by `run-summary.json` or tests. `coreCoverage`
  and `execution` live *inside* `run-summary.json`; their builders are code, not new files.
- Coverage is **derived from existing artifacts**: `demo-strategy.json`, `storyboard.json`,
  `action-trace.json`, `capture-lineage.json`, `director-plan.json`, `final.mp4` presence.
- If coverage is heuristic, **say so in warnings**.
- The summary must explicitly state whether `directorPlan` and `renderPlan` were applied to
  `final.mp4`.

## Architecture & data flow

`buildRunSummary` (in `runSummary.ts`) gains two new required inputs — a pre-assembled
`execution` object and a `coreCoverage` array — and includes them in the validated output.
`runAiUrlDemo` assembles both from data it already has, then calls `buildRunSummary`.

```
runAiUrlDemo (playwright path):
  understanding (warnings) , strategy (messageHierarchy, selectedFlow) , storyboard ,
  actionTrace (beatId+type) , captureLineage , finalVideoMode/finalVideoSource , editDecisionList
    │
    ├─ assemble execution  (modes via exported warning constants + backend; applied-flags)
    ├─ buildCoreCoverage({ strategy, storyboard, actionTrace, captureLineage, finalVideoProduced })
    │     → { items, warnings }
    └─ buildRunSummary({ ..., execution, coreCoverage: items, warnings: [...pipeline, ...coverage] })
```

`finalVideoMode` (already computed by `produceFinalVideo`) and a new `finalVideoSource` +
`editDecisionListApplied` are surfaced from the playwright renderer's `InternalRendererResult`.

## (A) The `execution` block

Approved shape (additive object on `RunSummary`):

```jsonc
"execution": {
  "understandingMode": "claude-code" | "deterministic-fallback" | "deterministic",
  "strategyMode":      "claude-code" | "deterministic-fallback" | "deterministic",
  "playwrightPlannerMode": "claude-code" | "opencode",
  "finalVideoMode":    "rendered" | "transcoded" | "none",
  "finalVideoSource":  "demo-project" | "raw-playwright-recording" | "none",
  "directorPlanApplied": "none" | "partial" | "full",
  "renderPlanApplied":   "none" | "partial" | "full",
  "editDecisionListApplied": true,            // boolean — EDL applied to the DemoProject
  "finalVideoReflectsEditDecisionList": true, // boolean — mp4 actually reflects the EDL
  "cameraSource": "demo-project.zooms (compileProject suggestInteractionZooms); render-plan.json is metadata only",
  "notes": ["director-plan.json and render-plan.json are metadata only in this build; not applied to final.mp4."]
}
```

Derivation (no new tracking infra; uses data already in scope):
- `understandingMode` / `strategyMode`: `deterministic` when the agent backend is off; else
  `claude-code`, downgraded to `deterministic-fallback` when that phase's `warnings` contain one
  of its **exported fallback-warning constants** (membership check, not regex).
- `playwrightPlannerMode`: `claude-code` when the agent backend is on, else `opencode` (the
  Playwright capture planner backend).
- `finalVideoMode`: surfaced from `produceFinalVideo` (`rendered|transcoded|none`).
- `finalVideoSource`: `demo-project` when rendered from the project; `raw-playwright-recording`
  when transcoded; `none` otherwise.
- `directorPlanApplied` / `renderPlanApplied`: `"none"` in this build (neither is consumed by the
  render). Enum, not boolean, so the future camera refactor updates the same field to
  `"partial"`/`"full"`.
- `editDecisionListApplied`: `true` when the EDL had cuts and was applied to the DemoProject.
- `finalVideoReflectsEditDecisionList`: `editDecisionListApplied && finalVideoMode === "rendered"`.
- `cameraSource`: honest string naming the real zoom source (makes the #2 drift explicit).
- `notes`: explicit metadata-only disclaimer for director-plan / render-plan.

### Exported fallback-warning constants

The Understanding + Strategy agent modules export their fallback warning strings as named
constants and emit them (instead of inline English):
- `understandingAgent.ts`: `UNDERSTANDING_FALLBACK_WARNINGS` — the no-repo and invalid-output
  messages (a `readonly string[]`).
- `demoStrategyAgent.ts`: `STRATEGY_FALLBACK_WARNING` — the single fallback message.
`runAiUrlDemo` imports these and checks membership to set `*Mode`. This keeps mode detection from
depending on arbitrary English and is the single source of truth for those strings.

## (C) `coreCoverage`

Additive array on `RunSummary`, computed by a pure `buildCoreCoverage(input)` in a new
`coreCoverage.ts` module (consumed by `run-summary.json` — not a standalone artifact).

Item shape:

```jsonc
{
  "id": "core-message-1",                       // or "core-selected-flow"
  "sourceType": "strategy-message" | "selected-flow",
  "concept": "Turn product URLs into editable demos",  // message text or flow name
  "strategyMessageId": "message-1",             // present for strategy-message items
  "flowId": "flow-1",                           // present for the selected-flow item
  "required": false,                            // selected-flow = true; messages = false
  "status": "captured" | "planned" | "missing",
  "beatIds": ["beat-1"],                        // storyboard beats mapping to this concept
  "artifactRefs": ["storyboard.json#beat-1", "playwright/action-trace.json#beat-1", "playwright/final.mp4"],
  "warnings": ["Static (hook) beat — storyboard/final-video evidence, not pixel verification."]
}
```

Canonical source: `strategy.messageHierarchy` + `strategy.selectedFlow`. One item per message
(`id = core-message-${i+1}`, `sourceType: "strategy-message"`, `strategyMessageId =
message-${i+1}`, `required: false`) **plus exactly one** `selected-flow` item (`id =
"core-selected-flow"`, `sourceType: "selected-flow"`, `flowId = selectedFlow.sourceFlowId`,
`required: true`) — always present, never deduplicated against the message items (it is the
stricter, interaction-required check). Coverage item `id`s are deliberately prefixed (`core-…`)
to avoid conflating them with strategy message ids (`message-N`).

**Meaningful action set (conservative):** `click`, `type`, `press` only. `scroll`, `hover`,
`navigation`, `wait` do NOT count as proof. Evidence is read from `action-trace.json` actions
(stamped with `beatId` + `type`), cross-referenced with `capture-lineage.json`.

**Status rules:**
- **strategy-message item** — map to `storyboard.beats` where `strategyMessageId === id`:
  - no mapped beat → **`missing`**
  - a mapped beat has a meaningful captured action → **`captured`**
  - all mapped beats are static (`type` ∈ {hook, cta} or `expectedUserAction == null`) and
    `final.mp4` was produced → **`captured`** + item warning ("storyboard/final-video evidence,
    not pixel verification")
  - otherwise → **`planned`**
- **selected-flow item** (stricter, `required: true`) — map to demo beats referencing the flow
  (`screen_capture` beat, or a beat whose `goal`/`narrative` references the flow name):
  - no mapped beat → **`missing`**
  - a mapped beat has a meaningful captured action → **`captured`**
  - else → **`planned`** (+ item warning if `final.mp4` exists: "selected flow not demonstrated by
    a captured interaction"). **`final.mp4` existence alone never makes the selected flow
    captured.**

**`artifactRefs`:** always include `storyboard.json#<beatId>` for each mapped beat; add
`playwright/action-trace.json#<beatId>` and/or `playwright/capture-lineage.json#<beatId>` when
meaningful actions exist; add `playwright/final.mp4` when produced.

**Absent Playwright capture evidence:** when `action-trace`/`capture-lineage` are not available
(e.g. a non-playwright run, or capture produced no trace), items with a mapped beat are `planned`
and items with no mapped beat are `missing`, with a top-level warning that no
capture-lineage/action-trace evidence exists (coverage is storyboard-only). This is the generic
no-evidence path — there is no HyperFrames-specific branch.

**Top-level warnings (`buildCoreCoverage` returns these; merged into run-summary `warnings`):**
- always: "Core coverage is heuristic — derived from proportional capture lineage, not verified
  video pixels."
- if any item is `missing` or `planned`: a summary line naming those items (required items called
  out explicitly).
- absent Playwright capture evidence: the storyboard-only-evidence warning above.

## Run status (Playwright-centered)

`RunSummary.status` (`success` | `partial` | `failed`):
- `success` only when `finalVideoMode === "rendered"` **and** every `coreCoverage` item is
  `captured`.
- `partial` when `finalVideoMode` is `transcoded` or `none`, **or** any `coreCoverage` item is
  `missing`/`planned`.
- `failed` only on actual generation failure (capture did not complete) — defensive; real
  failures throw before the summary is built.
Missing/planned coverage degrades to `partial`, never `failed` (per the brief).

## Components & interfaces

- **MODIFIED `runSummary.ts`** — add `RunExecutionSchema` + `CoreCoverageItemSchema`; add
  `execution` + `coreCoverage` to `RunSummarySchema`; `BuildRunSummaryArgs` gains
  `execution: RunExecution` and `coreCoverage: CoreCoverageItem[]`; status logic updated.
- **NEW `coreCoverage.ts`** — `buildCoreCoverage(input): { items: CoreCoverageItem[]; warnings: string[] }`,
  pure + unit-testable. Exports `MEANINGFUL_ACTION_TYPES` (`["click","type","press"]`).
- **MODIFIED `understandingAgent.ts`** — export `UNDERSTANDING_FALLBACK_WARNINGS`; emit from it.
- **MODIFIED `demoStrategyAgent.ts`** — export `STRATEGY_FALLBACK_WARNING`; emit from it.
- **MODIFIED `runAiUrlDemo.ts`** — surface `finalVideoMode`/`finalVideoSource`/
  `editDecisionListApplied` from the playwright renderer's `InternalRendererResult`; assemble
  `execution`; call `buildCoreCoverage`; pass both into `buildRunSummary`.
- **Tests:** `runSummary.test.ts` (schema + status logic + execution/coverage fields),
  `coreCoverage.test.ts` (mapping/status rules incl. selected-flow strictness, static-beat,
  missing, scroll-not-counted, no-trace-planned), `runAiUrlDemo.test.ts` (execution block
  present + truthful; coreCoverage present; deterministic path modes).

## Error handling / honesty

- `buildCoreCoverage` is pure and never throws on missing inputs — absent `actionTrace`/
  `captureLineage` yields `planned` items + the storyboard-only warning.
- Coverage is always labelled heuristic. The selected flow can never be reported `captured`
  without a real captured interaction.
- `execution` always states the real `cameraSource` and the metadata-only `notes`, so the report
  never implies director-plan/render-plan shaped the video.

## Testing

Offline / CI (no `claude`, no network):
1. `coreCoverage.test.ts` — fixtures for: message→beat captured (meaningful action); message with
   no beat → missing; static hook/cta beat + final.mp4 → captured + warning; scroll-only → not
   captured (planned); selected-flow with only `final.mp4` and no interaction → planned + warning;
   selected-flow with a click → captured; no-trace input (absent action-trace/capture-lineage) →
   mapped beats planned / unmapped missing + top-level no-evidence warning.
2. `runSummary.test.ts` — `execution` + `coreCoverage` validate; status degrades to `partial` when
   an item is planned/missing or finalVideo not rendered; `success` only when all captured +
   rendered; `finalVideoSource` mapping; enum (`none|partial|full`) for director/render applied.
3. `runAiUrlDemo.test.ts` — run produces an `execution` block whose modes match the injected
   path (deterministic when backend off), `directorPlanApplied`/`renderPlanApplied` = `"none"`,
   `coreCoverage` present and consistent with the storyboard.
4. Smoke: `pnpm --filter @tinker/demo-assembly smoke:pipeline` still passes; the generated
   `run-summary.json` shows `finalVideoMode` (rendered vs transcoded vs none) and a coreCoverage
   array.

## Open questions / future

- (B) Canonical camera source — separate spec; will flip `renderPlanApplied` to `partial`/`full`.
- Fixed-rubric strategy-quality lint — possible later, not canonical coverage.
- Pixel/vision verification of coverage — out of scope; coverage stays heuristic.
