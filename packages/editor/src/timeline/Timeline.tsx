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
  borderBottom: "1px solid var(--tk-border, rgba(20,20,15,0.12))",
};

const laneStyle: CSSProperties = {
  position: "relative",
  minHeight: "3rem",
};

function formatTickTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function computeTickInterval(duration: number): number {
  // Target ~6–8 ticks; pick a "nice" interval
  const targets = [1, 2, 4, 5, 10, 15, 20, 30, 60];
  for (const t of targets) {
    const count = Math.floor(duration / t);
    if (count >= 4 && count <= 10) return t;
  }
  return Math.ceil(duration / 7);
}

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

  // Compute tick marks for the ruler
  const tickInterval = computeTickInterval(project.duration);
  const ticks: number[] = [];
  for (let t = 0; t <= project.duration; t += tickInterval) {
    ticks.push(t);
  }

  return (
    <section
      aria-label="Timeline"
      style={{
        background: "var(--tk-card, #FFFFFF)",
        border: "1px solid var(--tk-border, rgba(20,20,15,0.12))",
        borderRadius: "var(--tk-radius-lg, 11px)",
        overflow: "hidden",
      }}
    >
      {/* Ruler row */}
      <div
        style={{
          ...rowStyle,
          minHeight: "2.5rem",
          background: "var(--tk-raised, #F3F1EA)",
          borderBottom: "1px solid var(--tk-border, rgba(20,20,15,0.12))",
        }}
      >
        <div
          style={{
            padding: "0 0.75rem",
            display: "flex",
            alignItems: "center",
            color: "var(--tk-text-ter, #9D9B94)",
            fontSize: 10.5,
            fontFamily: "var(--tk-mono, 'IBM Plex Mono', ui-monospace, monospace)",
            letterSpacing: "0.02em",
          }}
        >
          {/* Empty label cell — clean ruler header */}
        </div>
        <div
          data-testid="timeline-ruler"
          onClick={handleSeek}
          style={{ ...laneStyle, cursor: "pointer", minHeight: "2.5rem" }}
        >
          {/* Tick labels */}
          {ticks.map((t) => (
            <div
              key={t}
              style={{
                position: "absolute",
                left: timeToPercent(t),
                top: 0,
                bottom: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                pointerEvents: "none",
              }}
            >
              {/* Tick mark line */}
              <div
                style={{
                  width: 1,
                  height: 6,
                  background: "var(--tk-border, rgba(20,20,15,0.12))",
                  marginTop: 0,
                }}
              />
              {/* Tick label */}
              <span
                style={{
                  fontFamily: "var(--tk-mono, 'IBM Plex Mono', ui-monospace, monospace)",
                  fontSize: 10.5,
                  color: "var(--tk-text-ter, #9D9B94)",
                  lineHeight: 1,
                  marginLeft: 3,
                  userSelect: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {formatTickTime(t)}
              </span>
            </div>
          ))}

          {/* Selection band */}
          {selectedRange ? (
            <div
              data-testid="selected-range"
              aria-label={`Selected range ${selectedRange.start.toFixed(1)}s to ${selectedRange.end.toFixed(1)}s`}
              style={{
                position: "absolute",
                left: selectionStart,
                width: selectionWidth,
                insetBlock: 4,
                background: "var(--tk-accent-soft, rgba(59,91,217,0.10))",
                border: "1px solid var(--tk-accent-line, rgba(59,91,217,0.32))",
                borderRadius: "var(--tk-radius-sm, 6px)",
              }}
            />
          ) : null}

          {/* Playhead */}
          <div
            data-testid="timeline-playhead"
            style={{
              position: "absolute",
              left: playheadLeft,
              top: 0,
              bottom: 0,
              width: 2,
              background: "var(--tk-accent, #3B5BD9)",
            }}
          />
        </div>
      </div>

      {/* Track / event rows */}
      {rows.map((row) => (
        <div key={row.id} style={rowStyle}>
          <div
            style={{
              padding: "0.5rem 0.75rem",
              color: "var(--tk-text-sec, #6E6C66)",
              background: "var(--tk-raised, #F3F1EA)",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              borderRight: "1px solid var(--tk-border, rgba(20,20,15,0.12))",
            }}
          >
            {row.label}
          </div>
          <div
            data-testid={`timeline-lane-${row.id}`}
            onClick={handleSeek}
            style={{ ...laneStyle, cursor: "pointer" }}
          >
            {row.items.map((item) => {
              const left = timeToPercent(item.start);
              const itemWidth = rangeToPercent(item.start, item.end);
              const isClip = item.kind === "clip";
              const durationSec = item.end - item.start;

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
                    top: isClip ? 6 : 8,
                    height: isClip ? 36 : 24,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                    // Clip: warm raised bar
                    ...(isClip
                      ? {
                          background: "var(--tk-raised, #F3F1EA)",
                          border: "1px solid var(--tk-border, rgba(20,20,15,0.12))",
                          borderRadius: "var(--tk-radius-sm, 6px)",
                          color: "var(--tk-text, #1B1A17)",
                          boxShadow: "var(--tk-shadow-sm, 0 1px 2px rgba(20,20,15,0.06))",
                          paddingLeft: 8,
                          paddingRight: 8,
                          fontSize: 12,
                          fontWeight: 500,
                          textAlign: "left",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }
                      : // Zoom/event: thin accent-translucent bar
                        {
                          background: "var(--tk-accent-soft, rgba(59,91,217,0.10))",
                          border: "1px solid var(--tk-accent-line, rgba(59,91,217,0.32))",
                          borderRadius: "var(--tk-radius-sm, 6px)",
                          color: "var(--tk-accent, #3B5BD9)",
                          paddingLeft: 6,
                          paddingRight: 6,
                          fontSize: 11,
                          fontWeight: 500,
                          textAlign: "left",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }),
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSeek(item.start);
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.label}
                  </span>
                  {isClip ? (
                    <span
                      style={{
                        color: "var(--tk-text-sec, #6E6C66)",
                        fontSize: 10.5,
                        fontFamily: "var(--tk-mono, 'IBM Plex Mono', ui-monospace, monospace)",
                        flexShrink: 0,
                      }}
                    >
                      {durationSec.toFixed(1)}s
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
