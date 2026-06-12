# MVP-006 Export Job State Machine Design

## Goal

Make MP4 export observable, snapshot-safe, and error-specific without turning the browser prototype into a fake ffmpeg runner.

## Source Of Truth

- `docs/core-mvp-checklist.md` MVP-006
- `docs/dongha.md` current Person B next steps
- `docs/architecture.md` rule: `DemoProject` is source of truth; MP4 is an artifact
- `packages/rendering/src/node/renderFinalToMp4.ts`
- `apps/web/src/screens/Editor/ProjectExportPanel.tsx`

## Architecture

MVP-006 adds a small Node-side job coordinator around the existing real-media renderer:

```text
DemoProject
  -> freeze snapshot
  -> validating phase
  -> rendering phase
  -> probing phase
  -> succeeded | failed
```

The coordinator owns export state separately from the project model. It does not mutate `DemoProject`, write export state into the project JSON, or make the browser directly run ffmpeg. The browser export panel can display a job state object supplied by a future local API/desktop worker, but the real execution state machine lives in `@tinker/rendering/node`.

## State Model

The state machine exposes these phases:

```ts
type ExportJobPhase =
  | "idle"
  | "validating"
  | "rendering"
  | "probing"
  | "succeeded"
  | "failed";
```

Each state carries phase and progress independently of project data:

```ts
type ExportJobState = {
  id: string;
  phase: ExportJobPhase;
  progress: number;
  outputPath?: string;
  startedAt?: string;
  endedAt?: string;
  result?: RenderFinalToMp4Result;
  error?: ExportJobFailure;
};
```

`progress` is coarse and deterministic for MVP:

- `idle`: `0`
- `validating`: `0.1`
- `rendering`: `0.55`
- `probing`: `0.85`
- `succeeded`: `1`
- `failed`: current phase progress, never greater than `0.99`

## Snapshot Policy

The job runner must freeze the project snapshot before validation begins. The existing `renderFinalToMp4` function already freezes internally, but MVP-006 should make the job-level snapshot explicit so future validation, progress, and worker boundaries all use the same immutable project copy.

The job runner should pass the frozen snapshot into `renderFinalToMp4`. If the caller mutates the project after starting export, the active job still renders the original snapshot.

## Error Policy

Errors are normalized into actionable `ExportJobFailure` values:

```ts
type ExportJobFailure = {
  phase: "validating" | "rendering" | "probing";
  message: string;
  command?: {
    command: string;
    args: string[];
  };
  causeName?: string;
};
```

Validation errors happen before ffmpeg starts and must not create the output directory or partial output artifact. Rendering and probing errors should include command context when available. The command context is for developer diagnostics and future UI copy; MVP-007 will decide how much path detail is redacted for end users.

## Concurrency Policy

The coordinator prevents two active jobs from writing the same normalized output path. The second job fails in the `validating` phase with an actionable message and no render command invocation. Jobs for different output paths can run at the same time.

Use a coordinator instance rather than only module-level globals so tests and future workers can isolate state:

```ts
class ExportJobCoordinator {
  start(project: DemoProject, options: ExportJobOptions): Promise<ExportJobState>;
  getState(jobId: string): ExportJobState | undefined;
}
```

A default coordinator-backed `runExportJob` helper is fine for simple CLI use.

## UI Surface

`ProjectExportPanel` remains a browser-side plan preview. MVP-006 may add an optional `exportJobState` prop so the panel can render:

- current phase
- coarse progress percentage
- validation/render/probe failure message
- output path and, later, richer artifact success details when the local worker supplies them

This keeps job progress separate from `DemoProject` while making the future local worker integration straightforward.

## Non-Goals

- Cancellation. MVP-006 should be cancellable later, but it does not need to kill ffmpeg yet.
- Streaming exact ffmpeg percentage progress.
- Path redaction policy. MVP-007 owns user-facing path redaction.
- Moving export into the browser.
- Multiple output formats.

## Acceptance Evidence

MVP-006 is complete only when evidence proves:

- States include `idle`, `validating`, `rendering`, `probing`, `succeeded`, and `failed`.
- Job state/progress is stored separately from `DemoProject`.
- Mutating the project after job start cannot affect the in-flight export snapshot.
- Validation failure happens before render command invocation and does not create a partial artifact.
- Rendering failure reports phase, command, args, and message.
- Probe failure reports phase, command, args, and message.
- Concurrent jobs targeting the same output path are rejected before render.
- The web export panel can display job state without mutating project data.
- Full verification passes.
