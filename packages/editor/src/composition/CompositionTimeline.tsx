import { type CSSProperties } from "react";
import { createTimeScale } from "../timeline/timeScale.js";
import type { CompositionClip, CompositionTimelineModel } from "./compositionTimelineModel.js";

export type CompositionTimelineProps = {
  model: CompositionTimelineModel;
  /** Current playhead time in seconds. */
  currentTime: number;
  /** Id of the currently selected clip, if any. */
  selectedClipId?: string;
  /** Seek to a time when the track is clicked (wired in Task 2). */
  onSeek?: (time: number) => void;
  /** Select a clip when it is clicked (wired in Task 2). */
  onSelectClip?: (clip: CompositionClip) => void;
};

const trackStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: 56,
  background: "var(--tk-timeline-bg, #2B2A24)",
  borderRadius: 10,
  overflow: "hidden",
  userSelect: "none",
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

export function CompositionTimeline({ model, currentTime, selectedClipId }: CompositionTimelineProps) {
  const scale = createTimeScale(model.durationSeconds, 100);

  return (
    <div data-testid="composition-timeline" style={trackStyle}>
      {model.clips.map((clip) => {
        const left = scale.secondsToPixels(clip.start);
        const width = scale.secondsToPixels(clip.end) - left;
        const selected = clip.id === selectedClipId;
        return (
          <div
            key={clip.id}
            data-testid={`composition-clip-${clip.id}`}
            data-selected={selected ? "true" : "false"}
            style={{ ...clipStyle, ...(selected ? selectedClipStyle : {}), left: `${left}%`, width: `${width}%` }}
          >
            {clip.label ?? clip.id}
          </div>
        );
      })}
      {model.labels.map((label) => (
        <div
          key={label.name}
          data-testid={`composition-label-${label.name}`}
          style={{ ...labelStyle, left: `${scale.secondsToPixels(label.time)}%` }}
        >
          {label.name}
        </div>
      ))}
      <div data-testid="composition-playhead" style={{ ...playheadStyle, left: `${scale.secondsToPixels(currentTime)}%` }} />
    </div>
  );
}
