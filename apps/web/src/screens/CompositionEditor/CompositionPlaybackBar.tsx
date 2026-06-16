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
  onSkipStart?: () => void;
  onSkipEnd?: () => void;
  /** Undo the last timeline edit. */
  onUndo?: () => void;
  canUndo?: boolean;
  /** Redo a previously undone timeline edit. */
  onRedo?: () => void;
  canRedo?: boolean;
  /** Split the clip under the playhead into two. */
  onSplit?: () => void;
  canSplit?: boolean;
  /** Delete the selected clip. */
  onDelete?: () => void;
  canDelete?: boolean;
  /** Drop a marker at the playhead. */
  onAddMarker?: () => void;
};

function SkipStartIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 5v14" />
      <path d="m18 6-9 6 9 6V6Z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m9 6 9 6-9 6V6Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 5v14" />
      <path d="M16 5v14" />
    </svg>
  );
}

function SkipEndIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 5v14" />
      <path d="m6 6 9 6-9 6V6Z" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-1" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9a5 5 0 0 0 0 10h1" />
    </svg>
  );
}

function SplitIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18" strokeDasharray="2 3" />
      <path d="m8 8-3 4 3 4" />
      <path d="m16 8 3 4-3 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" />
      <path d="M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2" />
      <path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function MarkerIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3v18" />
      <path d="M6 4h11l-2.5 4 2.5 4H6" />
    </svg>
  );
}

export function CompositionPlaybackBar({
  currentTime,
  duration,
  isPlaying,
  canPrev,
  canNext,
  onPlayPause,
  onPrev,
  onNext,
  onSkipStart,
  onSkipEnd,
  onUndo,
  canUndo,
  onRedo,
  canRedo,
  onSplit,
  canSplit,
  onDelete,
  canDelete,
  onAddMarker,
}: CompositionPlaybackBarProps) {
  return (
    <section aria-label="Playback controls" className="tk-composition-playback">
      <div className="tk-composition-playback-controls">
        <button type="button" className="tk-iconbtn" aria-label="Skip to beginning" disabled={!canPrev} onClick={onSkipStart ?? onPrev}>
          <SkipStartIcon />
        </button>
        <button type="button" className="tk-play" aria-label={isPlaying ? "Pause" : "Play"} onClick={onPlayPause}>
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button type="button" className="tk-iconbtn" aria-label="Skip to end" disabled={!canNext} onClick={onSkipEnd ?? onNext}>
          <SkipEndIcon />
        </button>
      </div>
      <span className="tk-timecode" aria-label="Timecode">
        {formatTimecode(currentTime)} / {formatTimecode(duration)}
      </span>
      <span className="tk-vr" aria-hidden="true" />
      <div className="tk-composition-edit-tools" role="group" aria-label="Edit tools">
        <button type="button" className="tk-iconbtn" aria-label="Undo" title="Undo" disabled={!canUndo} onClick={onUndo}>
          <UndoIcon />
        </button>
        <button type="button" className="tk-iconbtn" aria-label="Redo" title="Redo" disabled={!canRedo} onClick={onRedo}>
          <RedoIcon />
        </button>
        <button type="button" className="tk-iconbtn" aria-label="Split clip" title="Split clip at playhead" disabled={!canSplit} onClick={onSplit}>
          <SplitIcon />
        </button>
        <button type="button" className="tk-iconbtn" aria-label="Delete clip" title="Delete selected clip" disabled={!canDelete} onClick={onDelete}>
          <TrashIcon />
        </button>
        <button type="button" className="tk-iconbtn" aria-label="Add marker" title="Add marker at playhead" disabled={!onAddMarker} onClick={onAddMarker}>
          <MarkerIcon />
        </button>
      </div>
    </section>
  );
}
