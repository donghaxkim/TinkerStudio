import { useEffect, useRef, useState } from "react";
import {
  acceptAutoZoomSuggestions,
  applyManualEditOperation,
  buildAutoZoomSuggestionState,
  type EditorCommand,
} from "@tinker/editor";
import type { DemoProject } from "@tinker/project-schema";

export type PreviewSource = "none" | "auto-zoom" | "ai";

type EditorAutoZoomPanelProps = {
  project: DemoProject;
  previewSource?: PreviewSource;
  onPreviewProjectChange: (project: DemoProject | undefined) => void;
  onAccept: (project: DemoProject, command: EditorCommand) => void;
};

const DEFAULT_INTENSITY = 1.6;
const MIN_INTENSITY = 1.2;
const MAX_INTENSITY = 2.0;
const INTENSITY_STEP = 0.1;

/**
 * Rescale suggestion targets so the resulting camera scale equals `intensity`.
 * The camera scale is `min(frameWidth / targetWidth, frameHeight / targetHeight)`.
 * Setting target to frame / intensity achieves the requested scale in both axes.
 */
function rescaleSuggestions(
  suggestions: ReturnType<typeof buildAutoZoomSuggestionState>["suggestions"],
  frame: { width: number; height: number },
  intensity: number,
): typeof suggestions {
  const frameW = frame.width;
  const frameH = frame.height;
  const targetW = frameW / intensity;
  const targetH = frameH / intensity;

  return suggestions.map((zoom) => ({
    ...zoom,
    target: {
      // Keep the center of the original target, but resize to achieve the desired scale.
      x: Math.max(0, Math.min((zoom.target.x + zoom.target.width / 2) - targetW / 2, frameW - targetW)),
      y: Math.max(0, Math.min((zoom.target.y + zoom.target.height / 2) - targetH / 2, frameH - targetH)),
      width: targetW,
      height: targetH,
    },
  }));
}

export function EditorAutoZoomPanel({
  project,
  previewSource,
  onPreviewProjectChange,
  onAccept,
}: EditorAutoZoomPanelProps) {
  const [enabled, setEnabled] = useState(false);
  const [intensity, setIntensity] = useState(DEFAULT_INTENSITY);
  const [appliedZoomIds, setAppliedZoomIds] = useState<string[]>([]);
  const [emptyNote, setEmptyNote] = useState(false);

  // Track the current project identity so we can reset on project change.
  const projectIdRef = useRef(project.id);

  // Reset state when a different project is loaded.
  useEffect(() => {
    if (project.id !== projectIdRef.current) {
      projectIdRef.current = project.id;
      setEnabled(false);
      setAppliedZoomIds([]);
      setEmptyNote(false);
    }
  }, [project]);

  // Drop preview ownership when another source takes over.
  useEffect(() => {
    if (enabled && previewSource !== undefined && previewSource !== "auto-zoom") {
      // Another preview took over — just clear the preview slot; keep toggle on
      // so the user can see the state. The zooms were already applied.
      onPreviewProjectChange(undefined);
    }
  }, [previewSource, enabled, onPreviewProjectChange]);

  /**
   * Apply auto-zoom suggestions at the given intensity and return the applied
   * zoom IDs. Calls onAccept so the command lands in history.
   * Returns the applied zoom ids on success, or null on failure.
   */
  function applyZooms(currentProject: DemoProject, intensityValue: number): string[] | null {
    const state = buildAutoZoomSuggestionState(currentProject);

    if (state.suggestions.length === 0) {
      return null;
    }

    const scaled = rescaleSuggestions(state.suggestions, state.frame, intensityValue);
    const result = acceptAutoZoomSuggestions(currentProject, scaled);

    if (!result.ok) {
      return null;
    }

    onAccept(result.project, result.command);
    return scaled.map((s) => s.id);
  }

  /**
   * Remove the given zoom IDs from the project. Produces a single combined
   * command and calls onAccept.
   */
  function removeZooms(currentProject: DemoProject, zoomIds: string[]): void {
    if (zoomIds.length === 0) return;

    const beforeProject = currentProject;
    let working = currentProject;

    for (const id of zoomIds) {
      // Only attempt removal if the zoom still exists.
      const exists = working.zooms.some((z) => z.id === id);
      if (!exists) continue;

      const result = applyManualEditOperation(working, {
        type: "remove_entity",
        entityType: "zoom",
        id,
      });
      if (result.ok) {
        working = result.project;
      }
    }

    if (working === currentProject) return; // nothing was removed

    const command: EditorCommand = {
      type: "manual-edit",
      id: `auto_zoom_remove_${Date.now()}`,
      label: "Remove auto zoom",
      beforeProject,
      afterProject: working,
    };

    onAccept(working, command);
  }

  function handleToggle() {
    const nextEnabled = !enabled;
    setEnabled(nextEnabled);
    setEmptyNote(false);

    if (nextEnabled) {
      // Toggle ON: apply zooms at current intensity.
      const ids = applyZooms(project, intensity);
      if (ids === null) {
        // Engine found nothing.
        setEmptyNote(true);
        // Keep toggle visually on but track no ids.
        setAppliedZoomIds([]);
      } else {
        setAppliedZoomIds(ids);
      }
    } else {
      // Toggle OFF: remove the zooms we added.
      removeZooms(project, appliedZoomIds);
      setAppliedZoomIds([]);
      onPreviewProjectChange(undefined);
    }
  }

  function handleIntensityChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newIntensity = parseFloat(e.target.value);
    setIntensity(newIntensity);

    if (enabled && appliedZoomIds.length > 0) {
      // Rescale: remove the current auto-zooms and re-apply at the new intensity.
      // We need to remove from the current project (which has the old zooms applied).
      // After removal, re-apply at the new intensity.
      const beforeProject = project;
      let afterRemoval = project;

      for (const id of appliedZoomIds) {
        const exists = afterRemoval.zooms.some((z) => z.id === id);
        if (!exists) continue;
        const result = applyManualEditOperation(afterRemoval, {
          type: "remove_entity",
          entityType: "zoom",
          id,
        });
        if (result.ok) afterRemoval = result.project;
      }

      // Now re-apply at new intensity.
      const state = buildAutoZoomSuggestionState(afterRemoval);
      if (state.suggestions.length === 0) {
        // Nothing to apply; push the removal command.
        if (afterRemoval !== beforeProject) {
          const removeCommand: EditorCommand = {
            type: "manual-edit",
            id: `auto_zoom_remove_${Date.now()}`,
            label: "Remove auto zoom",
            beforeProject,
            afterProject: afterRemoval,
          };
          onAccept(afterRemoval, removeCommand);
        }
        setAppliedZoomIds([]);
        setEmptyNote(true);
        return;
      }

      const scaled = rescaleSuggestions(state.suggestions, state.frame, newIntensity);
      const result = acceptAutoZoomSuggestions(afterRemoval, scaled);

      if (!result.ok) {
        setAppliedZoomIds([]);
        return;
      }

      // Combine remove+re-apply into a single command.
      const combinedCommand: EditorCommand = {
        type: "manual-edit",
        id: `auto_zoom_rescale_${Date.now()}`,
        label: "Rescale auto zoom",
        beforeProject,
        afterProject: result.project,
      };

      onAccept(result.project, combinedCommand);
      setAppliedZoomIds(scaled.map((s) => s.id));
      setEmptyNote(false);
    }
  }

  return (
    <section
      aria-label="Auto zoom suggestions"
      style={{
        display: "grid",
        gap: 10,
        padding: 14,
        border: "1px solid var(--tk-border)",
        borderRadius: "var(--tk-radius-lg)",
        background: "var(--tk-card)",
        color: "var(--tk-text)",
      }}
    >
      {/* Eyebrow */}
      <p
        style={{
          margin: 0,
          color: "var(--tk-text-ter)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        Auto zoom
      </p>

      {/* Header row: heading + subtitle + toggle */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--tk-text)" }}>
            Zoom on clicks
          </p>
          <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--tk-text-sec)" }}>
            Push in when the cursor clicks
          </p>
        </div>

        {/* Toggle switch */}
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Zoom on clicks"
          onClick={handleToggle}
          style={{
            flexShrink: 0,
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            width: 36,
            height: 20,
            borderRadius: "var(--tk-radius-pill)",
            border: "none",
            background: enabled ? "var(--tk-accent)" : "var(--tk-subtle)",
            cursor: "pointer",
            padding: 0,
            transition: "background 0.15s ease",
            outline: "none",
            marginTop: 2,
          }}
        >
          <span
            style={{
              position: "absolute",
              left: enabled ? 18 : 2,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "white",
              boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
              transition: "left 0.15s ease",
            }}
          />
        </button>
      </div>

      {/* Calm note when no suggestions found */}
      {emptyNote ? (
        <p role="status" style={{ margin: 0, color: "var(--tk-text-sec)", fontSize: 12.5, lineHeight: 1.5 }}>
          No click moments found to zoom — add a zoom manually below.
        </p>
      ) : null}

      {/* Intensity row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label
          htmlFor="auto-zoom-intensity"
          style={{ fontSize: 12.5, color: "var(--tk-text-sec)", flexShrink: 0 }}
        >
          Intensity
        </label>
        <input
          id="auto-zoom-intensity"
          type="range"
          aria-label="Auto zoom intensity"
          min={MIN_INTENSITY}
          max={MAX_INTENSITY}
          step={INTENSITY_STEP}
          value={intensity}
          onChange={handleIntensityChange}
          style={{
            flex: 1,
            height: 4,
            accentColor: "var(--tk-accent)",
            cursor: "pointer",
          }}
        />
        <span
          style={{
            fontFamily: "var(--tk-mono)",
            fontSize: 12,
            color: "var(--tk-text)",
            fontWeight: 500,
            minWidth: 32,
            textAlign: "right",
          }}
        >
          ×{intensity.toFixed(1)}
        </span>
      </div>
    </section>
  );
}
