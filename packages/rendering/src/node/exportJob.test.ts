import { access, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DemoProjectSchema, type DemoProject } from "@tinker/project-schema";
import { describe, expect, it, vi } from "vitest";
import sampleProjectInput from "../../../project-schema/fixtures/demo-project.sample.json";
import { ExportJobCoordinator, type ExportJobState } from "./exportJob.js";

const sampleProject = DemoProjectSchema.parse(sampleProjectInput);
const fixtureProjectRoot = fileURLToPath(new URL("../../../project-schema/fixtures/", import.meta.url));

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
      clips: track.clips.map((clip) => ({
        ...clip,
        start: 0,
        end: 2,
        sourceStart: 0,
        sourceEnd: 2,
      })),
    })),
    assets: sampleProject.assets.map((asset) => ({ ...asset, duration: 2 })),
    zooms: [],
    cursorEvents: [],
    aiEditHistory: [],
  };
}

describe("ExportJobCoordinator", () => {
  it("reports validating, rendering, probing, and succeeded states", async () => {
    const states: ExportJobState[] = [];
    const coordinator = new ExportJobCoordinator({ now: () => "2026-06-11T04:00:00.000Z" });

    const finalState = await coordinator.start(shortProject(), {
      id: "job_success",
      projectRoot: fixtureProjectRoot,
      allowedOutputRoots: [fixtureProjectRoot],
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

  it("keeps stored state isolated when the resolved final state is mutated", async () => {
    const coordinator = new ExportJobCoordinator({ now: () => "2026-06-11T04:00:00.000Z" });

    const finalState = await coordinator.start(shortProject(), {
      id: "job_mutation_isolated",
      projectRoot: fixtureProjectRoot,
      allowedOutputRoots: [fixtureProjectRoot],
      outputPath: join(fixtureProjectRoot, "tmp-job-mutation-isolated.mp4"),
      runCommand: async () => {},
      runProbe: async () => JSON.stringify(probeSummary),
    });

    finalState.phase = "failed";
    finalState.result!.artifact.duration = 999;

    expect(coordinator.getState("job_mutation_isolated")).toMatchObject({
      phase: "succeeded",
      result: { artifact: { duration: 2 } },
    });
  });

  it("generates distinct ids for no-id jobs started with a fixed clock", async () => {
    const coordinator = new ExportJobCoordinator({ now: () => "2026-06-11T04:00:00.000Z" });
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(1_781_148_000_000);

    try {
      const firstState = await coordinator.start(shortProject(), {
        projectRoot: fixtureProjectRoot,
        allowedOutputRoots: [fixtureProjectRoot],
        outputPath: join(fixtureProjectRoot, "tmp-generated-id-first.mp4"),
        runCommand: async () => {},
        runProbe: async () => JSON.stringify(probeSummary),
      });
      const secondState = await coordinator.start(shortProject(), {
        projectRoot: fixtureProjectRoot,
        allowedOutputRoots: [fixtureProjectRoot],
        outputPath: join(fixtureProjectRoot, "tmp-generated-id-second.mp4"),
        runCommand: async () => {},
        runProbe: async () => JSON.stringify(probeSummary),
      });

      expect(firstState.id).not.toBe(secondState.id);
      expect(coordinator.getState(firstState.id)?.outputPath).toBe(firstState.outputPath);
      expect(coordinator.getState(secondState.id)?.outputPath).toBe(secondState.outputPath);
    } finally {
      dateNow.mockRestore();
    }
  });

  it("uses the frozen job snapshot when the caller edits the project during export", async () => {
    const states: ExportJobState[] = [];
    const project = shortProject();
    const coordinator = new ExportJobCoordinator({ now: () => "2026-06-11T04:00:00.000Z" });

    const finalState = await coordinator.start(project, {
      id: "job_snapshot",
      projectRoot: fixtureProjectRoot,
      allowedOutputRoots: [fixtureProjectRoot],
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
      allowedOutputRoots: [fixtureProjectRoot],
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
      allowedOutputRoots: [fixtureProjectRoot],
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

  it("reports non-error render failures with rejection context", async () => {
    const coordinator = new ExportJobCoordinator({ now: () => "2026-06-11T04:00:00.000Z" });

    const finalState = await coordinator.start(shortProject(), {
      id: "job_render_string_failed",
      projectRoot: fixtureProjectRoot,
      allowedOutputRoots: [fixtureProjectRoot],
      outputPath: join(fixtureProjectRoot, "tmp-render-string-failed.mp4"),
      runCommand: async () => {
        throw "ffmpeg exited strangely";
      },
      runProbe: async () => JSON.stringify(probeSummary),
    });

    expect(finalState.phase).toBe("failed");
    expect(finalState.error?.message).toContain("ffmpeg exited strangely");
  });

  it("reports probe failures with phase and command context", async () => {
    const coordinator = new ExportJobCoordinator({ now: () => "2026-06-11T04:00:00.000Z" });

    const finalState = await coordinator.start(shortProject(), {
      id: "job_probe_failed",
      projectRoot: fixtureProjectRoot,
      allowedOutputRoots: [fixtureProjectRoot],
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

  it("rejects a concurrent export that targets the same normalized output path", async () => {
    const coordinator = new ExportJobCoordinator({ now: () => "2026-06-11T04:00:00.000Z" });
    const outputPath = join(fixtureProjectRoot, "tmp-same-output.mp4");
    const equivalentOutputPath = join(fixtureProjectRoot, "nested", "..", "tmp-same-output.mp4");
    let resolveFirstRenderStarted: (() => void) | undefined;
    let releaseFirstRender: (() => void) | undefined;
    let secondRenderInvoked = false;
    const firstRenderStarted = new Promise<void>((resolveStarted) => {
      resolveFirstRenderStarted = resolveStarted;
    });

    const firstJob = coordinator.start(shortProject(), {
      id: "job_first",
      projectRoot: fixtureProjectRoot,
      allowedOutputRoots: [fixtureProjectRoot],
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
      allowedOutputRoots: [fixtureProjectRoot],
      outputPath: equivalentOutputPath,
      runCommand: async () => {
        secondRenderInvoked = true;
      },
    });

    releaseFirstRender?.();
    await firstJob;

    expect(secondState.phase).toBe("failed");
    expect(secondState.error?.phase).toBe("validating");
    expect(secondState.error?.message).toMatch(/already writing/);
    expect(secondRenderInvoked).toBe(false);
  });
});
