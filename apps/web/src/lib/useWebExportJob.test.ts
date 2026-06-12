import { act, renderHook } from "@testing-library/react";
import { DemoProjectSchema } from "@tinker/project-schema";
import { describe, expect, it } from "vitest";
import sampleProjectInput from "../../../../packages/project-schema/fixtures/demo-project.sample.json";
import { useWebExportJob } from "./useWebExportJob.js";

const sampleProject = DemoProjectSchema.parse(sampleProjectInput);

// ─── helpers ───────────────────────────────────────────────────────────────────

/** Build a project that will fail prepareMp4Export (duration=0 is rejected by the schema). */
function invalidProject() {
  return {
    ...sampleProject,
    // duration=0 is rejected by the schema ("Too small: expected number to be >0")
    // We bypass the schema to simulate a corrupted project that prepareMp4Export rejects.
    duration: 0,
  } as typeof sampleProject;
}

// ─── tests ─────────────────────────────────────────────────────────────────────

describe("useWebExportJob", () => {
  it("starts in the idle state (no job state)", () => {
    const { result } = renderHook(() => useWebExportJob());
    expect(result.current.state).toBeUndefined();
    expect(result.current.isRunning).toBe(false);
  });

  describe("successful preflight (validating → succeeded)", () => {
    it("transitions to succeeded after a valid project preflight", () => {
      const { result } = renderHook(() => useWebExportJob());

      act(() => {
        result.current.start(sampleProject);
      });

      expect(result.current.state?.phase).toBe("succeeded");
      expect(result.current.state?.progress).toBe(1);
    });

    it("carries outputPath on success", () => {
      const { result } = renderHook(() => useWebExportJob());

      act(() => {
        result.current.start(sampleProject);
      });

      expect(result.current.state?.outputPath).toMatch(/generated\/.*\.mp4/);
    });

    it("carries the local render command on success", () => {
      const { result } = renderHook(() => useWebExportJob());

      act(() => {
        result.current.start(sampleProject);
      });

      expect(result.current.state?.renderCommand).toMatch(/render:sample/);
      expect(result.current.state?.renderCommand).toMatch(/\.mp4/);
    });

    it("provides a complete artifact summary on success", () => {
      const { result } = renderHook(() => useWebExportJob());

      act(() => {
        result.current.start(sampleProject);
      });

      const summary = result.current.state?.artifactSummary;
      expect(summary).toBeDefined();
      expect(summary?.dimensions).toMatch(/\d+×\d+/);
      expect(summary?.timeline).toMatch(/\d+s @ \d+fps/);
      expect(summary?.codec).toMatch(/h264 mp4/);
      expect(summary?.outputPath).toMatch(/generated\/.*\.mp4/);
      expect(summary?.renderCommand).toMatch(/render:sample/);
    });

    it("is not running after success", () => {
      const { result } = renderHook(() => useWebExportJob());

      act(() => {
        result.current.start(sampleProject);
      });

      expect(result.current.isRunning).toBe(false);
    });
  });

  describe("failed preflight (validating → failed)", () => {
    it("transitions to failed when the project is invalid", () => {
      const { result } = renderHook(() => useWebExportJob());

      act(() => {
        result.current.start(invalidProject());
      });

      expect(result.current.state?.phase).toBe("failed");
      expect(result.current.state?.error?.phase).toBe("validating");
      expect(result.current.state?.error?.message).toBeTruthy();
    });

    it("is not running after failure", () => {
      const { result } = renderHook(() => useWebExportJob());

      act(() => {
        result.current.start(invalidProject());
      });

      expect(result.current.isRunning).toBe(false);
    });

    it("allows retry after failure (failed → start → succeeded)", () => {
      const { result } = renderHook(() => useWebExportJob());

      // First attempt fails.
      act(() => {
        result.current.start(invalidProject());
      });
      expect(result.current.state?.phase).toBe("failed");

      // Retry with a valid project — should succeed.
      act(() => {
        result.current.start(sampleProject);
      });
      expect(result.current.state?.phase).toBe("succeeded");
    });
  });

  describe("duplicate-start prevention", () => {
    it("allows re-running after a terminal (succeeded) job and produces a fresh job", () => {
      // Because preflight is synchronous, the "validating" phase is never externally
      // observable — the in-flight guard's user-facing protection is the disabled Start
      // button (tested via the panel's isExportRunning prop).
      const { result } = renderHook(() => useWebExportJob());

      act(() => {
        result.current.start(sampleProject);
      });
      const firstJobId = result.current.state?.id;
      expect(result.current.state?.phase).toBe("succeeded");

      // A second start on a terminal (succeeded) state should produce a new job.
      act(() => {
        result.current.start(sampleProject);
      });
      const secondJobId = result.current.state?.id;
      expect(secondJobId).not.toBe(firstJobId);
      expect(result.current.state?.phase).toBe("succeeded");
    });
  });

  describe("snapshot isolation", () => {
    it("mutating the original project AFTER start() does not change the job's outputPath", () => {
      const { result } = renderHook(() => useWebExportJob());
      const mutableProject = { ...sampleProject, id: "original-id" };

      act(() => {
        result.current.start(mutableProject);
      });

      const outputPathBefore = result.current.state?.outputPath;
      expect(outputPathBefore).toContain("original-id");

      // Mutate the project after the job started.
      mutableProject.id = "mutated-id";

      // The job state must still reference the original id.
      expect(result.current.state?.outputPath).toBe(outputPathBefore);
      expect(result.current.state?.outputPath).toContain("original-id");
      expect(result.current.state?.outputPath).not.toContain("mutated-id");
    });

    it("mutating the original project AFTER start() does not affect artifact summary", () => {
      const { result } = renderHook(() => useWebExportJob());
      const mutableProject = { ...sampleProject, id: "snap-id-1" };

      act(() => {
        result.current.start(mutableProject);
      });

      const summaryBefore = result.current.state?.artifactSummary;
      expect(summaryBefore?.outputPath).toContain("snap-id-1");

      // Mutate the project after start.
      mutableProject.id = "snap-id-2";

      // Summary must be unchanged.
      expect(result.current.state?.artifactSummary?.outputPath).toContain("snap-id-1");
      expect(result.current.state?.artifactSummary?.outputPath).not.toContain("snap-id-2");
    });
  });
});
