import { useCallback, useMemo, useState } from "react";
import {
  addMarker,
  addZoom,
  moveZoom,
  removeClip,
  removeZoom,
  resizeZoom,
  setClipSpeed,
  splitClipAt,
  trimClip,
  updateZoom,
  type CompositionTimelineModel,
  type TrimEdge,
  type ZoomPropsPatch,
} from "@tinker/editor";

type History = {
  past: CompositionTimelineModel[];
  present?: CompositionTimelineModel;
  future: CompositionTimelineModel[];
};

export type TimelineEdits = {
  /** The current (possibly edited) model, or undefined before a composition loads. */
  model?: CompositionTimelineModel;
  canUndo: boolean;
  canRedo: boolean;
  /** Replace the baseline (a freshly loaded composition) and clear history. */
  reset: (model?: CompositionTimelineModel) => void;
  split: (time: number) => void;
  remove: (clipId: string) => void;
  mark: (time: number, name: string) => void;
  /** Move one edge of a clip to `time` (clamped to its generated source bounds). */
  trim: (clipId: string, edge: TrimEdge, time: number) => void;
  /** Set a clip's playback speed (rescales its duration); pass 1 to reset to real-time. */
  setClipSpeed: (clipId: string, speed: number) => void;
  /** Add a zoom unit `id` spanning `[start, end]` on the zoom track. */
  addZoom: (id: string, start: number, end: number) => void;
  /** Move a zoom unit to a new start, preserving its length. */
  moveZoom: (id: string, start: number) => void;
  /** Move one edge of a zoom unit to `time`. */
  resizeZoom: (id: string, edge: TrimEdge, time: number) => void;
  /** Update a zoom unit's look properties (scale / easing / target). */
  updateZoom: (id: string, patch: ZoomPropsPatch) => void;
  /** Delete a zoom unit by id. */
  removeZoom: (id: string) => void;
  undo: () => void;
  redo: () => void;
};

/**
 * A small undo/redo history over the timeline display model. Split / delete / marker
 * edits push onto the past and clear the redo future; loading a new composition resets
 * the baseline. Self-contained so the toolbar works identically in the empty editor
 * shell and the real generated editor — neither needs a server edit session.
 */
export function useTimelineEdits(): TimelineEdits {
  const [hist, setHist] = useState<History>({ past: [], future: [] });

  const reset = useCallback((model?: CompositionTimelineModel) => {
    setHist({ past: [], present: model, future: [] });
  }, []);

  const apply = useCallback((fn: (m: CompositionTimelineModel) => CompositionTimelineModel) => {
    setHist((h) => {
      if (!h.present) return h;
      const next = fn(h.present);
      if (next === h.present) return h; // no-op edit (e.g. split at a boundary)
      return { past: [...h.past, h.present], present: next, future: [] };
    });
  }, []);

  const split = useCallback((time: number) => apply((m) => splitClipAt(m, time)), [apply]);
  const remove = useCallback((clipId: string) => apply((m) => removeClip(m, clipId)), [apply]);
  const mark = useCallback((time: number, name: string) => apply((m) => addMarker(m, time, name)), [apply]);
  const trim = useCallback(
    (clipId: string, edge: TrimEdge, time: number) => apply((m) => trimClip(m, clipId, edge, time)),
    [apply],
  );
  const setSpeed = useCallback(
    (clipId: string, speed: number) => apply((m) => setClipSpeed(m, clipId, speed)),
    [apply],
  );
  const addZoomUnit = useCallback(
    (id: string, start: number, end: number) => apply((m) => addZoom(m, id, start, end)),
    [apply],
  );
  const moveZoomUnit = useCallback((id: string, start: number) => apply((m) => moveZoom(m, id, start)), [apply]);
  const resizeZoomUnit = useCallback(
    (id: string, edge: TrimEdge, time: number) => apply((m) => resizeZoom(m, id, edge, time)),
    [apply],
  );
  const updateZoomUnit = useCallback(
    (id: string, patch: ZoomPropsPatch) => apply((m) => updateZoom(m, id, patch)),
    [apply],
  );
  const removeZoomUnit = useCallback((id: string) => apply((m) => removeZoom(m, id)), [apply]);

  const undo = useCallback(() => {
    setHist((h) => {
      if (h.past.length === 0 || !h.present) return h;
      const present = h.past[h.past.length - 1]!;
      return { past: h.past.slice(0, -1), present, future: [h.present, ...h.future] };
    });
  }, []);

  const redo = useCallback(() => {
    setHist((h) => {
      if (h.future.length === 0 || !h.present) return h;
      const [present, ...rest] = h.future;
      return { past: [...h.past, h.present], present: present!, future: rest };
    });
  }, []);

  return useMemo(
    () => ({
      model: hist.present,
      canUndo: hist.past.length > 0,
      canRedo: hist.future.length > 0,
      reset,
      split,
      remove,
      mark,
      trim,
      setClipSpeed: setSpeed,
      addZoom: addZoomUnit,
      moveZoom: moveZoomUnit,
      resizeZoom: resizeZoomUnit,
      updateZoom: updateZoomUnit,
      removeZoom: removeZoomUnit,
      undo,
      redo,
    }),
    [hist, reset, split, remove, mark, trim, setSpeed, addZoomUnit, moveZoomUnit, resizeZoomUnit, updateZoomUnit, removeZoomUnit, undo, redo],
  );
}
