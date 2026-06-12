export type SelectedRange = {
  start: number;
  end: number;
};

export type SelectedEntityType = "clip" | "zoom";

export type SelectedEntity = {
  type: SelectedEntityType;
  id: string;
};

export type EditorUiState = {
  currentTime: number;
  isPlaying: boolean;
  selectedRange?: SelectedRange;
  selectedEntity?: SelectedEntity;
};

export function createInitialEditorState(duration = 0): EditorUiState {
  return {
    currentTime: Math.max(0, Math.min(duration, 0)),
    isPlaying: false,
  };
}

export function normalizeSelectedRange(range: SelectedRange): SelectedRange {
  return range.start <= range.end
    ? range
    : { start: range.end, end: range.start };
}
