import { useEffect, useRef, useState, type CSSProperties } from "react";
import { readCompositionTimeline, type CompositionTimelineModel } from "./compositionTimelineModel.js";
import {
  waitForCompositionTimeline,
  type CompositionTimelineHandle,
  type TimelineRegistryWindow,
} from "./compositionWindow.js";

export type CompositionPreviewProps = {
  /** URL of the composition-index artifact (the index.html). */
  src: string;
  /** The composition id (matches data-composition-id / window.__timelines key). Omit to use the sole registered timeline. */
  compositionId?: string;
  /** Playhead time in seconds; the preview seeks the timeline to it. */
  currentTime?: number;
  /** Called once the timeline is read, with its structured model and live handle. */
  onReady?: (model: CompositionTimelineModel, handle: CompositionTimelineHandle) => void;
  /** Called if the timeline can't be read before the timeout. */
  onError?: (error: Error) => void;
  /** Rendered-video URL (output-video artifact) shown if the timeline is unavailable. */
  fallbackVideoSrc?: string;
  /** Max time to wait for the timeline to register. Default 4000ms. */
  timeoutMs?: number;
  /** Test seam: resolve the iframe's content window. Default: iframe.contentWindow. */
  resolveWindow?: (iframe: HTMLIFrameElement) => TimelineRegistryWindow | null | undefined;
};

type Status = "loading" | "ready" | "error";

const fillStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  border: "none",
  display: "block",
  background: "var(--tk-preview-bg, #26251F)",
};

function defaultResolveWindow(iframe: HTMLIFrameElement): TimelineRegistryWindow | null | undefined {
  return iframe.contentWindow as unknown as TimelineRegistryWindow | null;
}

export function CompositionPreview({
  src,
  compositionId,
  currentTime = 0,
  onReady,
  onError,
  fallbackVideoSrc,
  timeoutMs,
  resolveWindow = defaultResolveWindow,
}: CompositionPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const handleRef = useRef<CompositionTimelineHandle | undefined>(undefined);
  const waitAbortRef = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => () => waitAbortRef.current?.abort(), []);

  // Re-initialize when the composition identity changes, so a new src/id can load
  // and an earlier error state does not stick forever.
  useEffect(() => {
    setStatus("loading");
    handleRef.current = undefined;
  }, [src, compositionId]);

  function handleLoad() {
    const iframe = iframeRef.current;
    if (!iframe) return;
    waitAbortRef.current?.abort();
    const controller = new AbortController();
    waitAbortRef.current = controller;

    waitForCompositionTimeline(() => resolveWindow(iframe), compositionId, { timeoutMs, signal: controller.signal })
      .then((handle) => {
        if (controller.signal.aborted) return;
        handleRef.current = handle;
        handle.pause();
        setStatus("ready");
        onReady?.(readCompositionTimeline(handle), handle);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setStatus("error");
        onError?.(error instanceof Error ? error : new Error(String(error)));
      });
  }

  useEffect(() => {
    if (status === "ready") {
      handleRef.current?.seek(currentTime);
    }
  }, [currentTime, status]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {status !== "error" ? (
        <iframe
          key={`${src}::${compositionId ?? "sole"}`}
          ref={iframeRef}
          data-testid="composition-frame"
          title="Composition preview"
          src={src}
          onLoad={handleLoad}
          sandbox="allow-scripts allow-same-origin"
          style={fillStyle}
        />
      ) : fallbackVideoSrc ? (
        <video data-testid="composition-fallback-video" src={fallbackVideoSrc} controls style={fillStyle} />
      ) : (
        <div
          data-testid="composition-error"
          role="alert"
          style={{ ...fillStyle, display: "grid", placeItems: "center", color: "white", fontFamily: "var(--tk-font)" }}
        >
          Preview unavailable.
        </div>
      )}
    </div>
  );
}
