import { useCallback, useRef, useState } from "react";
import { prepareMp4Export } from "@tinker/editor";
import type { DemoProject } from "@tinker/project-schema";
import type { ExportJobState } from "@tinker/rendering/node";
import { getExportDirectory } from "./appSettings.js";

/**
 * Web-side export controller.
 *
 * The browser cannot run ffmpeg, so this hook is HONEST about what it can do:
 * it validates the project and builds the render plan ("preflight"), then
 * transitions to `succeeded` with the validated plan details and the exact
 * local render command.  The actual MP4 bytes are produced by running:
 *
 *   pnpm --filter @tinker/rendering render:sample -- <outputPath>
 *
 * No in-browser ffmpeg.  No fake rendered file.
 */

export type WebExportJobState = ExportJobState & {
  /** The render command the user should run locally to produce the MP4. */
  renderCommand?: string;
  /** Convenience summary shown after a successful preflight. */
  artifactSummary?: ArtifactSummary;
};

export type ArtifactSummary = {
  dimensions: string;        // e.g. "1920×1080"
  timeline: string;          // e.g. "45s @ 30fps"
  codec: string;             // e.g. "h264 mp4 (video/mp4)"
  outputPath: string;        // relative path where the file will land
  renderCommand: string;     // exact shell command to run
};

let jobSeq = 0;

export type UseWebExportJobReturn = {
  state: WebExportJobState | undefined;
  start: (project: DemoProject) => void;
  /** True while a job is in a non-terminal phase — use to disable the start button. */
  isRunning: boolean;
};

export function useWebExportJob(): UseWebExportJobReturn {
  const [state, setState] = useState<WebExportJobState | undefined>(undefined);
  // We keep the snapshot id stable in a ref so we can detect a stale job update
  // if start() is called again (shouldn't happen with the running guard, but belt-and-suspenders).
  const currentJobIdRef = useRef<string | null>(null);

  const isRunning = state !== undefined && state.phase !== "succeeded" && state.phase !== "failed";

  const start = useCallback((project: DemoProject) => {
    // Duplicate-start prevention: refuse if a non-terminal job is in flight.
    // We read the lock ref (not state) so this callback is stable with [] deps.
    if (currentJobIdRef.current !== null) {
      return;
    }

    // Freeze a snapshot of the project at the moment start() is called.
    // Later edits to `project` will not affect this frozen copy.
    const snapshot: DemoProject = structuredClone(project);

    const jobId = `web_export_${++jobSeq}_${Date.now()}`;
    currentJobIdRef.current = jobId;

    // Transition to validating immediately.
    const validatingState: WebExportJobState = {
      id: jobId,
      phase: "validating",
      progress: 0,
    };
    setState(validatingState);

    // Run preflight synchronously (prepareMp4Export is pure/sync).
    const result = prepareMp4Export(snapshot);

    if (!result.ok) {
      currentJobIdRef.current = null;
      setState({
        id: jobId,
        phase: "failed",
        progress: 0.1,
        error: {
          phase: "validating",
          message: result.error,
        },
      });
      return;
    }

    // Preflight succeeded — build the artifact summary.
    const { plan } = result;
    const exportDir = getExportDirectory();
    const outputPath = `${exportDir}/${snapshot.id}.mp4`;
    const renderCommand = `pnpm --filter @tinker/rendering render:sample -- ${outputPath}`;

    const summary: ArtifactSummary = {
      dimensions: `${plan.output.width}×${plan.output.height}`,
      timeline: `${plan.timeline.duration}s @ ${plan.timeline.fps}fps`,
      codec: `h264 mp4 (${plan.output.mimeType})`,
      outputPath,
      renderCommand,
    };

    setState({
      id: jobId,
      phase: "succeeded",
      progress: 1,
      outputPath,
      renderCommand,
      artifactSummary: summary,
    });
    // Job is terminal — clear the lock so the user can re-export.
    currentJobIdRef.current = null;
  }, []);

  return { state, start, isRunning };
}
