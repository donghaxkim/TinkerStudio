import type { CSSProperties, MouseEvent } from "react";
import type { DemoProject } from "@tinker/project-schema";
import type { SelectedEntity, SelectedRange } from "../state/editorState.js";
import { createTimeScale } from "./timeScale.js";
import { buildTimelineRows } from "./timelineModel.js";

export type TimelineProps = {
  project: DemoProject;
  currentTime: number;
  selectedRange?: SelectedRange;
  selectedEntity?: SelectedEntity;
  width?: number;
  onSeek: (time: number) => void;
  onSelectItem?: (item: { id: string; kind: string; start: number; end: number }) => void;
};

const laneStyle: CSSProperties = {
  position: "relative",
  minHeight: "3.25rem",
};

function formatTickTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function computeTickInterval(duration: number): number {
  // Target ~6–8 ticks; pick a "nice" interval.
  // Extended to cover long recordings (up to multi-hour).
  const targets = [1, 2, 4, 5, 10, 15, 20, 30, 60, 120, 300, 600, 1800, 3600];
  for (const t of targets) {
    const count = Math.floor(duration / t);
    if (count >= 4 && count <= 10) return t;
  }
  // Fallback: always guarantee a positive interval so the tick loop never hangs.
  return Math.max(1, Math.ceil(duration / 7));
}

export function Timeline({
  project,
  currentTime,
  selectedRange,
  selectedEntity,
  width = 960,
  onSeek,
  onSelectItem,
}: TimelineProps) {
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

  // Compute tick marks for the ruler.
  // Guard: if duration is zero or negative, emit a single tick at 0 and skip the loop.
  const tickInterval = computeTickInterval(project.duration);
  const ticks: number[] = [];
  if (project.duration <= 0) {
    ticks.push(0);
  } else {
    for (let t = 0; t <= project.duration; t += tickInterval) {
      ticks.push(t);
    }
  }

  return (
    <section
      aria-label="Timeline"
      style={{
        position: "relative",
        background: "var(--tk-card, #FFFFFF)",
        border: "1px solid var(--tk-border, rgba(20,20,15,0.12))",
        borderRadius: "var(--tk-radius-lg, 11px)",
        overflow: "hidden",
      }}
    >
      {/* Ruler row — flush full-width (M11) */}
      <div
        data-testid="timeline-ruler"
        onClick={handleSeek}
        style={{
          ...laneStyle,
          cursor: "pointer",
          minHeight: "2.25rem",
          background: "var(--tk-raised, #F3F1EA)",
          borderBottom: "1px solid var(--tk-border, rgba(20,20,15,0.12))",
        }}
      >
        {/* Tick labels — 9px mono, quiet grey, dot separators (m28) */}
        {ticks.map((t, index) => {
          const isLastTick = index === ticks.length - 1 && ticks.length > 1;
          const isFirstTick = index === 0;
          return (
            <div
              key={t}
              style={{
                position: "absolute",
                left: timeToPercent(t),
                top: 0,
                bottom: 0,
                display: "flex",
                alignItems: "center",
                gap: 4,
                alignContent: "center",
                pointerEvents: "none",
              }}
            >
              {/* Leading dot separator (skip on the first tick) */}
              {!isFirstTick ? (
                <span
                  style={{
                    fontFamily: "var(--tk-mono, 'IBM Plex Mono', ui-monospace, monospace)",
                    fontSize: 9,
                    color: "#A8A6A0",
                    lineHeight: 1,
                    transform: "translateX(-8px)",
                    userSelect: "none",
                  }}
                >
                  ·
                </span>
              ) : null}
              <span
                style={{
                  fontFamily: "var(--tk-mono, 'IBM Plex Mono', ui-monospace, monospace)",
                  fontSize: 9,
                  color: "#A8A6A0",
                  lineHeight: 1,
                  ...(isLastTick ? { transform: "translateX(-100%)" } : { marginLeft: 4 }),
                  userSelect: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {formatTickTime(t)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Track / event rows — flush full-width, no label column (M11) */}
      {rows.map((row) => (
        <div
          key={row.id}
          data-testid={`timeline-lane-${row.id}`}
          onClick={handleSeek}
          style={{
            ...laneStyle,
            cursor: "pointer",
            padding: "6px 8px",
            borderBottom: "1px solid var(--tk-border, rgba(20,20,15,0.12))",
          }}
        >
          {/* Click markers on clip (track) rows — kept aria-hidden for parity */}
          {row.kind === "track"
            ? project.cursorEvents
                .filter((e) => e.type === "click")
                .map((e, i) => (
                  <div
                    key={`click-marker-${i}`}
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: timeToPercent(e.time),
                      bottom: 3,
                      transform: "translateX(-50%) rotate(45deg)",
                      width: 5,
                      height: 5,
                      background: "var(--tk-text-ter, #9D9B94)",
                      pointerEvents: "none",
                      zIndex: 1,
                    }}
                  />
                ))
            : null}

          {/* Diamond markers along the bottom of the zoom lane (m29) */}
          {row.kind === "zooms"
            ? row.items.map((item) => (
                <div
                  key={`zoom-marker-${item.id}`}
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: timeToPercent(item.start),
                    bottom: 2,
                    transform: "translateX(-50%) rotate(45deg)",
                    width: 5,
                    height: 5,
                    background: "var(--tk-text-ter, #9D9B94)",
                    pointerEvents: "none",
                    zIndex: 1,
                  }}
                />
              ))
            : null}

          {row.items.map((item) => {
            const left = timeToPercent(item.start);
            const itemWidth = rangeToPercent(item.start, item.end);
            const isClip = item.kind === "clip";
            const durationSec = item.end - item.start;
            const zoom = isClip ? undefined : project.zooms.find((z) => z.id === item.id);
            const itemEntityType = isClip ? "clip" : "zoom";
            const isSelected =
              selectedEntity?.id === item.id && selectedEntity?.type === itemEntityType;

            return (
              <button
                type="button"
                key={item.id}
                aria-label={`${item.kind}: ${item.label}`}
                aria-pressed={isSelected}
                style={{
                  position: "absolute",
                  left,
                  width: itemWidth,
                  minWidth: 4,
                  top: 4,
                  height: 46,
                  overflow: "hidden",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  paddingLeft: 9,
                  paddingRight: 9,
                  borderRadius: 7,
                  textAlign: "left",
                  ...(isClip
                    ? {
                        // Clip card — white (M14)
                        background: "#FFFFFF",
                        border: `1px solid ${isSelected ? "var(--tk-accent, #3B5BD9)" : "rgba(20,20,15,0.16)"}`,
                        boxShadow: isSelected ? "0 0 0 1px var(--tk-accent, #3B5BD9)" : "var(--tk-shadow-sm, 0 1px 2px rgba(20,20,15,0.06))",
                        color: "#44423D",
                      }
                    : {
                        // Zoom card — blue-tinted (M13)
                        background: "rgba(59,91,217,0.1)",
                        border: `1px solid ${isSelected ? "var(--tk-accent, #3B5BD9)" : "rgba(59,91,217,0.5)"}`,
                        boxShadow: isSelected ? "0 0 0 1px var(--tk-accent, #3B5BD9)" : "none",
                        color: "var(--tk-accent, #3B5BD9)",
                      }),
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectItem?.({ id: item.id, kind: item.kind, start: item.start, end: item.end });
                  onSeek(item.start);
                }}
              >
                {!isClip ? (
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    style={{ flexShrink: 0 }}
                  >
                    <circle cx="11" cy="11" r="7" />
                    <line x1="21" y1="21" x2="16.5" y2="16.5" />
                  </svg>
                ) : null}
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: isClip ? 10.5 : 10.5,
                    fontWeight: 600,
                  }}
                >
                  {item.label}
                </span>
                {isClip ? (
                  <span
                    style={{
                      marginLeft: "auto",
                      color: "var(--tk-text-ter, #9D9B94)",
                      fontSize: 8.5,
                      fontFamily: "var(--tk-mono, 'IBM Plex Mono', ui-monospace, monospace)",
                      flexShrink: 0,
                    }}
                  >
                    {durationSec.toFixed(1)}s
                  </span>
                ) : zoom?.scale !== undefined ? (
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 9,
                      fontFamily: "var(--tk-mono, 'IBM Plex Mono', ui-monospace, monospace)",
                      flexShrink: 0,
                    }}
                  >
                    ×{zoom.scale}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ))}

      {/* Keep a hidden, accessible selected-range node so range-driven tests/UX
          still find it, without drawing a highlight box on the ruler (m28). */}
      {selectedRange ? (
        <span
          data-testid="selected-range"
          aria-label={`Selected range ${selectedRange.start.toFixed(1)}s to ${selectedRange.end.toFixed(1)}s`}
          style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", margin: -1, padding: 0, border: 0 }}
        />
      ) : null}

      {/* Playhead — 2px near-black line + black diamond handle, spans the whole
          timeline (ruler + tracks) (M12). */}
      <div
        data-testid="timeline-playhead"
        style={{
          position: "absolute",
          left: playheadLeft,
          top: 0,
          bottom: 0,
          width: 2,
          background: "#1B1A17",
          pointerEvents: "none",
          zIndex: 3,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translate(-50%, -2px) rotate(45deg)",
            width: 9,
            height: 9,
            background: "#1B1A17",
          }}
        />
      </div>
    </section>
  );
}
