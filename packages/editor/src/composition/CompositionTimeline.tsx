import { useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { createTimeScale } from "../timeline/timeScale.js";
import type { CompositionClip, CompositionTimelineModel } from "./compositionTimelineModel.js";

const DRAG_THRESHOLD_PX = 4;

export type CompositionTimelineProps = {
  model: CompositionTimelineModel;
  currentTime: number;
  selectedClipId?: string;
  /** Controlled range-selection band, in seconds. */
  selection?: { start: number; end: number };
  onSeek?: (time: number) => void;
  onSelectClip?: (clip: CompositionClip) => void;
  /** Emitted when the user drags out a range on the track. */
  onSelectRange?: (range: { start: number; end: number }) => void;
  /**
   * Floating action offered over a committed range selection (Cursor-style popup).
   * Shown above the selection band; absent = no popup. Not shown for clip selections.
   */
  selectionAction?: { label: string; hint?: string; onAct: () => void };
};

const trackStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: 58,
  background: "var(--tk-timeline-bg, var(--tk-raised, #F3F1EA))",
  border: "1px solid var(--tk-timeline-border, var(--tk-border, rgba(20,20,15,0.12)))",
  borderRadius: 8,
  overflow: "hidden",
  userSelect: "none",
  cursor: "pointer",
};

const clipStyle: CSSProperties = {
  position: "absolute",
  top: 6,
  bottom: 6,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 2,
  paddingInline: 9,
  borderRadius: 7,
  background: "var(--tk-timeline-clip, var(--tk-card, #FFFFFF))",
  border: "1px solid var(--tk-border-strong, rgba(20,20,15,0.16))",
  color: "var(--tk-text, #1B1A17)",
  fontFamily: "var(--tk-font)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  boxSizing: "border-box",
  cursor: "pointer",
};

const clipNameStyle: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  lineHeight: 1.1,
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const clipDurationStyle: CSSProperties = {
  fontFamily: "var(--tk-mono)",
  fontSize: 9.5,
  fontWeight: 400,
  lineHeight: 1.1,
  color: "var(--tk-text-ter, #9D9B94)",
};

const selectedClipStyle: CSSProperties = {
  outline: "2px solid var(--tk-accent, #6C8CFF)",
  borderColor: "var(--tk-accent, #6C8CFF)",
};

const labelStyle: CSSProperties = {
  position: "absolute",
  top: 4,
  transform: "translateX(-50%)",
  color: "var(--tk-text-ter, #9D9B94)",
  fontFamily: "var(--tk-mono)",
  fontSize: 9,
  letterSpacing: 0,
  maxWidth: "40%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  pointerEvents: "none",
};

/** Format seconds as `m:ss` for ruler ticks (no tenths). */
function rulerLabel(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const minutes = Math.floor(safe / 60);
  const secs = Math.round(safe - minutes * 60);
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/** Evenly spaced tick times (including 0 and the duration) for the timeline ruler. */
function rulerTicks(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [0];
  const steps = [1, 2, 4, 5, 10, 15, 30, 60, 120, 300];
  const step = steps.find((s) => duration / s <= 7) ?? Math.ceil(duration / 7);
  const ticks: number[] = [];
  for (let t = 0; t < duration - 1e-6; t += step) ticks.push(Math.round(t * 100) / 100);
  ticks.push(Math.round(duration * 100) / 100);
  return ticks;
}

const PLAYHEAD_COLOR = "var(--tk-playhead, #2B2926)";

const playheadStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  bottom: 0,
  width: 2,
  transform: "translateX(-1px)",
  background: PLAYHEAD_COLOR,
  borderRadius: 1,
};

/** Rounded handle at the top of the playhead — the classic "grab here" cap. */
const playheadHandleStyle: CSSProperties = {
  position: "absolute",
  top: -2,
  left: "50%",
  transform: "translateX(-50%)",
  width: 11,
  height: 9,
  borderRadius: 3,
  background: PLAYHEAD_COLOR,
};

export function CompositionTimeline({
  model,
  currentTime,
  selectedClipId,
  selection,
  onSeek,
  onSelectClip,
  onSelectRange,
  selectionAction,
}: CompositionTimelineProps) {
  const scale = createTimeScale(model.durationSeconds, 100);

  const dragRef = useRef<{ startTime: number; startX: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const [liveRange, setLiveRange] = useState<{ start: number; end: number } | null>(null);
  const supportsPointerEvents = typeof window !== "undefined" && "PointerEvent" in window;

  function timeAt(event: { clientX: number }, el: HTMLDivElement): number {
    const bounds = el.getBoundingClientRect();
    return createTimeScale(model.durationSeconds, Math.max(1, bounds.width)).pixelsToSeconds(event.clientX - bounds.left);
  }

  function handleTrackPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!onSelectRange) return;
    const el = event.currentTarget;
    if (event.pointerId !== undefined && "setPointerCapture" in el) {
      el.setPointerCapture(event.pointerId);
    }
    dragRef.current = { startTime: timeAt(event, el), startX: event.clientX, moved: false };
  }

  function handleTrackPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    if (Math.abs(event.clientX - drag.startX) > DRAG_THRESHOLD_PX) drag.moved = true;
    if (drag.moved) {
      const t = timeAt(event, event.currentTarget);
      setLiveRange({ start: Math.min(drag.startTime, t), end: Math.max(drag.startTime, t) });
    }
  }

  function handleTrackPointerUp(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    setLiveRange(null);
    const el = event.currentTarget;
    if (event.pointerId !== undefined && "releasePointerCapture" in el) {
      el.releasePointerCapture(event.pointerId);
    }
    if (!drag || !drag.moved) return;
    const end = timeAt(event, el);
    suppressClickRef.current = true;
    onSelectRange?.({ start: Math.min(drag.startTime, end), end: Math.max(drag.startTime, end) });
  }

  function handleTrackPointerCancel(event: PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    setLiveRange(null);
    const el = event.currentTarget;
    if (event.pointerId !== undefined && "releasePointerCapture" in el) {
      el.releasePointerCapture(event.pointerId);
    }
  }

  function handleTrackMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (supportsPointerEvents || !onSelectRange) return;
    const el = event.currentTarget;
    dragRef.current = { startTime: timeAt(event, el), startX: event.clientX, moved: false };
  }

  function handleTrackMouseMove(event: MouseEvent<HTMLDivElement>) {
    if (supportsPointerEvents) return;
    const drag = dragRef.current;
    if (!drag) return;
    if (Math.abs(event.clientX - drag.startX) > DRAG_THRESHOLD_PX) drag.moved = true;
    if (drag.moved) {
      const t = timeAt(event, event.currentTarget);
      setLiveRange({ start: Math.min(drag.startTime, t), end: Math.max(drag.startTime, t) });
    }
  }

  function handleTrackMouseUp(event: MouseEvent<HTMLDivElement>) {
    if (supportsPointerEvents) return;
    const drag = dragRef.current;
    dragRef.current = null;
    setLiveRange(null);
    if (!drag || !drag.moved) return;
    const end = timeAt(event, event.currentTarget);
    suppressClickRef.current = true;
    onSelectRange?.({ start: Math.min(drag.startTime, end), end: Math.max(drag.startTime, end) });
  }

  function handleTrackClick(event: MouseEvent<HTMLDivElement>) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (!onSeek) return;
    onSeek(timeAt(event, event.currentTarget));
  }

  function handleClipClick(event: MouseEvent<HTMLDivElement>, clip: CompositionClip) {
    event.stopPropagation();
    onSelectClip?.(clip);
    onSeek?.(clip.start);
  }

  function handleTrackKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!onSeek) return;
    const step = event.shiftKey ? 1 : 0.25;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onSeek(Math.max(0, currentTime - step));
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      onSeek(Math.min(model.durationSeconds, currentTime + step));
    }
    if (event.key === "Home") {
      event.preventDefault();
      onSeek(0);
    }
    if (event.key === "End") {
      event.preventDefault();
      onSeek(model.durationSeconds);
    }
  }

  function handleClipKeyDown(event: KeyboardEvent<HTMLDivElement>, clip: CompositionClip) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    onSelectClip?.(clip);
    onSeek?.(clip.start);
  }

  function labelTransform(time: number): string {
    if (time <= 0) return "translateX(0)";
    if (time >= model.durationSeconds) return "translateX(-100%)";
    return "translateX(-50%)";
  }

  return (
    <div className="tk-timeline">
      <div className="tk-timeline-ruler" aria-hidden="true">
        {rulerTicks(model.durationSeconds).map((time) => (
          <span
            key={time}
            className="tk-timeline-tick"
            style={{ left: `${scale.secondsToPixels(time)}%`, transform: labelTransform(time) }}
          >
            {rulerLabel(time)}
          </span>
        ))}
      </div>
      <div
        data-testid="composition-timeline"
        aria-label="Composition timeline"
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={model.durationSeconds}
        aria-valuenow={Math.min(currentTime, model.durationSeconds)}
        style={trackStyle}
        onPointerDown={handleTrackPointerDown}
      onPointerMove={handleTrackPointerMove}
      onPointerUp={handleTrackPointerUp}
      onPointerCancel={handleTrackPointerCancel}
      onMouseDown={handleTrackMouseDown}
      onMouseMove={handleTrackMouseMove}
      onMouseUp={handleTrackMouseUp}
      onClick={handleTrackClick}
      onKeyDown={handleTrackKeyDown}
    >
      {model.clips.map((clip) => {
        const left = scale.secondsToPixels(clip.start);
        const width = scale.secondsToPixels(clip.end) - left;
        const selected = clip.id === selectedClipId;
        return (
          <div
            key={clip.id}
            data-testid={`composition-clip-${clip.id}`}
            data-selected={selected ? "true" : "false"}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            style={{ ...clipStyle, ...(selected && selectedClipStyle), left: `${left}%`, width: `${width}%` }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => handleClipClick(event, clip)}
            onKeyDown={(event) => handleClipKeyDown(event, clip)}
          >
            <span style={clipNameStyle}>{clip.label ?? clip.id}</span>
            <span style={clipDurationStyle}>{(clip.end - clip.start).toFixed(1)}s</span>
          </div>
        );
      })}
      {model.labels.map((label) => (
        <div
          key={label.name}
          data-testid={`composition-label-${label.name.replace(/\s+/g, "-")}`}
          style={{
            ...labelStyle,
            left: `${scale.secondsToPixels(label.time)}%`,
            transform: labelTransform(label.time),
          }}
        >
          {label.name}
        </div>
      ))}
      {(liveRange ?? selection) ? (
        <div
          data-testid="composition-selection-band"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${scale.secondsToPixels((liveRange ?? selection)!.start)}%`,
            width: `${scale.secondsToPixels((liveRange ?? selection)!.end) - scale.secondsToPixels((liveRange ?? selection)!.start)}%`,
            background: "var(--tk-accent-soft, rgba(108,140,255,0.22))",
            border: "1px solid var(--tk-accent, #6C8CFF)",
            borderRadius: 4,
            pointerEvents: "none",
          }}
        />
      ) : null}
      </div>
      <div data-testid="composition-playhead" style={{ ...playheadStyle, left: `${scale.secondsToPixels(currentTime)}%` }}>
        <div data-testid="composition-playhead-handle" style={playheadHandleStyle} />
      </div>
      {selectionAction && selection && selectedClipId === undefined && !liveRange ? (
        <div
          data-testid="composition-selection-popup"
          className="tk-selection-popup"
          style={{ left: `${(scale.secondsToPixels(selection.start) + scale.secondsToPixels(selection.end)) / 2}%` }}
        >
          <button type="button" className="tk-selection-popup-btn" onClick={selectionAction.onAct}>
            {selectionAction.label}
            {selectionAction.hint ? <kbd>{selectionAction.hint}</kbd> : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}
