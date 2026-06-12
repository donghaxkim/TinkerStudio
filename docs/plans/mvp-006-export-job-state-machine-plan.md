# MVP-006 Export Job State Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an observable export job state machine that freezes project snapshots, reports validation/render/probe phases, prevents same-path concurrent exports, and surfaces actionable failures.

**Architecture:** Implement a Node-side `ExportJobCoordinator` in `@tinker/rendering/node` around the existing `renderFinalToMp4` pipeline. Keep job state separate from `DemoProject`, and let the web export panel optionally display externally supplied job state.

**Tech Stack:** TypeScript, Vitest, React Testing Library, pnpm workspaces, existing ffmpeg/ffprobe renderer.

---

## File Map

- Create: `packages/rendering/src/node/exportJob.ts`
- Create: `packages/rendering/src/node/exportJob.test.ts`
- Modify: `packages/rendering/src/node/index.ts`
- Modify: `apps/web/src/screens/Editor/ProjectExportPanel.tsx`
- Modify: `apps/web/src/screens/Editor/ProjectExportPanel.test.tsx`
- Modify after implementation: `docs/core-mvp-checklist.md`
- Modify after implementation: `docs/dongha.md`
- Modify after implementation: this plan

---

## Task 1: Node Export Job State Machine

**Files:**

- Create: `packages/rendering/src/node/exportJob.ts`
- Create: `packages/rendering/src/node/exportJob.test.ts`
- Modify: `packages/rendering/src/node/index.ts`

- [x] **Step 1: Write failing tests for successful phase progression**

Create `packages/rendering/src/node/exportJob.test.ts` with tests that use the existing sample project and fixture root. The first test should prove the state sequence and result:

```ts
import { access, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DemoProjectSchema, type DemoProject } from "@tinker/project-schema";
import { describe, expect, it } from "vitest";
import sampleProjectInput from "../../../project-schema/fixtures/demo-project.sample.json";
import { ExportJobCoordinator, type ExportJobState } from "./exportJob.js";

const sampleProject = DemoProjectSchema.parse(sampleProjectInput);
const fixtureProjectRoot = fileURLToPath(new URL("../../../project-schema/fixtures", import.meta.url));

const probeSummary = {
  streams: [{ codec_type: "video", codec_name: "h264" }],
  format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "2.000000" },
};

function shortProject(): DemoProject {
  return {
    ...sampleProject,
    duration: 2,
    tracks: sampleProject.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => ({ ...clip, start: 0, end: 2, sourceStart: 0, sourceEnd: 2 })),
    })),
    zooms: [],
    cursorEvents: [],
  };
}

describe("ExportJobCoordinator", () => {
  it("reports validating, rendering, probing, and succeeded states", async () => {
    const states: ExportJobState[] = [];
    const coordinator = new ExportJobCoordinator({ now: () => "2026-06-11T04:00:00.000Z" });

    const finalState = await coordinator.start(shortProject(), {
      id: "job_success",
      projectRoot: fixtureProjectRoot,
      outputPath: join(fixtureProjectRoot, "tmp-job-success.mp4"),
      onStateChange: (state) => states.push(state),
      runCommand: async () => {},
      runProbe: async () => JSON.stringify(probeSummary),
    });

    expect(states.map((state) => state.phase)).toEqual(["validating", "rendering", "probing", "succeeded"]);
    expect(states.map((state) => state.progress)).toEqual([0.1, 0.55, 0.85, 1]);
    expect(finalState.phase).toBe("succeeded");
    expect(finalState.result?.artifact.path.endsWith("tmp-job-success.mp4")).toBe(true);
    expect(coordinator.getState("job_success")?.phase).toBe("succeeded");
  });
});
```

- [x] **Step 2: Run the red test**

Run:

```bash
pnpm --filter @tinker/rendering test -- src/node/exportJob.test.ts
```

Expected: fail because `./exportJob.js` does not exist.

- [x] **Step 3: Implement the state machine types and success path**

Create `packages/rendering/src/node/exportJob.ts`:

```ts
import { resolve } from "node:path";
import type { DemoProject } from "@tinker/project-schema";
import { freezeExportProjectSnapshot } from "./exportSnapshot.js";
import { renderFinalToMp4, type CommandRunner, type RenderFinalToMp4Result, type RenderFinalToMp4Options } from "./renderFinalToMp4.js";
import type { ProbeCommandRunner } from "./probeMp4Artifact.js";

export type ExportJobPhase = "idle" | "validating" | "rendering" | "probing" | "succeeded" | "failed";
export type ExportJobFailurePhase = "validating" | "rendering" | "probing";

export type ExportJobCommandContext = {
  command: string;
  args: string[];
};

export type ExportJobFailure = {
  phase: ExportJobFailurePhase;
  message: string;
  command?: ExportJobCommandContext;
  causeName?: string;
};

export type ExportJobState = {
  id: string;
  phase: ExportJobPhase;
  progress: number;
  outputPath?: string;
  startedAt?: string;
  endedAt?: string;
  result?: RenderFinalToMp4Result;
  error?: ExportJobFailure;
};

export type ExportJobOptions = RenderFinalToMp4Options & {
  id?: string;
  onStateChange?: (state: ExportJobState) => void;
};

export type ExportJobCoordinatorOptions = {
  now?: () => string;
};

export class ExportJobCoordinator {
  private readonly states = new Map<string, ExportJobState>();
  private readonly activeOutputPaths = new Set<string>();
  private readonly now: () => string;

  constructor(options: ExportJobCoordinatorOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  getState(jobId: string): ExportJobState | undefined {
    const state = this.states.get(jobId);
    return state ? cloneState(state) : undefined;
  }

  async start(project: DemoProject, options: ExportJobOptions): Promise<ExportJobState> {
    const id = options.id ?? `export_${Date.now().toString(36)}`;
    const outputPath = resolve(options.outputPath);
    const startedAt = this.now();
    const snapshot = freezeExportProjectSnapshot(project);
    let currentPhase: ExportJobFailurePhase = "validating";
    let currentCommand: ExportJobCommandContext | undefined;

    const emit = (state: ExportJobState) => {
      const cloned = cloneState(state);
      this.states.set(id, cloned);
      options.onStateChange?.(cloneState(cloned));
      return cloned;
    };

    emit({ id, phase: "validating", progress: 0.1, outputPath, startedAt });

    if (this.activeOutputPaths.has(outputPath)) {
      return emit({
        id,
        phase: "failed",
        progress: 0.1,
        outputPath,
        startedAt,
        endedAt: this.now(),
        error: {
          phase: "validating",
          message: `Another export job is already writing '${outputPath}'`,
        },
      });
    }

    this.activeOutputPaths.add(outputPath);

    const runCommand: CommandRunner = async (command, args) => {
      currentPhase = "rendering";
      currentCommand = { command, args: [...args] };
      emit({ id, phase: "rendering", progress: 0.55, outputPath, startedAt });
      await (options.runCommand ?? defaultMissingCommandRunner)(command, args);
    };

    const runProbe: ProbeCommandRunner = async (command, args) => {
      currentPhase = "probing";
      currentCommand = { command, args: [...args] };
      emit({ id, phase: "probing", progress: 0.85, outputPath, startedAt });
      return (options.runProbe ?? defaultMissingProbeRunner)(command, args);
    };

    try {
      const result = await renderFinalToMp4(snapshot, {
        ...options,
        outputPath,
        runCommand,
        runProbe,
      });

      return emit({
        id,
        phase: "succeeded",
        progress: 1,
        outputPath,
        startedAt,
        endedAt: this.now(),
        result,
      });
    } catch (error) {
      return emit({
        id,
        phase: "failed",
        progress: failureProgress(currentPhase),
        outputPath,
        startedAt,
        endedAt: this.now(),
        error: normalizeFailure(error, currentPhase, currentCommand),
      });
    } finally {
      this.activeOutputPaths.delete(outputPath);
    }
  }
}

const defaultCoordinator = new ExportJobCoordinator();

export function runExportJob(project: DemoProject, options: ExportJobOptions): Promise<ExportJobState> {
  return defaultCoordinator.start(project, options);
}

function failureProgress(phase: ExportJobFailurePhase) {
  if (phase === "rendering") return 0.55;
  if (phase === "probing") return 0.85;
  return 0.1;
}

function normalizeFailure(error: unknown, phase: ExportJobFailurePhase, command?: ExportJobCommandContext): ExportJobFailure {
  return {
    phase,
    message: error instanceof Error ? error.message : "Export failed",
    command,
    causeName: error instanceof Error ? error.name : undefined,
  };
}

function cloneState(state: ExportJobState): ExportJobState {
  return structuredClone(state);
}

async function defaultMissingCommandRunner(): Promise<void> {
  throw new Error("ExportJobCoordinator requires renderFinalToMp4 to supply the default ffmpeg runner");
}

async function defaultMissingProbeRunner(): Promise<string> {
  throw new Error("ExportJobCoordinator requires probeMp4Artifact to supply the default ffprobe runner");
}
```

Also export the existing spawned runners so omitted `runCommand` and `runProbe` still use real ffmpeg/ffprobe while the job wrapper can observe phase transitions. Rename the private helper in `renderFinalToMp4.ts` to `runSpawnedFfmpegCommand` and export it. Rename the private helper in `probeMp4Artifact.ts` to `runSpawnedFfprobeCommand` and export it. Then import those helpers in `exportJob.ts` and replace `defaultMissingCommandRunner` / `defaultMissingProbeRunner` with calls to the exported helpers.

- [x] **Step 4: Run the green success-path test**

Run:

```bash
pnpm --filter @tinker/rendering test -- src/node/exportJob.test.ts
```

Expected: success-path test passes.

- [x] **Step 5: Add failing tests for snapshot, validation failure, render failure, probe failure, and concurrency**

Extend `exportJob.test.ts` with:

```ts
it("uses the frozen job snapshot when the caller edits the project during export", async () => {
  const states: ExportJobState[] = [];
  const project = shortProject();
  const coordinator = new ExportJobCoordinator({ now: () => "2026-06-11T04:00:00.000Z" });

  const finalState = await coordinator.start(project, {
    id: "job_snapshot",
    projectRoot: fixtureProjectRoot,
    outputPath: join(fixtureProjectRoot, "tmp-job-snapshot.mp4"),
    onStateChange: (state) => states.push(state),
    runCommand: async (_command, args) => {
      project.duration = 999;
      expect(args).toContain("2");
      expect(args).not.toContain("999");
    },
    runProbe: async () => JSON.stringify(probeSummary),
  });

  expect(finalState.phase).toBe("succeeded");
  expect(states.at(-1)?.result?.artifact.duration).toBe(2);
});

it("fails validation before invoking render or creating a partial artifact", async () => {
  const states: ExportJobState[] = [];
  const outputPath = join(fixtureProjectRoot, "missing-parent", "validation-failed.mp4");
  const coordinator = new ExportJobCoordinator({ now: () => "2026-06-11T04:00:00.000Z" });
  const project = {
    ...shortProject(),
    assets: shortProject().assets.map((asset) => ({ ...asset, uri: "missing/capture.mp4" })),
  };
  let renderInvoked = false;

  await rm(dirname(outputPath), { recursive: true, force: true });
  const finalState = await coordinator.start(project, {
    id: "job_validation_failed",
    projectRoot: fixtureProjectRoot,
    outputPath,
    onStateChange: (state) => states.push(state),
    runCommand: async () => {
      renderInvoked = true;
    },
  });

  await expect(access(outputPath)).rejects.toThrow();
  expect(renderInvoked).toBe(false);
  expect(finalState.phase).toBe("failed");
  expect(finalState.error?.phase).toBe("validating");
  expect(finalState.error?.message).toMatch(/missing_file|does not exist/);
  expect(states.map((state) => state.phase)).toEqual(["validating", "failed"]);
});

it("reports render failures with phase and command context", async () => {
  const coordinator = new ExportJobCoordinator({ now: () => "2026-06-11T04:00:00.000Z" });

  const finalState = await coordinator.start(shortProject(), {
    id: "job_render_failed",
    projectRoot: fixtureProjectRoot,
    outputPath: join(fixtureProjectRoot, "tmp-render-failed.mp4"),
    runCommand: async () => {
      throw new Error("ffmpeg exploded");
    },
    runProbe: async () => JSON.stringify(probeSummary),
  });

  expect(finalState.phase).toBe("failed");
  expect(finalState.error).toMatchObject({
    phase: "rendering",
    message: "ffmpeg exploded",
    command: expect.objectContaining({ command: "ffmpeg", args: expect.arrayContaining(["-filter_complex"]) }),
  });
});

it("reports probe failures with phase and command context", async () => {
  const coordinator = new ExportJobCoordinator({ now: () => "2026-06-11T04:00:00.000Z" });

  const finalState = await coordinator.start(shortProject(), {
    id: "job_probe_failed",
    projectRoot: fixtureProjectRoot,
    outputPath: join(fixtureProjectRoot, "tmp-probe-failed.mp4"),
    runCommand: async () => {},
    runProbe: async () => {
      throw new Error("ffprobe exploded");
    },
  });

  expect(finalState.phase).toBe("failed");
  expect(finalState.error).toMatchObject({
    phase: "probing",
    message: "ffprobe exploded",
    command: expect.objectContaining({ command: "ffprobe", args: expect.arrayContaining(["-of", "json"]) }),
  });
});

it("rejects a concurrent export that targets the same output path", async () => {
  const coordinator = new ExportJobCoordinator({ now: () => "2026-06-11T04:00:00.000Z" });
  const outputPath = join(fixtureProjectRoot, "tmp-same-output.mp4");
  let resolveFirstRenderStarted: (() => void) | undefined;
  let releaseFirstRender: (() => void) | undefined;
  const firstRenderStarted = new Promise<void>((resolveStarted) => {
    resolveFirstRenderStarted = resolveStarted;
  });

  const firstJob = coordinator.start(shortProject(), {
    id: "job_first",
    projectRoot: fixtureProjectRoot,
    outputPath,
    runCommand: async () => {
      resolveFirstRenderStarted?.();
      await new Promise<void>((resolveRender) => {
        releaseFirstRender = resolveRender;
      });
    },
    runProbe: async () => JSON.stringify(probeSummary),
  });

  await firstRenderStarted;
  const secondState = await coordinator.start(shortProject(), {
    id: "job_second",
    projectRoot: fixtureProjectRoot,
    outputPath,
    runCommand: async () => {
      throw new Error("second render should not start");
    },
  });

  releaseFirstRender?.();
  await firstJob;

  expect(secondState.phase).toBe("failed");
  expect(secondState.error?.phase).toBe("validating");
  expect(secondState.error?.message).toMatch(/already writing/);
});
```

- [x] **Step 6: Run red tests for the new behavior**

Run:

```bash
pnpm --filter @tinker/rendering test -- src/node/exportJob.test.ts
```

Expected: fail until the state machine handles all failure and concurrency cases.

- [x] **Step 7: Implement missing behavior and exports**

Finish `exportJob.ts` and update `packages/rendering/src/node/index.ts`:

```ts
export type {
  ExportJobCommandContext,
  ExportJobFailure,
  ExportJobFailurePhase,
  ExportJobOptions,
  ExportJobPhase,
  ExportJobState,
} from "./exportJob.js";
export { ExportJobCoordinator, runExportJob } from "./exportJob.js";
```

If the default real ffmpeg/ffprobe runners are needed, export named helpers from `renderFinalToMp4.ts` and `probeMp4Artifact.ts` without changing their public behavior:

```ts
export async function runSpawnedFfmpegCommand(command: string, args: string[]) { ... }
export async function runSpawnedFfprobeCommand(command: string, args: string[]) { ... }
```

Then use those helpers in `renderFinalToMp4`/`probeMp4Artifact` and the job wrapper.

- [x] **Step 8: Run rendering tests**

Run:

```bash
pnpm --filter @tinker/rendering test
pnpm --filter @tinker/rendering typecheck
```

Expected: all rendering tests and typecheck pass.

---

## Task 2: Web Export Panel Job State Display

**Files:**

- Modify: `apps/web/src/screens/Editor/ProjectExportPanel.tsx`
- Modify: `apps/web/src/screens/Editor/ProjectExportPanel.test.tsx`

- [x] **Step 1: Write failing component tests**

Add tests to `ProjectExportPanel.test.tsx`:

```ts
it("shows export job phase and progress separately from the project plan", () => {
  render(
    <ProjectExportPanel
      project={sampleProject}
      exportJobState={{
        id: "job_rendering",
        phase: "rendering",
        progress: 0.55,
        outputPath: "/tmp/demo.mp4",
      }}
    />,
  );

  expect(screen.getByText("Rendering")).toBeInTheDocument();
  expect(screen.getByText("55%")).toBeInTheDocument();
  expect(screen.getByText("/tmp/demo.mp4")).toBeInTheDocument();
  expect(screen.getByText("sample-product-demo.mp4")).toBeInTheDocument();
});

it("shows actionable export job failures", () => {
  render(
    <ProjectExportPanel
      project={sampleProject}
      exportJobState={{
        id: "job_failed",
        phase: "failed",
        progress: 0.55,
        outputPath: "/tmp/demo.mp4",
        error: {
          phase: "rendering",
          message: "ffmpeg exploded",
          command: { command: "ffmpeg", args: ["-filter_complex", "graph"] },
        },
      }}
    />,
  );

  expect(screen.getByRole("alert")).toHaveTextContent("Rendering failed: ffmpeg exploded");
  expect(screen.getByText("ffmpeg")).toBeInTheDocument();
});
```

- [x] **Step 2: Run red component tests**

Run:

```bash
pnpm --filter @tinker/web test -- src/screens/Editor/ProjectExportPanel.test.tsx
```

Expected: fail because `ProjectExportPanel` has no `exportJobState` prop.

- [x] **Step 3: Add optional job state rendering**

Modify `ProjectExportPanel.tsx`:

```ts
import { prepareMp4Export } from "@tinker/editor";
import type { ExportJobState } from "@tinker/rendering/node";
import type { DemoProject } from "@tinker/project-schema";

type ProjectExportPanelProps = {
  project: DemoProject;
  exportJobState?: ExportJobState;
};
```

Render a small job status block after the plan details:

```tsx
{exportJobState ? (
  <div aria-label="Export job status" style={{ display: "grid", gap: 6, padding: 12, border: "1px solid #334155", borderRadius: 8 }}>
    <strong>{formatPhase(exportJobState.phase)}</strong>
    <span>{Math.round(exportJobState.progress * 100)}%</span>
    {exportJobState.outputPath ? <code>{exportJobState.outputPath}</code> : null}
    {exportJobState.error ? (
      <p role="alert" style={{ margin: 0, color: "#fecaca" }}>
        {formatPhase(exportJobState.error.phase)} failed: {exportJobState.error.message}
      </p>
    ) : null}
    {exportJobState.error?.command ? <code>{exportJobState.error.command.command}</code> : null}
  </div>
) : null}
```

Add helpers:

```ts
function formatPhase(phase: string) {
  return phase
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}
```

- [x] **Step 4: Run green component tests**

Run:

```bash
pnpm --filter @tinker/web test -- src/screens/Editor/ProjectExportPanel.test.tsx
pnpm --filter @tinker/web typecheck
```

Expected: export panel tests and web typecheck pass.

---

## Task 3: Docs, Checklist, Review, And Verification

**Files:**

- Modify: `docs/core-mvp-checklist.md`
- Modify: `docs/dongha.md`
- Modify: `docs/plans/mvp-006-export-job-state-machine-plan.md`

- [x] **Step 1: Run focused verification**

Run:

```bash
pnpm --filter @tinker/rendering test -- src/node/exportJob.test.ts src/node/renderFinalToMp4.test.ts
pnpm --filter @tinker/web test -- src/screens/Editor/ProjectExportPanel.test.tsx
```

Expected: focused MVP-006 behavior passes.

- [x] **Step 2: Run full gate**

Run:

```bash
pnpm validate:schema
pnpm typecheck
pnpm -r test
pnpm --filter @tinker/web build
```

Expected: every command exits 0.

- [x] **Step 3: Request code review**

Spawn a review agent with this plan, `docs/design/mvp-006-export-job-state-machine.md`, `docs/core-mvp-checklist.md` MVP-006, and the changed files. Require review of:

- phase/state coverage
- snapshot safety
- validation failure before render
- render/probe command context
- same-output concurrency guard
- web state display staying separate from `DemoProject`

- [x] **Step 4: Fix review findings and re-review**

If the reviewer finds Critical/Important issues, spawn a fixer agent with the exact issue and write scope. After the fixer reports completion, spawn a second reviewer to verify the fix. Repeat until no blockers remain.

- [x] **Step 5: Check off MVP-006**

Only after green verification and clean re-review:

- Mark MVP-006 `Status: Done` in `docs/core-mvp-checklist.md`.
- Check every MVP-006 checklist item and acceptance criterion.
- Update `docs/dongha.md` current status and next steps so MVP-007 security audit is next.
- Check off this plan's Task 3 steps.
