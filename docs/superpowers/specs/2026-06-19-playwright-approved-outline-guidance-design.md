# Design: Playwright approved-outline guidance

**Date:** 2026-06-19
**Status:** Approved (design); pending implementation plan
**Branch context:** `main`
**Related:** `docs/superpowers/specs/2026-06-16-planning-chat-to-hyperframes-design.md`, `docs/superpowers/specs/2026-06-18-understanding-strategy-agents-design.md`, `docs/superpowers/specs/2026-06-18-run-summary-truth-design.md`

## Goal

Make `Plan -> Generate video -> Playwright` respect the user-approved planning outline as
structured guidance, instead of treating it as loose prompt prose that the internal Playwright
pipeline can silently reinterpret.

The current behavior is confusing: the planning session is real and writes a validated
`outline.json`, but generation only receives that outline as a string inside `prompt`. The
Playwright pipeline then runs its own understanding, strategy, and capture-planning phases. The
final video follows the generated `playwright/capture-plan.json`, not necessarily the approved
outline the user just reviewed.

## Decision

Use **strong guidance**, not a hard contract.

The approved outline should be a first-class, validated job input and should bias the internal
strategy/storyboard/capture planner. Generation should not fail merely because the live website
cannot support a scene exactly. Instead, it should persist lineage and warnings so the output is
honest about which approved scenes were planned, captured, or skipped.

## Scope

**In scope:**
- Add an optional `approvedOutline` field to the generation contract for `ai-url-planning` jobs.
- Send `approvedOutline` from the web UI only for the planned flow (`Plan -> Generate video`).
- Preserve `Generate now` as the direct internal Playwright pipeline with no external outline.
- Thread `approvedOutline` through API job storage, local generation, and `runAiUrlDemo`.
- Convert the approved outline into strategy/storyboard guidance before the Playwright planner runs.
- Persist outline-to-storyboard/capture lineage and warnings in Playwright artifacts and run summary.
- Add tests that prove the structured outline reaches generation and influences planner input.

**Out of scope:**
- A hard semantic verifier that fails jobs when every scene is not captured.
- UI redesign for planning chat or the editor.
- Changing HyperFrames generation behavior beyond accepting the additive request field safely.
- Vision/pixel verification of whether final video frames visually match scene goals.
- Replacing the current Playwright capture-plan schema with per-step scene IDs.

## Existing Flow

Planning session:

```
POST /api/planning-sessions
  -> planning agent analyzes repo + website
  -> writes generated/planning/<id>/outline.json
  -> API validates DemoOutline and returns it to web
```

Generation today:

```
CompositionDemoScreen.startGeneration
  -> prompt = "Use this approved video outline..." + JSON.stringify(outline)
  -> POST /api/jobs
  -> runLocalGenerationJob
  -> runAiUrlDemo
  -> understanding -> strategy -> Playwright planner -> capture-plan -> final.mp4
```

The outline is not a typed field after the frontend. It is only text, so nothing can validate,
persist, or report coverage against it.

## Proposed Flow

```
CompositionDemoScreen.startGeneration
  -> POST /api/jobs { ..., prompt, approvedOutline }

API / local runner
  -> validate approvedOutline with DemoOutlineSchema
  -> store it in request snapshots and input.json
  -> pass it to runAiUrlDemo

runAiUrlDemo
  -> product understanding still runs from repo/site/prompt
  -> strategy phase receives approvedOutline as preferred story structure
  -> Playwright planner receives approvedOutline + strategy/storyboard context
  -> capture executes generated capturePlan
  -> artifacts report approved-outline lineage and warnings
```

## Contract Changes

Add `approvedOutline?: DemoOutline` to `AiUrlPlanningCreateDemoRequestSchema`.

The field is optional so direct generation, old clients, tests, and restored artifacts continue to
work. It is strict-validated using the existing `DemoOutlineSchema`; no separate outline shape is
introduced.

`CreateCompositionJobRequest` gains the same optional field. `startGeneration` sends the exact
validated `session.outline`. `startDirectGeneration` does not send it.

The server must retain `approvedOutline` in the accepted request object so job snapshots and
`input.json` prove what generation was asked to follow.

## Strategy Behavior

`runAiUrlDemo` should pass `approvedOutline` into the strategy phase. The strategy implementation
should use it as the preferred story structure:

- Preserve title, duration cap, aspect ratio, scene order, scene IDs, goals, visual intent, and
  generation notes where possible.
- Still allow the understanding/strategy agent to adapt wording and expected user actions to what
  repo and website evidence can support.
- Emit warnings when a scene appears unsupported by the analyzed website/repo evidence.

The deterministic fallback should convert `DemoOutline.scenes` into `Storyboard.beats` directly,
using a simple scene-type mapping:

- first scene -> `hook`
- last scene -> `cta`
- scenes with website evidence or interactive visual language -> `screen_capture`
- remaining middle scenes -> `feature` or `proof` based on goal/visual wording

This fallback must preserve approved scene IDs as storyboard beat IDs. If an LLM-backed strategy or
planner returns different beat IDs, lineage maps approved scenes to storyboard beats by ordered
position and records a warning for each inferred mapping.

## Playwright Planner Behavior

`AiUrlPlannerInput` gains `approvedOutline?: DemoOutline`.

The planner prompt should include a compact approved-outline context and clear instructions:

- Treat the approved outline as the primary narrative guide.
- Build the capture plan to support the approved scenes in order where the live product allows it.
- If a scene is unsupported, choose the closest safe same-origin action and reflect the gap in the
  returned storyboard goal rather than inventing unsupported product behavior.
- Do not violate existing safety rules: no auth, payments, destructive actions, external
  navigation, or unsafe input.

The planner result remains `{ storyboard, capturePlan }`; no schema-breaking per-step scene IDs are
required in this build.

## Lineage And Reporting

Add a Playwright artifact at `playwright/approved-outline-lineage.json`.

Suggested shape:

```jsonc
{
  "approvedOutlinePresent": true,
  "items": [
    {
      "sceneId": "scene-1",
      "goal": "Open with the user problem",
      "status": "captured",
      "storyboardBeatIds": ["scene-1"],
      "captureStepIndexes": [0, 1, 2],
      "warnings": []
    }
  ],
  "warnings": ["Scene scene-3 was planned but no meaningful captured action mapped to it."]
}
```

Statuses:
- `captured`: at least one mapped beat has a meaningful capture action (`click`, `type`, or
  `press`), or the scene is a static hook/CTA and final video exists.
- `planned`: mapped to one or more storyboard beats, but no meaningful capture evidence exists.
- `unsupported`: no storyboard beat maps to the approved scene, or planner/strategy explicitly
  marked it as unsupported.

`run-summary.json` should include an additive `approvedOutlineCoverage` block with the same
`items` and `warnings` from `approved-outline-lineage.json`, and the warnings should also be merged
into the top-level `warnings` array. This is an honesty/reporting mechanism, not a failure
condition.

## Error Handling

- Invalid `approvedOutline` in a job request returns the existing 422 validation path.
- If `approvedOutline` is valid but cannot be followed, generation continues with warnings.
- If the planner returns invalid JSON, unsafe navigation, or an invalid capture plan, existing
  failure behavior remains unchanged.
- If no approved outline is provided, generation behaves like the current direct/internal pipeline.

## Testing

Add or update tests at these seams:

- Generation contract validates `approvedOutline` and rejects malformed outlines.
- Web `startGeneration` sends `approvedOutline`; `startDirectGeneration` does not.
- API `/api/jobs` preserves `approvedOutline` in the accepted request snapshot.
- `runLocalGenerationJob` passes `approvedOutline` into `runAiUrlDemo`.
- `runAiUrlDemo` passes `approvedOutline` into the strategy and Playwright planner seams.
- Planner prompt includes approved-outline context and strong-guidance instructions.
- A fixture planned run writes `approved-outline-lineage.json` and includes its warnings in
  `run-summary.json` without failing the job.

## Success Criteria

- Planned Playwright jobs have a typed approved outline in request snapshots and `input.json`.
- The Playwright planner receives structured approved-outline context, not just prose.
- The final video remains driven by the generated capture plan, but the capture plan is guided by
  the approved outline and reports any gaps.
- Direct `Generate now` behavior is unchanged.
- Existing jobs without `approvedOutline` still validate and run.
