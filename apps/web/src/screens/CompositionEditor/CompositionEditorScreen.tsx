import { useState, type CSSProperties } from "react";
import {
  CompositionPreview,
  CompositionTimeline,
  type CompositionClip,
  type CompositionTimelineModel,
  type TimelineRegistryWindow,
} from "@tinker/editor";

export type CompositionEditorScreenProps = {
  /** URL of the composition-index artifact (index.html). */
  compositionIndexUrl: string;
  /** URL of the output-video artifact (mp4), used as the preview fallback. */
  outputVideoUrl?: string;
  /** Test seam: forwarded to CompositionPreview to resolve the iframe content window. */
  resolveWindow?: (iframe: HTMLIFrameElement) => TimelineRegistryWindow | null | undefined;
};

const pageStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 12, height: "100%", minHeight: 0 };
const previewStyle: CSSProperties = { flex: 1, minHeight: 0 };
const timelineStyle: CSSProperties = { flexShrink: 0 };

export function CompositionEditorScreen({ compositionIndexUrl, outputVideoUrl, resolveWindow }: CompositionEditorScreenProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [model, setModel] = useState<CompositionTimelineModel | undefined>(undefined);
  const [selectedClipId, setSelectedClipId] = useState<string | undefined>(undefined);

  function handleSelectClip(clip: CompositionClip) {
    setSelectedClipId(clip.id);
  }

  return (
    <div className="tk-porcelain" style={pageStyle}>
      <div style={previewStyle}>
        <CompositionPreview
          src={compositionIndexUrl}
          currentTime={currentTime}
          fallbackVideoSrc={outputVideoUrl}
          onReady={(readyModel, _handle) => setModel(readyModel)}
          resolveWindow={resolveWindow}
        />
      </div>
      {model ? (
        <div style={timelineStyle}>
          <CompositionTimeline
            model={model}
            currentTime={currentTime}
            selectedClipId={selectedClipId}
            onSeek={setCurrentTime}
            onSelectClip={handleSelectClip}
          />
        </div>
      ) : null}
    </div>
  );
}
