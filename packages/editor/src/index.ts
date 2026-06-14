export type { EditorUiState, SelectedEntity, SelectedEntityType, SelectedRange } from "./state/editorState.js";
export { createInitialEditorState, normalizeSelectedRange } from "./state/editorState.js";
export type { TimelineItem, TimelineItemKind, TimelineRow, TimelineRowKind } from "./timeline/timelineModel.js";
export { buildTimelineRows } from "./timeline/timelineModel.js";
export type { TimeScale } from "./timeline/timeScale.js";
export { createTimeScale } from "./timeline/timeScale.js";
export { Timeline } from "./timeline/Timeline.js";
export type { TimelineProps } from "./timeline/Timeline.js";
export type { ActivePreviewOverlays } from "./preview/activeOverlays.js";
export { getActivePreviewOverlays } from "./preview/activeOverlays.js";
export type { PreviewMotionState } from "./preview/previewMotionState.js";
export { buildPreviewMotionState } from "./preview/previewMotionState.js";
export { Preview } from "./preview/Preview.js";
export type { PreviewProps } from "./preview/Preview.js";
export type { AssetResolutionIssue, AssetResolutionIssueCode, BrowserAssetResolution } from "./project/assetResolver.js";
export { getAssetById, getPrimaryClip, isBrowserRenderableMedia, resolveBrowserPreviewAsset } from "./project/assetResolver.js";
export type {
  DeserializeDemoProjectJsonResult,
  ProjectPersistenceError,
  ProjectValidationIssue,
  SerializeDemoProjectResult,
} from "./project/projectPersistence.js";
export {
  deserializeDemoProjectJson,
  formatProjectValidationIssues,
  MAX_DEMO_PROJECT_JSON_BYTES,
  serializeDemoProject,
} from "./project/projectPersistence.js";
export type {
  AIEditProposal,
  ApplyEditOperationsError,
  ApplyEditOperationsMode,
  ApplyEditOperationsOptions,
  ApplyEditOperationsResult,
} from "./applyEditOperations.js";
export { applyEditOperations } from "./applyEditOperations.js";
export type { AcceptAutoZoomSuggestionsResult, AutoZoomSuggestionState } from "./autoZoomSuggestionFlow.js";
export { acceptAutoZoomSuggestions, buildAutoZoomSuggestionState } from "./autoZoomSuggestionFlow.js";
export type { ProjectSlice, ProjectSliceClip } from "./selectProjectSlice.js";
export { normalizeProjectSliceRange, selectProjectSlice } from "./selectProjectSlice.js";
export type { EditorCommand, EditorCommandType, EditorHistory, HistoryStepResult } from "./editorHistory.js";
export {
  createEditorHistory,
  pushEditorCommand,
  redoEditorCommand,
  undoEditorCommand,
} from "./editorHistory.js";
export type {
  ApplyManualEditOperationOptions,
  ApplyManualEditOperationResult,
  ManualEditOperation,
  ManualEditOperationsError,
} from "./manualEditOperations.js";
export { applyManualEditOperation } from "./manualEditOperations.js";
export type { PrepareMp4ExportResult } from "./export/prepareMp4Export.js";
export { prepareMp4Export } from "./export/prepareMp4Export.js";
export * from "./motion/index.js";
export type {
  CompositionClip,
  CompositionTimelineLabel,
  CompositionTimelineModel,
  GsapChildLike,
  GsapTimelineLike,
} from "./composition/compositionTimelineModel.js";
export { readCompositionTimeline } from "./composition/compositionTimelineModel.js";
export type {
  CompositionTimelineHandle,
  TimelineRegistryWindow,
  WaitForCompositionTimelineOptions,
} from "./composition/compositionWindow.js";
export { getCompositionTimeline, getSoleCompositionTimeline, waitForCompositionTimeline } from "./composition/compositionWindow.js";
export type { CompositionPreviewProps } from "./composition/CompositionPreview.js";
export { CompositionPreview } from "./composition/CompositionPreview.js";
export type { CompositionTimelineProps } from "./composition/CompositionTimeline.js";
export { CompositionTimeline } from "./composition/CompositionTimeline.js";
export type { CompositionSelection } from "./composition/selection.js";
export { rangeSelection, clipSelection } from "./composition/selection.js";
