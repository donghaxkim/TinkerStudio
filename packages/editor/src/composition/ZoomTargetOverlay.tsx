import { useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import { MAX_ZOOM_SCALE, MIN_ZOOM_SCALE, type ZoomTarget } from "./compositionTimelineModel.js";

export type ZoomTargetOverlayProps = {
  /** Current punch-in level; the box shows 1/scale of the frame. */
  scale: number;
  /** Current focal point (0..1 of the frame). */
  target: ZoomTarget;
  /** Commit a dragged focal point (once, on release). */
  onMoveTarget?: (target: ZoomTarget) => void;
  /** Commit a corner-resized scale (once, on release). */
  onScale?: (scale: number) => void;
};

type Drag =
  | { kind: "move"; startX: number; startY: number; baseX: number; baseY: number }
  | { kind: "resize" };

const CORNERS = [
  { id: "nw", style: { left: -5, top: -5, cursor: "nwse-resize" } },
  { id: "ne", style: { right: -5, top: -5, cursor: "nesw-resize" } },
  { id: "sw", style: { left: -5, bottom: -5, cursor: "nesw-resize" } },
  { id: "se", style: { right: -5, bottom: -5, cursor: "nwse-resize" } },
] as const;

const layerStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  // Only the box/handles are interactive; clicks elsewhere pass through to the player controls.
  pointerEvents: "none",
  zIndex: 1,
};

const boxStyle: CSSProperties = {
  position: "absolute",
  boxSizing: "border-box",
  border: "1.5px solid var(--tk-accent, #6C8CFF)",
  borderRadius: 6,
  background: "rgba(108,140,255,0.10)",
  boxShadow: "0 0 0 100vmax rgba(5,6,9,0.34)", // dim everything outside the target framing
  cursor: "grab",
  pointerEvents: "auto",
  touchAction: "none",
};

const handleStyle: CSSProperties = {
  position: "absolute",
  width: 11,
  height: 11,
  borderRadius: 3,
  background: "var(--tk-card, #FFFFFF)",
  border: "1.5px solid var(--tk-accent, #6C8CFF)",
  pointerEvents: "auto",
  touchAction: "none",
};

const centerDotStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "50%",
  width: 8,
  height: 8,
  marginLeft: -4,
  marginTop: -4,
  borderRadius: "50%",
  background: "var(--tk-accent, #6C8CFF)",
  pointerEvents: "none",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Round scale to a tenth — the slider's step. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Round a focal-point fraction to a hundredth — fine enough to feel continuous, clean to store. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The editable zoom-target box drawn over the preview frame while a zoom unit is selected. The
 * box is the region that will be visible after the punch-in (1/scale of the frame, centered on
 * the focal point, clamped to stay in frame). Dragging the body moves the focal point; dragging
 * a corner changes the scale (about the focal point). Both preview live and commit a single edit
 * on release, mirroring the timeline's drag plumbing (pointer events with a mouse fallback for
 * jsdom).
 */
export function ZoomTargetOverlay({ scale, target, onMoveTarget, onScale }: ZoomTargetOverlayProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [live, setLive] = useState<{ scale: number; target: ZoomTarget } | null>(null);
  const supportsPointerEvents = typeof window !== "undefined" && "PointerEvent" in window;

  const s = clamp(live?.scale ?? scale, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE);
  const focal = live?.target ?? target;
  const sizeFrac = 1 / s;
  const half = sizeFrac / 2;
  const cx = clamp(focal.x, half, 1 - half);
  const cy = clamp(focal.y, half, 1 - half);

  function fractionAt(clientX: number, clientY: number): { x: number; y: number } {
    const el = layerRef.current;
    if (!el) return { x: focal.x, y: focal.y };
    const b = el.getBoundingClientRect();
    return {
      x: (clientX - b.left) / Math.max(1, b.width),
      y: (clientY - b.top) / Math.max(1, b.height),
    };
  }

  function capture(pointerId?: number) {
    const el = layerRef.current;
    if (el && pointerId !== undefined && "setPointerCapture" in el) el.setPointerCapture(pointerId);
  }

  function beginMove(clientX: number, clientY: number, pointerId?: number) {
    if (!onMoveTarget) return;
    capture(pointerId);
    dragRef.current = { kind: "move", startX: clientX, startY: clientY, baseX: focal.x, baseY: focal.y };
    setLive({ scale: s, target: { x: focal.x, y: focal.y } });
  }

  function beginResize(pointerId?: number) {
    if (!onScale) return;
    capture(pointerId);
    dragRef.current = { kind: "resize" };
    setLive({ scale: s, target: focal });
  }

  function moveTargetAt(clientX: number, clientY: number): ZoomTarget {
    const drag = dragRef.current;
    const el = layerRef.current;
    if (!drag || drag.kind !== "move" || !el) return focal;
    const b = el.getBoundingClientRect();
    const dx = (clientX - drag.startX) / Math.max(1, b.width);
    const dy = (clientY - drag.startY) / Math.max(1, b.height);
    return { x: round2(clamp(drag.baseX + dx, 0, 1)), y: round2(clamp(drag.baseY + dy, 0, 1)) };
  }

  function resizeScaleAt(clientX: number): number {
    const frac = fractionAt(clientX, 0).x;
    const dist = Math.abs(frac - focal.x);
    return round1(clamp(0.5 / Math.max(dist, 1e-6), MIN_ZOOM_SCALE, MAX_ZOOM_SCALE));
  }

  function dragMove(clientX: number, clientY: number) {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "move") setLive({ scale: s, target: moveTargetAt(clientX, clientY) });
    else setLive({ scale: resizeScaleAt(clientX), target: focal });
  }

  function dragEnd(clientX: number, clientY: number, pointerId?: number) {
    const drag = dragRef.current;
    dragRef.current = null;
    const el = layerRef.current;
    if (el && pointerId !== undefined && "releasePointerCapture" in el) el.releasePointerCapture(pointerId);
    setLive(null);
    if (!drag) return;
    if (drag.kind === "move") onMoveTarget?.(moveTargetAt(clientX, clientY));
    else onScale?.(resizeScaleAt(clientX));
  }

  // Pointer (real browsers) + mouse (jsdom) plumbing, attached to the full-frame layer.
  function onLayerPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (dragRef.current) dragMove(e.clientX, e.clientY);
  }
  function onLayerPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (dragRef.current) dragEnd(e.clientX, e.clientY, e.pointerId);
  }
  function onLayerMouseMove(e: MouseEvent<HTMLDivElement>) {
    if (supportsPointerEvents) return;
    if (dragRef.current) dragMove(e.clientX, e.clientY);
  }
  function onLayerMouseUp(e: MouseEvent<HTMLDivElement>) {
    if (supportsPointerEvents) return;
    if (dragRef.current) dragEnd(e.clientX, e.clientY);
  }

  function onBoxPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    beginMove(e.clientX, e.clientY, e.pointerId);
  }
  function onBoxMouseDown(e: MouseEvent<HTMLDivElement>) {
    if (supportsPointerEvents) return;
    e.stopPropagation();
    beginMove(e.clientX, e.clientY);
  }
  function onHandlePointerDown(e: PointerEvent<HTMLSpanElement>) {
    e.stopPropagation();
    beginResize(e.pointerId);
  }
  function onHandleMouseDown(e: MouseEvent<HTMLSpanElement>) {
    if (supportsPointerEvents) return;
    e.stopPropagation();
    beginResize();
  }

  return (
    <div
      ref={layerRef}
      data-testid="zoom-overlay"
      style={layerStyle}
      onPointerMove={onLayerPointerMove}
      onPointerUp={onLayerPointerUp}
      onMouseMove={onLayerMouseMove}
      onMouseUp={onLayerMouseUp}
    >
      <div
        data-testid="zoom-target"
        role="group"
        aria-label="Zoom target"
        style={{
          ...boxStyle,
          left: `${(cx - half) * 100}%`,
          top: `${(cy - half) * 100}%`,
          width: `${sizeFrac * 100}%`,
          height: `${sizeFrac * 100}%`,
        }}
        onPointerDown={onBoxPointerDown}
        onMouseDown={onBoxMouseDown}
      >
        <span style={centerDotStyle} />
        {onScale
          ? CORNERS.map((corner) => (
              <span
                key={corner.id}
                data-testid={`zoom-target-resize-${corner.id}`}
                aria-label={`Resize zoom (${corner.id})`}
                style={{ ...handleStyle, ...corner.style }}
                onPointerDown={onHandlePointerDown}
                onMouseDown={onHandleMouseDown}
              />
            ))
          : null}
      </div>
    </div>
  );
}
