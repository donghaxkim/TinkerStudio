import { useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { createTimeScale } from "../timeline/timeScale.js";
import type { TrimEdge } from "./compositionEdits.js";
import type { ZoomUnit } from "./compositionTimelineModel.js";

const DRAG_THRESHOLD_PX = 4;
/** Default length (seconds) of a zoom unit created by a single click. */
const DEFAULT_CLICK_ZOOM = 1;

export type ZoomTrackProps = {
  /** Composition length; the track uses the same time scale as the clip track. */
  durationSeconds: number;
  units: ZoomUnit[];
  selectedId?: string;
  /** Create a zoom over `[start, end]` (drag) or a default window (single click). */
  onCreate?: (start: number, end: number) => void;
  onSelect?: (id: string) => void;
  /** Move a unit to a new start (its length is preserved). */
  onMove?: (id: string, start: number) => void;
  /** Move one edge of a unit to `time`. */
  onResize?: (id: string, edge: TrimEdge, time: number) => void;
  onDelete?: (id: string) => void;
  /**
   * Contextual actions for the selected unit, shown as a small popover anchored over it — the
   * select-first pattern (mirrors the clip popover). When provided, clicking a unit selects it
   * without opening the Zoom tab; the popover carries the explicit choices and double-click is an
   * `onEdit` shortcut. Absent = clicking only selects.
   */
  unitActions?: { onAddToChat: (unit: ZoomUnit) => void; onEdit: (unit: ZoomUnit) => void };
};

type Drag =
  | { kind: "create"; startTime: number; startX: number; moved: boolean }
  | { kind: "move"; id: string; length: number; grabOffset: number; startX: number; moved: boolean }
  | { kind: "resize"; id: string; edge: TrimEdge };

const stripStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: 72, // matches the clip track height (CompositionTimeline trackStyle) — same-size lanes
  background: "var(--tk-timeline-bg, var(--tk-raised, #F3F1EA))",
  borderRadius: 8,
  overflow: "hidden",
  userSelect: "none",
  cursor: "crosshair",
};

/** A zoom region, sized like a clip card (accent-filled so it still reads as a zoom, not a clip). */
const unitStyle: CSSProperties = {
  position: "absolute",
  top: 6,
  bottom: 6,
  borderRadius: 7,
  background: "var(--tk-accent-soft, rgba(108,140,255,0.30))",
  border: "1px solid var(--tk-accent, #6C8CFF)",
  boxSizing: "border-box",
  cursor: "grab",
};

const selectedUnitStyle: CSSProperties = {
  background: "var(--tk-accent, #6C8CFF)",
  boxShadow: "0 0 0 3px var(--tk-accent-ring, rgba(108,140,255,0.25))",
};

const handleStyle: CSSProperties = {
  position: "absolute",
  top: -1,
  bottom: -1,
  width: 8,
  cursor: "ew-resize",
  background: "transparent",
  border: "none",
  padding: 0,
  zIndex: 2,
  touchAction: "none",
};

const createBandStyle: CSSProperties = {
  position: "absolute",
  top: 6,
  bottom: 6,
  borderRadius: 7,
  background: "var(--tk-accent-soft, rgba(108,140,255,0.22))",
  border: "1px dashed var(--tk-accent, #6C8CFF)",
  pointerEvents: "none",
};

export function ZoomTrack({
  durationSeconds,
  units,
  selectedId,
  onCreate,
  onSelect,
  onMove,
  onResize,
  onDelete,
  unitActions,
}: ZoomTrackProps) {
  const scale = createTimeScale(durationSeconds, 100);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const suppressClickRef = useRef(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Single live-preview slot: a forming unit (no id → create band) or a unit being moved/resized.
  const [live, setLive] = useState<{ id?: string; start: number; end: number } | null>(null);
  const supportsPointerEvents = typeof window !== "undefined" && "PointerEvent" in window;

  function timeAtX(clientX: number): number {
    const el = stripRef.current;
    if (!el) return 0;
    const bounds = el.getBoundingClientRect();
    return createTimeScale(durationSeconds, Math.max(1, bounds.width)).pixelsToSeconds(clientX - bounds.left);
  }

  function capture(pointerId?: number) {
    const el = stripRef.current;
    if (el && pointerId !== undefined && "setPointerCapture" in el) el.setPointerCapture(pointerId);
  }

  function beginCreate(clientX: number, pointerId?: number) {
    if (!onCreate) return;
    capture(pointerId);
    dragRef.current = { kind: "create", startTime: timeAtX(clientX), startX: clientX, moved: false };
  }

  function beginMove(unit: ZoomUnit, clientX: number, pointerId?: number) {
    if (!onMove) return;
    capture(pointerId);
    dragRef.current = {
      kind: "move",
      id: unit.id,
      length: unit.end - unit.start,
      grabOffset: timeAtX(clientX) - unit.start,
      startX: clientX,
      moved: false,
    };
  }

  function beginResize(unit: ZoomUnit, edge: TrimEdge, pointerId?: number) {
    if (!onResize) return;
    capture(pointerId);
    dragRef.current = { kind: "resize", id: unit.id, edge };
    setLive({ id: unit.id, start: unit.start, end: unit.end });
  }

  function dragMove(clientX: number) {
    const drag = dragRef.current;
    if (!drag) return;
    const t = timeAtX(clientX);
    if (drag.kind === "create") {
      if (Math.abs(clientX - drag.startX) > DRAG_THRESHOLD_PX) drag.moved = true;
      if (drag.moved) setLive({ start: Math.min(drag.startTime, t), end: Math.max(drag.startTime, t) });
    } else if (drag.kind === "move") {
      if (Math.abs(clientX - drag.startX) > DRAG_THRESHOLD_PX) drag.moved = true;
      if (drag.moved) {
        const start = clamp(t - drag.grabOffset, 0, Math.max(0, durationSeconds - drag.length));
        setLive({ id: drag.id, start, end: start + drag.length });
      }
    } else {
      const unit = units.find((u) => u.id === drag.id);
      if (!unit) return;
      const next =
        drag.edge === "end" ? clamp(t, unit.start, durationSeconds) : clamp(t, 0, unit.end);
      setLive({ id: drag.id, start: drag.edge === "start" ? next : unit.start, end: drag.edge === "end" ? next : unit.end });
    }
  }

  function dragEnd(clientX: number, pointerId?: number) {
    const drag = dragRef.current;
    dragRef.current = null;
    const el = stripRef.current;
    if (el && pointerId !== undefined && "releasePointerCapture" in el) el.releasePointerCapture(pointerId);
    setLive(null);
    if (!drag) return;
    const t = timeAtX(clientX);
    if (drag.kind === "create") {
      suppressClickRef.current = true;
      if (drag.moved) onCreate?.(Math.min(drag.startTime, t), Math.max(drag.startTime, t));
      else onCreate?.(drag.startTime, drag.startTime + DEFAULT_CLICK_ZOOM); // single-click default window
    } else if (drag.kind === "move") {
      if (drag.moved) {
        suppressClickRef.current = true;
        onMove?.(drag.id, clamp(t - drag.grabOffset, 0, Math.max(0, durationSeconds - drag.length)));
      }
    } else {
      const unit = units.find((u) => u.id === drag.id);
      if (unit) {
        const next =
          drag.edge === "end" ? clamp(t, unit.start, durationSeconds) : clamp(t, 0, unit.end);
        onResize?.(drag.id, drag.edge, next);
      }
    }
  }

  // Pointer (real browsers) + mouse (jsdom/tests) drag plumbing on the strip.
  function onStripPointerDown(event: PointerEvent<HTMLDivElement>) {
    beginCreate(event.clientX, event.pointerId);
  }
  function onStripPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current) dragMove(event.clientX);
  }
  function onStripPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current) dragEnd(event.clientX, event.pointerId);
  }
  function onStripMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (supportsPointerEvents) return;
    beginCreate(event.clientX);
  }
  function onStripMouseMove(event: MouseEvent<HTMLDivElement>) {
    if (supportsPointerEvents) return;
    if (dragRef.current) dragMove(event.clientX);
  }
  function onStripMouseUp(event: MouseEvent<HTMLDivElement>) {
    if (supportsPointerEvents) return;
    if (dragRef.current) dragEnd(event.clientX);
  }

  function onUnitPointerDown(event: PointerEvent<HTMLDivElement>, unit: ZoomUnit) {
    event.stopPropagation();
    beginMove(unit, event.clientX, event.pointerId);
  }
  function onUnitMouseDown(event: MouseEvent<HTMLDivElement>, unit: ZoomUnit) {
    if (supportsPointerEvents) return;
    event.stopPropagation();
    beginMove(unit, event.clientX);
  }
  function onUnitClick(event: MouseEvent<HTMLDivElement>, unit: ZoomUnit) {
    event.stopPropagation();
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onSelect?.(unit.id);
  }
  // Double-click is the explicit shortcut to manual editing — it opens the unit's properties
  // directly, bypassing the popover (which serves the select-first / add-to-chat path).
  function onUnitDoubleClick(event: MouseEvent<HTMLDivElement>, unit: ZoomUnit) {
    if (!unitActions) return;
    event.stopPropagation();
    unitActions.onEdit(unit);
  }
  function onUnitKeyDown(event: KeyboardEvent<HTMLDivElement>, unit: ZoomUnit) {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onDelete?.(unit.id);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect?.(unit.id);
    }
  }

  function onHandlePointerDown(event: PointerEvent<HTMLElement>, unit: ZoomUnit, edge: TrimEdge) {
    event.stopPropagation();
    beginResize(unit, edge, event.pointerId);
  }
  function onHandleMouseDown(event: MouseEvent<HTMLElement>, unit: ZoomUnit, edge: TrimEdge) {
    if (supportsPointerEvents) return;
    event.stopPropagation();
    beginResize(unit, edge);
  }

  // The unit the contextual popover anchors to (select-first actions). Looked up here so it
  // follows the selection and disappears when nothing is selected (or no actions were supplied).
  const popoverUnit = unitActions && selectedId !== undefined ? units.find((u) => u.id === selectedId) : undefined;

  return (
    <section aria-label="Zoom track" style={{ position: "relative" }}>
      <div
        ref={stripRef}
        data-testid="zoom-track"
        style={stripStyle}
        onPointerDown={onStripPointerDown}
        onPointerMove={onStripPointerMove}
        onPointerUp={onStripPointerUp}
        onMouseDown={onStripMouseDown}
        onMouseMove={onStripMouseMove}
        onMouseUp={onStripMouseUp}
      >
        {units.map((unit) => {
          const editing = live?.id === unit.id ? live : null;
          const start = editing?.start ?? unit.start;
          const end = editing?.end ?? unit.end;
          const left = scale.secondsToPixels(start);
          const width = scale.secondsToPixels(end) - left;
          const selected = unit.id === selectedId;
          const showHandles = onResize !== undefined && (selected || hoveredId === unit.id || editing !== null);
          return (
            <div
              key={unit.id}
              data-testid={`zoom-unit-${unit.id}`}
              data-selected={selected ? "true" : "false"}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={`Zoom ${start.toFixed(1)}s to ${end.toFixed(1)}s`}
              style={{ ...unitStyle, ...(selected && selectedUnitStyle), left: `${left}%`, width: `${width}%` }}
              onPointerDown={(event) => onUnitPointerDown(event, unit)}
              onMouseDown={(event) => onUnitMouseDown(event, unit)}
              onClick={(event) => onUnitClick(event, unit)}
              onDoubleClick={(event) => onUnitDoubleClick(event, unit)}
              onKeyDown={(event) => onUnitKeyDown(event, unit)}
              onMouseEnter={() => setHoveredId(unit.id)}
              onMouseLeave={() => setHoveredId((id) => (id === unit.id ? null : id))}
            >
              {showHandles
                ? (["start", "end"] as const).map((edge) => (
                    <span
                      key={edge}
                      data-testid={`zoom-unit-${unit.id}-${edge}`}
                      role="slider"
                      tabIndex={-1}
                      aria-label={`Resize ${edge} of zoom`}
                      aria-valuemin={0}
                      aria-valuemax={durationSeconds}
                      aria-valuenow={edge === "start" ? start : end}
                      style={{ ...handleStyle, [edge === "start" ? "left" : "right"]: -1 }}
                      onPointerDown={(event) => onHandlePointerDown(event, unit, edge)}
                      onMouseDown={(event) => onHandleMouseDown(event, unit, edge)}
                      onClick={(event) => event.stopPropagation()}
                    />
                  ))
                : null}
            </div>
          );
        })}
        {live && live.id === undefined ? (
          <div
            data-testid="zoom-create-band"
            style={{
              ...createBandStyle,
              left: `${scale.secondsToPixels(live.start)}%`,
              width: `${scale.secondsToPixels(live.end) - scale.secondsToPixels(live.start)}%`,
            }}
          />
        ) : null}
      </div>
      {unitActions && popoverUnit ? (
        <div
          data-testid="zoom-unit-popup"
          className="tk-selection-popup"
          style={{ left: `${(scale.secondsToPixels(popoverUnit.start) + scale.secondsToPixels(popoverUnit.end)) / 2}%` }}
        >
          <div className="tk-selection-popup-row">
            <button type="button" className="tk-selection-popup-btn" onClick={() => unitActions.onAddToChat(popoverUnit)}>
              Add to chat
            </button>
            <button type="button" className="tk-selection-popup-btn" onClick={() => unitActions.onEdit(popoverUnit)}>
              Edit manually
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
