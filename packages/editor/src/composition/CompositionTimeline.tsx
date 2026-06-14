import { useRef, useState, type CSSProperties, type MouseEvent } from "react";
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
};

const trackStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: 56,
  background: "var(--tk-timeline-bg, #2B2A24)",
  borderRadius: 10,
  overflow: "hidden",
  userSelect: "none",
  cursor: "pointer",
};

const clipStyle: CSSProperties = {
  position: "absolute",
  top: 8,
  bottom: 8,
  display: "flex",
  alignItems: "center",
  paddingInline: 8,
  borderRadius: 6,
  background: "var(--tk-timeline-clip, #54503F)",
  color: "white",
  fontFamily: "var(--tk-font)",
  fontSize: 12,
  whiteSpace: "nowrap",
  overflow: "hidden",
  boxSizing: "border-box",
  cursor: "pointer",
};

const selectedClipStyle: CSSProperties = {
  outline: "2px solid var(--tk-accent, #6C8CFF)",
};

const labelStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  transform: "translateX(-50%)",
  color: "var(--tk-text-ter, #B8B4A4)",
  fontFamily: "var(--tk-mono)",
  fontSize: 10,
};

const playheadStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  bottom: 0,
  width: 2,
  transform: "translateX(-1px)",
  background: "var(--tk-accent, #6C8CFF)",
};

export function CompositionTimeline({
  model,
  currentTime,
  selectedClipId,
  selection,
  onSeek,
  onSelectClip,
  onSelectRange,
}: CompositionTimelineProps) {
  const scale = createTimeScale(model.durationSeconds, 100);

  const dragRef = useRef<{ startTime: number; startX: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const [liveRange, setLiveRange] = useState<{ start: number; end: number } | null>(null);

  function timeAt(event: MouseEvent<HTMLDivElement>, el: HTMLDivElement): number {
    const bounds = el.getBoundingClientRect();
    return createTimeScale(model.durationSeconds, Math.max(1, bounds.width)).pixelsToSeconds(event.clientX - bounds.left);
  }

  function handleTrackMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (!onSelectRange) return;
    const el = event.currentTarget;
    dragRef.current = { startTime: timeAt(event, el), startX: event.clientX, moved: false };
  }

  function handleTrackMouseMove(event: MouseEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    if (Math.abs(event.clientX - drag.startX) > DRAG_THRESHOLD_PX) drag.moved = true;
    if (drag.moved) {
      const t = timeAt(event, event.currentTarget);
      setLiveRange({ start: Math.min(drag.startTime, t), end: Math.max(drag.startTime, t) });
    }
  }

  function handleTrackMouseUp(event: MouseEvent<HTMLDivElement>) {
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

  return (
    <div
      data-testid="composition-timeline"
      aria-label="Composition timeline"
      style={trackStyle}
      onMouseDown={handleTrackMouseDown}
      onMouseMove={handleTrackMouseMove}
      onMouseUp={handleTrackMouseUp}
      onClick={handleTrackClick}
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
            style={{ ...clipStyle, ...(selected && selectedClipStyle), left: `${left}%`, width: `${width}%` }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => handleClipClick(event, clip)}
          >
            {clip.label ?? clip.id}
          </div>
        );
      })}
      {model.labels.map((label) => (
        <div
          key={label.name}
          data-testid={`composition-label-${label.name.replace(/\s+/g, "-")}`}
          style={{ ...labelStyle, left: `${scale.secondsToPixels(label.time)}%` }}
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
      <div data-testid="composition-playhead" style={{ ...playheadStyle, left: `${scale.secondsToPixels(currentTime)}%` }} />
    </div>
  );
}
