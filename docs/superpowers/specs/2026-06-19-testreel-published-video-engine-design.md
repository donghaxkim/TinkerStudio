# Design: Testreel Published Video Engine

**Date:** 2026-06-19
**Status:** Approved for implementation
**Related:** `docs/demo-pipeline.md`, `docs/smooth-playwright-capture.md`, `docs/superpowers/specs/2026-06-19-playwright-only-full-deletion-design.md`

## Goal

Make Testreel the sole engine for generated published demo videos.

Tinker should keep its product analysis, repo analysis, Product Understanding, Demo Strategy,
storyboard, job orchestration, progress reporting, artifact serving, preview, and export flow. After
the story is chosen, the planner should emit a Testreel recording definition, the generation job
should run the local Testreel CLI, and the final published artifact should be Testreel's MP4.

The immediate goal is not an editable Tinker timeline. It is: generate, preview, and export a polished
final video.

## Decision

Replace the active AI URL video-generation backend with a Testreel CLI path.

This is not a long-term dual-engine design. The implementation PR should add the Testreel path, switch
generation to it, verify the new published-video output, and then delete the old active capture/render
code that is no longer used by this flow.

Use Testreel as a local project dependency and invoke its local CLI/bin from Tinker's generation
runner. Do not depend on a global `testreel` install and do not use a hosted API. Testreel is MIT
licensed local OSS, so no remote Testreel service is required.

## Existing State

The current AI URL generation flow is Playwright-centered:

```text
POST /api/jobs
  -> runLocalGenerationJob
  -> runAiUrlDemo
     -> analysis
     -> understanding
     -> strategy + storyboard
     -> planner emits Tinker CapturePlan
     -> @tinker/browser-capture runs Playwright
     -> smooth synthetic cursor / eased scroll / click ripple are baked into webm
     -> action-trace.json + render-plan.json + edit-decision-list.json + director-plan.json
     -> compile DemoProject
     -> @tinker/rendering renders demo-project.json to final.mp4
```

The weak part is the last half: our local Playwright recording polish, auto zoom, mouse rendering, and
click effects are less polished than Testreel's built-in output.

Testreel already provides the pieces we want for the published artifact:

- JSON/JSONC/YAML recording definitions with `url`, `viewport`, `outputSize`, `steps`, `cursor`,
  `chrome`, `background`, `speed`, and `outputFormat`.
- A local CLI: `testreel <definition> --output <dir> --format mp4 --clean`.
- Animated cursor overlay, cursor style detection, click ripples, smooth scroll, zoom steps, window
  chrome, background styling, screenshots, WebM/MP4/GIF output, and `output.json` manifest.
- MIT license.

## Proposed Flow

```text
POST /api/jobs
  -> runLocalGenerationJob
  -> runAiUrlDemo
     -> analysis
     -> understanding
     -> strategy + storyboard
     -> planner emits Testreel recording definition
     -> write testreel/recording.json
     -> validate recording definition
     -> run local Testreel CLI with --format mp4
     -> normalize Testreel output into Tinker job artifacts
     -> run-summary.json
     -> web preview/export opens the Testreel MP4
```

Testreel's MP4 is the published video. Tinker no longer compiles a `DemoProject` or renders
`final.mp4` from the old browser-capture result for this generation path.

## Planning Contract

Change the planner's video-execution output from Tinker's `CapturePlan` to a Testreel recording
definition.

The planner still receives the same upstream context:

- Product URL and prompt.
- Product analysis and repo analysis.
- Product Understanding artifact.
- Demo Strategy artifact.
- Strategic storyboard.
- Duration cap and aspect ratio.

The planner should emit a Tinker-owned wrapper with a Testreel definition inside it:

```ts
type TestreelGenerationPlan = {
  engine: "testreel";
  definition: TestreelRecordingDefinition;
  expectedCheckpoints: Array<{
    id: string;
    label: string;
    selector?: string;
    text?: string;
  }>;
  notes?: string[];
};
```

The wrapper keeps Tinker-specific safety and reporting fields without forcing downstream code to know
about the old `CapturePlan` shape. The Testreel definition itself should be close to Testreel's native
schema so the planner learns the final engine directly instead of targeting a Tinker intermediate that
then needs translation.

Default planner output should include:

- `url`: target product URL.
- `viewport`: derived from requested aspect ratio, normally 1280x720 for 16:9.
- `outputSize`: normally 1920x1080 for 16:9 published output.
- `outputFormat`: `"mp4"`.
- `cursor`: enabled with polished defaults.
- `chrome`: enabled unless the story explicitly needs a raw browser frame.
- `background`: enabled with a Tinker-owned default visual treatment.
- `steps`: Testreel actions (`click`, `type`, `fill`, `scroll`, `hover`, `keyboard`, `wait`, `zoom`,
  `screenshot`, etc.).

## CLI Execution

Install Testreel as a workspace dependency for the package that runs generation. Prefer a normal npm
dependency over vendoring source code at first.

The runner should:

1. Write `generated/<run>/testreel/recording.json`.
2. Run Testreel validation, either via `testreel validate <file> --quiet` or by invoking the default
   command with `--dry-run`.
3. Run the local CLI, not a global install:

```bash
testreel generated/<run>/testreel/recording.json \
  --output generated/<run>/testreel/output \
  --format mp4 \
  --clean \
  --quiet
```

The implementation can resolve the CLI through package manager execution or through the installed bin
path, but it must be deterministic in local development and in the API worker environment.

Cancellation should terminate the spawned Testreel process and its child Chromium/FFmpeg process group
using the same process-group pattern already used by Tinker's FFmpeg runners.

## Artifact Layout

Use a new `testreel/` artifact namespace while preserving frontend preview/export behavior.

```text
generated/<run>/
  input.json
  product-analysis.json
  repo-analysis.json
  product-understanding.json
  demo-strategy.json
  storyboard.json

  testreel/
    recording-plan.json          # Tinker wrapper: engine, definition, checkpoints, notes
    recording.json               # raw Testreel definition as executed
    output/
      output.json                # Testreel manifest
      *.mp4                      # Testreel published video
      *.png                      # Testreel screenshots, including final screenshot

  run-summary.json
```

The completed API job should expose a `published-video` artifact that the existing web preview can
open. Do not keep using `playwright-video` for new Testreel output; updating the frontend artifact
selection is part of this replacement PR.

The final MP4 path should be stable for preview/export. If Testreel writes timestamped names, Tinker
should copy or rename the selected MP4 to:

```text
generated/<run>/testreel/final.mp4
```

The API should serve that file as the completed job's primary published video artifact.

## Contract Changes

Update shared generation contracts around published-video output rather than Playwright-specific
capture output:

- Add artifact kinds for the Testreel recording plan, raw recording definition, Testreel manifest,
  screenshots, and primary `published-video` MP4.
- Stop requiring `projectPath` to point at `playwright/demo-project.json` for this generation path.
- Make completed jobs valid when they have a published video artifact even without a `DemoProject`.
- Update run-summary execution metadata so `finalVideoMode` or equivalent reports `"testreel"`.
- Update frontend completed-job selection to prefer the published video artifact and open the existing
  standalone video preview/export shell.

No backward compatibility is required for old generated Playwright folders in this new flow. Existing
historical folders may stop restoring if their artifact shape no longer matches the active API
contract.

## Safety And Validation

Tinker should preserve the safety checks that matter before handing execution to Testreel:

- The root recording URL must stay on the product URL origin or an explicitly allowed same-site URL.
- Planner-emitted navigation steps must not leave the target origin.
- Environment variable substitution in Testreel definitions should be avoided for generated plans unless
  explicitly needed later; generated definitions should contain concrete values.
- Checkpoints should be retained in `recording-plan.json` and represented in `run-summary.json` as
  planner-declared expectations. The first implementation should not claim independent checkpoint
  pass/fail results unless they are enforced by Testreel `waitFor` gates in the recording steps. Do not
  add a second browser verification pass in this PR.
- Testreel process failures should fail the generation job at the `capture` stage with stderr trimmed
  into the job error.
- Missing MP4 output after a successful CLI exit should fail assembly with a clear error.

## Deletion Scope

The implementation PR should delete old code after the Testreel path is working and wired to preview.
Deletion is part of this design because the target is one coherent replacement PR, not a feature flag.

Delete from the active AI URL generation path:

- Tinker `CapturePlan` planner output and prompts for the main AI URL flow.
- `runPlaywrightCapture` usage in `runAiUrlDemo`.
- Smooth synthetic cursor, eased scroll, and click ripple capture code if no tests or non-AI flows still
  depend on it.
- `action-trace.json`, `capture-lineage.json`, `render-plan.json`, `director-plan.json`, and
  `edit-decision-list.json` production for the published-video path.
- `compileProject` and `renderFinalToMp4` usage for AI URL published output.
- Frontend/API assumptions that a completed generated video must have `playwright/demo-project.json`.

Keep only what is still needed:

- Upstream analysis, understanding, strategy, and storyboard artifacts.
- Job queueing, cancellation, progress, artifact indexing, artifact serving, and standalone video
  preview/export.
- Narrow helper types or validation functions if they remain useful outside the removed Playwright
  path.

If a module is still needed by manual fixtures or editor-only tests, either move it out of the AI URL
generation path or explicitly keep it with a documented owner. Do not leave dead compatibility shims for
the old published-video path.

## Frontend Behavior

For this slice, the web app should open a generated result as a standalone polished video:

- Completed job finds the primary published video artifact.
- Preview uses the existing video element/shell.
- Export/download points at the Testreel MP4.
- Timeline editing, auto zoom editing, and `DemoProject` editing are not required for generated Testreel
  videos in this PR.

Copy should describe the output as a generated demo video, not a Playwright project.

## Testing

Add or update tests to cover:

- Planner output validation accepts Testreel recording definitions and rejects old Tinker `CapturePlan`
  output for the active AI URL flow.
- Testreel CLI runner writes `recording.json`, invokes validation, invokes recording with `--format mp4`,
  captures stdout/stderr, handles cancellation, and selects/copies `final.mp4`.
- `runAiUrlDemo` completes with Testreel artifacts and no `demo-project.json` requirement.
- `runLocalGenerationJob` returns a completed result with a primary published video artifact.
- API artifact indexing exposes Testreel recording, manifest, screenshots, and final MP4.
- Frontend completed-job handling opens the standalone video preview/export shell from the published
  video artifact.
- Searches for removed active-path symbols do not find stale usage in source/tests after deletion.

Final verification should include:

```bash
pnpm --filter @tinker/generation-contract test
pnpm --filter @tinker/demo-assembly test
pnpm --filter @tinker/api test
pnpm --filter @tinker/web test
pnpm typecheck
```

Add a targeted local smoke command for the Testreel path, for example:

```bash
pnpm --filter @tinker/demo-assembly generate:ai-url-job -- --repo <repo> --url <url> --duration 45
```

The smoke pass succeeds only if `generated/<run>/testreel/final.mp4` exists and is served by the API as
the primary preview/export artifact.

## Risks

- Testreel is early (`0.2.0` at inspection time), so its CLI/output names may change. Mitigate by
  isolating all CLI invocation and manifest parsing in one runner module.
- Planner quality may regress initially because the LLM must learn Testreel's action schema. Mitigate
  with explicit prompt examples and schema validation before execution.
- Some previous run-summary coverage fields depend on action traces and DemoProject output. Mitigate by
  simplifying run-summary for this path rather than fabricating old fields.
- If Testreel internals need patches, first isolate the dependency behind Tinker's runner. Vendor or fork
  only after a concrete blocker appears.

## Success Criteria

- New generated jobs produce `generated/<run>/testreel/recording.json`, Testreel output manifest, and a
  stable `generated/<run>/testreel/final.mp4`.
- The web app previews and exports that MP4 without requiring `demo-project.json`.
- The active AI URL generation path no longer runs Tinker's Playwright capture, synthetic cursor polish,
  render-plan, EDL, DemoProject compilation, or renderer export for the published video.
- Old unused active-path code is deleted in the same PR after the Testreel path is verified.
- Targeted tests and typechecks pass.
