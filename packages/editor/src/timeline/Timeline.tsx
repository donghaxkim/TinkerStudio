import type { CSSProperties, MouseEvent } from "react";
import type { DemoProject } from "@tinker/project-schema";
import type { SelectedRange } from "../state/editorState.js";
import { createTimeScale } from "./timeScale.js";
import { buildTimelineRows } from "./timelineModel.js";

export type TimelineProps = {
  project: DemoProject;
  currentTime: number;
  selectedRange?: SelectedRange;
  width?: number;
  onSeek: (time: number) => void;
};

const rowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "9rem 1fr",
  minHeight: "3rem",
  borderBottom: "1px solid #263044",
};

const laneStyle: CSSProperties = {
  position: "relative",
  minHeight: "3rem",
  background: "linear-gradient(90deg, rgba(148,163,184,0.12) 1px, transparent 1px)",
  backgroundSize: "80px 100%",
};

export function Timeline({ project, currentTime, selectedRange, width = 960, onSeek }: TimelineProps) {
  const rows = buildTimelineRows(project);
  const percentageScale = createTimeScale(project.duration, 100);
  const timeToPercent = (time: number) => `${percentageScale.secondsToPixels(time).toFixed(4)}%`;
  const rangeToPercent = (start: number, end: number) =>
    `${Math.max(0, percentageScale.secondsToPixels(end) - percentageScale.secondsToPixels(start)).toFixed(4)}%`;

  const handleSeek = (event: MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const laneWidth = bounds.width || width;
    const x = event.clientX - bounds.left;
    onSeek(createTimeScale(project.duration, laneWidth).pixelsToSeconds(x));
  };

  const playheadLeft = timeToPercent(currentTime);
  const selectionStart = selectedRange ? timeToPercent(Math.min(selectedRange.start, selectedRange.end)) : "0%";
  const selectionWidth = selectedRange
    ? rangeToPercent(Math.min(selectedRange.start, selectedRange.end), Math.max(selectedRange.start, selectedRange.end))
    : "0%";

  return (
    <section aria-label="Timeline" style={{ border: "1px solid #263044", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ ...rowStyle, minHeight: "2.5rem", background: "#111827" }}>
        <div style={{ padding: "0.75rem", color: "#cbd5e1", fontWeight: 700 }}>Timeline</div>
        <div data-testid="timeline-ruler" onClick={handleSeek} style={{ ...laneStyle, cursor: "pointer" }}>
          {selectedRange ? (
            <div
              data-testid="selected-range"
              aria-label={`Selected range ${selectedRange.start.toFixed(1)}s to ${selectedRange.end.toFixed(1)}s`}
              style={{
                position: "absolute",
                left: selectionStart,
                width: selectionWidth,
                insetBlock: 4,
                background: "rgba(59,130,246,0.25)",
                border: "1px solid rgba(96,165,250,0.7)",
                borderRadius: 6,
              }}
            />
          ) : null}
          <div
            data-testid="timeline-playhead"
            style={{ position: "absolute", left: playheadLeft, top: 0, bottom: 0, width: 2, background: "#f97316" }}
          />
        </div>
      </div>
      {rows.map((row) => (
        <div key={row.id} style={rowStyle}>
          <div style={{ padding: "0.75rem", color: "#e2e8f0", background: "#0f172a" }}>{row.label}</div>
          <div data-testid={`timeline-lane-${row.id}`} onClick={handleSeek} style={{ ...laneStyle, cursor: "pointer" }}>
            {row.items.map((item) => {
              const left = timeToPercent(item.start);
              const itemWidth = rangeToPercent(item.start, item.end);
              return (
                <button
                  type="button"
                  key={item.id}
                  aria-label={`${item.kind}: ${item.label}`}
                  style={{
                    position: "absolute",
                    left,
                    width: itemWidth,
                    minWidth: 4,
                    top: 8,
                    height: 32,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    border: "1px solid rgba(255,255,255,0.24)",
                    borderRadius: 8,
                    color: "white",
                    background: item.kind === "clip" ? "#2563eb" : "#9333ea",
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSeek(item.start);
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
