import { type CSSProperties } from "react";
import { formatTimecode } from "@tinker/editor";

export type CompositionPlaybackBarProps = {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  canPrev: boolean;
  canNext: boolean;
  onPlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
};

const barStyle: CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
  borderRadius: "var(--tk-radius-md)", background: "var(--tk-raised)", border: "1px solid var(--tk-border)",
};

export function CompositionPlaybackBar({
  currentTime, duration, isPlaying, canPrev, canNext, onPlayPause, onPrev, onNext,
}: CompositionPlaybackBarProps) {
  return (
    <section aria-label="Playback controls" style={barStyle}>
      <button type="button" className="tk-iconbtn" aria-label="Previous clip" disabled={!canPrev} onClick={onPrev}>‹</button>
      <button type="button" className="tk-play" aria-label={isPlaying ? "Pause" : "Play"} onClick={onPlayPause}>
        {isPlaying ? "❚❚" : "▶"}
      </button>
      <button type="button" className="tk-iconbtn" aria-label="Next clip" disabled={!canNext} onClick={onNext}>›</button>
      <span className="tk-timecode" aria-label="Timecode">
        {formatTimecode(currentTime)} / {formatTimecode(duration)}
      </span>
    </section>
  );
}
