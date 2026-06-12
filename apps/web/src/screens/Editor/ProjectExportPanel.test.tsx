import { fireEvent, render, screen } from "@testing-library/react";
import { DemoProjectSchema } from "@tinker/project-schema";
import { describe, expect, it, vi } from "vitest";
import sampleProjectInput from "../../../../../packages/project-schema/fixtures/demo-project.sample.json";
import type { ArtifactSummary } from "../../lib/useWebExportJob.js";
import { ProjectExportPanel } from "./ProjectExportPanel.js";

const sampleProject = DemoProjectSchema.parse(sampleProjectInput);

describe("ProjectExportPanel", () => {
  it("shows the MP4 artifact details for the current project", () => {
    render(<ProjectExportPanel project={sampleProject} />);

    expect(screen.getByRole("heading", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByText("sample-product-demo.mp4")).toBeInTheDocument();
    expect(screen.getByText("video/mp4")).toBeInTheDocument();
    expect(screen.getByText("1920 × 1080")).toBeInTheDocument();
    expect(screen.getByText(/4 render layers/)).toBeInTheDocument();
  });

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
    expect(screen.getByRole("status", { name: "Export job status" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Export progress" })).toHaveAttribute("aria-valuenow", "55");
    expect(screen.getByText("/tmp/demo.mp4")).toBeInTheDocument();
    expect(screen.getByText("sample-product-demo.mp4")).toBeInTheDocument();
  });

  it("keeps long export artifact and job strings from forcing narrow layouts wider", () => {
    render(
      <ProjectExportPanel
        project={{
          ...sampleProject,
          title: "A very long generated demo artifact filename that should wrap inside the panel instead of expanding the grid",
        }}
        exportJobState={{
          id: "job_wrapping",
          phase: "rendering",
          progress: 0.25,
          outputPath: "/tmp/exports/a/really/long/output/path/with/no-natural-breaks/supercalifragilisticexpialidocious-demo-render-output-file-name.mp4",
          error: {
            phase: "rendering",
            message: "ffmpeg exploded",
            command: {
              command: "ffmpeg-with-a-very-long-command-name-that-should-not-expand-the-export-panel",
              args: [],
            },
          },
        }}
      />,
    );

    expect(screen.getByText("a-very-long-generated-demo-artifact-filename-that-should-wrap-inside-the-panel-instead-of-expanding-the-grid.mp4")).toHaveStyle({
      minWidth: "0",
      overflowWrap: "anywhere",
    });
    expect(screen.getByText(/supercalifragilisticexpialidocious/)).toHaveStyle({
      minWidth: "0",
      overflowWrap: "anywhere",
    });
    expect(screen.getByText(/ffmpeg-with-a-very-long-command-name/)).toHaveStyle({
      minWidth: "0",
      overflowWrap: "anywhere",
    });
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

  it("redacts absolute local paths from user-facing export job failures", () => {
    render(
      <ProjectExportPanel
        project={sampleProject}
        exportJobState={{
          id: "job_failed_path",
          phase: "failed",
          progress: 0.1,
          error: {
            phase: "validating",
            message: "Asset resolved to '/Users/dongha/private/capture.mp4', but the file does not exist",
          },
        }}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("[local path]");
    expect(alert).not.toHaveTextContent("/Users/dongha/private");
    expect(alert).not.toHaveTextContent("capture.mp4");
  });

  it("redacts Windows export failure paths with spaces without leaking trailing fragments", () => {
    render(
      <ProjectExportPanel
        project={sampleProject}
        exportJobState={{
          id: "job_failed_windows_path",
          phase: "failed",
          progress: 0.1,
          error: {
            phase: "rendering",
            message: "C:\\Users\\Jane Doe\\private\\capture.mp4 failed",
            command: { command: "ffmpeg", args: [] },
          },
        }}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Rendering failed: [local path] failed");
    expect(alert).not.toHaveTextContent("Jane Doe");
    expect(alert).not.toHaveTextContent("Doe\\private");
    expect(alert).not.toHaveTextContent("capture.mp4");
    expect(screen.getByText("ffmpeg")).toBeInTheDocument();
  });

  it("redacts POSIX export failure paths with spaces and parentheses", () => {
    render(
      <ProjectExportPanel
        project={sampleProject}
        exportJobState={{
          id: "job_failed_posix_path",
          phase: "failed",
          progress: 0.1,
          error: {
            phase: "validating",
            message: "Asset resolved to '/Users/jane/My Project (draft)/capture.mp4', but the file does not exist",
          },
        }}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Validating failed: Asset resolved to '[local path]', but the file does not exist");
    expect(alert).not.toHaveTextContent("/Users/jane");
    expect(alert).not.toHaveTextContent("My Project (draft)");
    expect(alert).not.toHaveTextContent("capture.mp4");
  });

  it("redacts unquoted POSIX export failure paths with spaces and parentheses without leaking trailing fragments", () => {
    render(
      <ProjectExportPanel
        project={sampleProject}
        exportJobState={{
          id: "job_failed_unquoted_posix_path",
          phase: "failed",
          progress: 0.1,
          error: {
            phase: "validating",
            message: "Asset resolved to /Users/jane/My Project (draft)/capture.mp4 before export",
          },
        }}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("[local path]");
    expect(alert).not.toHaveTextContent("/Users/jane");
    expect(alert).not.toHaveTextContent("My Project (draft)");
    expect(alert).not.toHaveTextContent("capture.mp4");
  });

  it("redacts extensionless POSIX export failure paths", () => {
    render(
      <ProjectExportPanel
        project={sampleProject}
        exportJobState={{
          id: "job_failed_extensionless_path",
          phase: "failed",
          progress: 0.1,
          error: {
            phase: "validating",
            message: "Asset resolved to /Users/jane/private/capture before export",
          },
        }}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Validating failed: Asset resolved to [local path] before export");
    expect(alert).not.toHaveTextContent("/Users/jane");
    expect(alert).not.toHaveTextContent("private");
    expect(alert).not.toHaveTextContent("capture");
  });

  it("redacts extensionless unquoted POSIX export failure paths with spaces and parentheses", () => {
    render(
      <ProjectExportPanel
        project={sampleProject}
        exportJobState={{
          id: "job_failed_extensionless_spaced_path",
          phase: "failed",
          progress: 0.1,
          error: {
            phase: "validating",
            message: "Asset resolved to /Users/jane/My Project (draft)/capture before export",
          },
        }}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("[local path]");
    expect(alert).not.toHaveTextContent("/Users/jane");
    expect(alert).not.toHaveTextContent("My Project (draft)");
    expect(alert).not.toHaveTextContent("capture");
  });

  it("redacts file URL export failure paths", () => {
    render(
      <ProjectExportPanel
        project={sampleProject}
        exportJobState={{
          id: "job_failed_file_url",
          phase: "failed",
          progress: 0.1,
          error: {
            phase: "rendering",
            message: "ffmpeg could not read file:///Users/jane/private/capture.mp4",
          },
        }}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Rendering failed: ffmpeg could not read [local path]");
    expect(alert).not.toHaveTextContent("file:///Users/jane");
    expect(alert).not.toHaveTextContent("private");
    expect(alert).not.toHaveTextContent("capture.mp4");
  });

  it("redacts POSIX export failure paths before a closing parenthesis", () => {
    render(
      <ProjectExportPanel
        project={sampleProject}
        exportJobState={{
          id: "job_failed_parenthesized_path",
          phase: "failed",
          progress: 0.1,
          error: {
            phase: "rendering",
            message: "ffmpeg failed (/Users/jane/private/capture.mp4)",
          },
        }}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Rendering failed: ffmpeg failed ([local path])");
    expect(alert).not.toHaveTextContent("/Users/jane");
    expect(alert).not.toHaveTextContent("private");
    expect(alert).not.toHaveTextContent("capture.mp4");
  });

  // ── PB-008: full export UX — start control, artifact summary, succeeded, failed, duplicates ──

  describe("Start export control", () => {
    it("renders the Start export button when onStartExport is provided", () => {
      render(<ProjectExportPanel project={sampleProject} onStartExport={vi.fn()} />);
      expect(screen.getByRole("button", { name: "Start export" })).toBeInTheDocument();
    });

    it("does NOT render the Start export button when onStartExport is absent", () => {
      render(<ProjectExportPanel project={sampleProject} />);
      expect(screen.queryByRole("button", { name: "Start export" })).not.toBeInTheDocument();
    });

    it("calls onStartExport when the button is clicked", () => {
      const onStart = vi.fn();
      render(<ProjectExportPanel project={sampleProject} onStartExport={onStart} />);
      fireEvent.click(screen.getByRole("button", { name: "Start export" }));
      expect(onStart).toHaveBeenCalledTimes(1);
    });

    it("disables the Start export button while isExportRunning=true", () => {
      render(<ProjectExportPanel project={sampleProject} onStartExport={vi.fn()} isExportRunning />);
      expect(screen.getByRole("button", { name: "Start export" })).toBeDisabled();
    });

    it("re-enables the Start export button when isExportRunning=false", () => {
      render(<ProjectExportPanel project={sampleProject} onStartExport={vi.fn()} isExportRunning={false} />);
      expect(screen.getByRole("button", { name: "Start export" })).not.toBeDisabled();
    });

    it("does not fire onStartExport when the button is disabled (running)", () => {
      const onStart = vi.fn();
      render(<ProjectExportPanel project={sampleProject} onStartExport={onStart} isExportRunning />);
      // Button is disabled — clicking should not call the handler.
      fireEvent.click(screen.getByRole("button", { name: "Start export" }));
      expect(onStart).not.toHaveBeenCalled();
    });
  });

  describe("succeeded state — artifact summary", () => {
    const succeededSummary: ArtifactSummary = {
      dimensions: "1920×1080",
      timeline: "45s @ 30fps",
      codec: "h264 mp4 (video/mp4)",
      outputPath: "generated/demo_project_sample.mp4",
      renderCommand: "pnpm --filter @tinker/rendering render:sample -- generated/demo_project_sample.mp4",
    };

    it("shows the artifact summary section when job succeeded", () => {
      render(
        <ProjectExportPanel
          project={sampleProject}
          exportJobState={{
            id: "job_ok",
            phase: "succeeded",
            progress: 1,
            outputPath: "generated/demo_project_sample.mp4",
            renderCommand: "pnpm --filter @tinker/rendering render:sample -- generated/demo_project_sample.mp4",
            artifactSummary: succeededSummary,
          }}
        />,
      );

      expect(screen.getByLabelText("Artifact summary")).toBeInTheDocument();
    });

    it("shows dimensions and timeline in the artifact summary", () => {
      render(
        <ProjectExportPanel
          project={sampleProject}
          exportJobState={{
            id: "job_ok2",
            phase: "succeeded",
            progress: 1,
            outputPath: "generated/demo_project_sample.mp4",
            renderCommand: "pnpm --filter @tinker/rendering render:sample -- generated/demo_project_sample.mp4",
            artifactSummary: succeededSummary,
          }}
        />,
      );

      expect(screen.getByText("1920×1080")).toBeInTheDocument();
      expect(screen.getByText("45s @ 30fps")).toBeInTheDocument();
      expect(screen.getByText(/h264 mp4/)).toBeInTheDocument();
    });

    it("shows the local render command in the artifact summary", () => {
      render(
        <ProjectExportPanel
          project={sampleProject}
          exportJobState={{
            id: "job_cmd",
            phase: "succeeded",
            progress: 1,
            outputPath: "generated/demo_project_sample.mp4",
            renderCommand: "pnpm --filter @tinker/rendering render:sample -- generated/demo_project_sample.mp4",
            artifactSummary: succeededSummary,
          }}
        />,
      );

      expect(screen.getByLabelText("Local render command")).toBeInTheDocument();
      expect(screen.getByText(/render:sample/)).toBeInTheDocument();
    });

    it("shows honest copy that preflight validated (not that file was written by browser)", () => {
      render(
        <ProjectExportPanel
          project={sampleProject}
          exportJobState={{
            id: "job_honest",
            phase: "succeeded",
            progress: 1,
            outputPath: "generated/demo_project_sample.mp4",
            renderCommand: "pnpm --filter @tinker/rendering render:sample -- generated/demo_project_sample.mp4",
            artifactSummary: succeededSummary,
          }}
        />,
      );

      expect(screen.getByText(/preflight validated/i)).toBeInTheDocument();
      expect(screen.getByText(/browser does not write the file/i)).toBeInTheDocument();
    });

    it("does NOT show the artifact summary for non-succeeded phases", () => {
      render(
        <ProjectExportPanel
          project={sampleProject}
          exportJobState={{
            id: "job_running",
            phase: "validating",
            progress: 0,
          }}
        />,
      );

      expect(screen.queryByLabelText("Artifact summary")).not.toBeInTheDocument();
    });
  });

  describe("failed state — error + retry", () => {
    it("shows the export error when the job failed with a preflight error", () => {
      render(
        <ProjectExportPanel
          project={sampleProject}
          exportJobState={{
            id: "job_pf_fail",
            phase: "failed",
            progress: 0.1,
            error: {
              phase: "validating",
              message: "No video tracks found in the project",
            },
          }}
        />,
      );

      expect(screen.getByRole("alert")).toHaveTextContent(/Validating failed: No video tracks found/);
    });

    it("re-enables the Start export button after failure so the user can retry", () => {
      const onStart = vi.fn();
      render(
        <ProjectExportPanel
          project={sampleProject}
          onStartExport={onStart}
          isExportRunning={false}
          exportJobState={{
            id: "job_retry",
            phase: "failed",
            progress: 0.1,
            error: {
              phase: "validating",
              message: "preflight error",
            },
          }}
        />,
      );

      const btn = screen.getByRole("button", { name: "Start export" });
      expect(btn).not.toBeDisabled();

      fireEvent.click(btn);
      expect(onStart).toHaveBeenCalledTimes(1);
    });
  });
});
