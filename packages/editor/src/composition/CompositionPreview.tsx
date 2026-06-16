import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  readCompositionTimeline,
  readSceneClipsFromDocument,
  type CompositionTimelineModel,
} from "./compositionTimelineModel.js";
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
  /** CSS aspect ratio for the preview frame. Default: 16 / 9. */
  aspectRatio?: string;
  /** Max time to wait for the timeline to register. Default 4000ms. */
  timeoutMs?: number;
  /** Called whenever a new composition starts loading. */
  onLoading?: () => void;
  /** Test seam: resolve the iframe's content window. Default: iframe.contentWindow. */
  resolveWindow?: (iframe: HTMLIFrameElement) => TimelineRegistryWindow | null | undefined;
  /** Test seam: resolve the iframe's content document (for DOM scene fallback). Default: iframe.contentDocument. */
  resolveDocument?: (iframe: HTMLIFrameElement) => Document | null | undefined;
};

type Status = "loading" | "ready" | "error";

const shellStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "grid",
  placeItems: "center",
  padding: "clamp(10px, 2vw, 22px)",
  background: "transparent",
};

const frameStyle: CSSProperties = {
  position: "relative",
  borderRadius: "var(--tk-radius-lg, 11px)",
  overflow: "hidden",
  background: "#050609",
  boxShadow: "0 18px 54px rgba(0,0,0,0.22)",
};

/** Fit the frame to the stage along its long axis so portrait ratios don't overflow. */
function frameSizing(ratio: string): CSSProperties {
  const [w, h] = ratio.split("/").map((part) => Number.parseFloat(part));
  const portrait = Number.isFinite(w) && Number.isFinite(h) && (w as number) < (h as number);
  return portrait
    ? { height: "100%", width: "auto", maxWidth: "100%", maxHeight: "100%" }
    : { width: "100%", height: "auto", maxWidth: "100%", maxHeight: "100%" };
}

const fillStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  border: "none",
  display: "block",
  background: "#050609",
};

const statusStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  padding: 20,
  background: "#050609",
  color: "rgba(255,255,255,0.64)",
  fontFamily: "var(--tk-font)",
  fontSize: 13,
  textAlign: "center",
};

const playerControlsStyle: CSSProperties = {
  position: "absolute",
  right: 10,
  bottom: 10,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  zIndex: 2,
};

const playerControlButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 30,
  height: 30,
  padding: 0,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(10,12,16,0.56)",
  color: "rgba(255,255,255,0.86)",
  cursor: "pointer",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
};

/** Aspect ratios the player cycles through, starting from the supplied default. */
const ASPECT_RATIOS = ["16 / 9", "9 / 16", "1 / 1"] as const;

function AspectRatioIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 10v4M17 10v4" />
    </svg>
  );
}

function FullscreenIcon({ active }: { active: boolean }) {
  return active ? (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4v3a2 2 0 0 1-2 2H4M20 9h-3a2 2 0 0 1-2-2V4M15 20v-3a2 2 0 0 1 2-2h3M4 15h3a2 2 0 0 1 2 2v3" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 0-1 1h-4" />
    </svg>
  );
}

function defaultResolveWindow(iframe: HTMLIFrameElement): TimelineRegistryWindow | null | undefined {
  return iframe.contentWindow as unknown as TimelineRegistryWindow | null;
}

/**
 * Read the timeline model, falling back to DOM scene sections when the master timeline
 * is flat (no nested clips). A flat GSAP timeline — the real pipeline's shape — reports
 * the right total duration but zero children; the `<section class="scene">` markers carry
 * the segmentation, so we surface those as clips. The timeline always wins when it has
 * nested clips, so this is purely additive.
 */
function readModelWithSceneFallback(
  handle: CompositionTimelineHandle,
  getDocument: () => Document | null | undefined,
  compositionId?: string,
): CompositionTimelineModel {
  const model = readCompositionTimeline(handle);
  if (model.clips.length > 0) return model;
  const doc = getDocument();
  if (!doc) return model;
  const clips = readSceneClipsFromDocument(doc, compositionId);
  if (clips.length === 0) return model;
  const contentEnd = clips.reduce((max, clip) => Math.max(max, clip.end), 0);
  return { ...model, clips, durationSeconds: Math.max(model.durationSeconds, contentEnd) };
}

export function CompositionPreview({
  src,
  compositionId,
  currentTime = 0,
  onReady,
  onError,
  fallbackVideoSrc,
  aspectRatio = "16 / 9",
  timeoutMs,
  onLoading,
  resolveWindow = defaultResolveWindow,
  resolveDocument = (iframe) => iframe.contentDocument,
}: CompositionPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<CompositionTimelineHandle | undefined>(undefined);
  const waitAbortRef = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [ratio, setRatio] = useState(aspectRatio);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => () => waitAbortRef.current?.abort(), []);

  // Reflect the browser's fullscreen state so the toggle icon stays in sync (Esc, etc.).
  useEffect(() => {
    const doc = frameRef.current?.ownerDocument ?? (typeof document !== "undefined" ? document : undefined);
    if (!doc) return;
    const sync = () => setIsFullscreen(doc.fullscreenElement === frameRef.current);
    doc.addEventListener("fullscreenchange", sync);
    return () => doc.removeEventListener("fullscreenchange", sync);
  }, []);

  function cycleRatio() {
    setRatio((current) => {
      const index = (ASPECT_RATIOS as readonly string[]).indexOf(current);
      return ASPECT_RATIOS[(index + 1) % ASPECT_RATIOS.length]!;
    });
  }

  function toggleFullscreen() {
    const el = frameRef.current;
    if (!el) return;
    const doc = el.ownerDocument;
    if (doc.fullscreenElement) {
      void doc.exitFullscreen?.();
    } else {
      void el.requestFullscreen?.();
    }
  }

  // Re-initialize when the composition identity changes, so a new src/id can load
  // and an earlier error state does not stick forever.
  useEffect(() => {
    setStatus("loading");
    handleRef.current = undefined;
    onLoading?.();
  }, [src, compositionId, onLoading]);

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
        onReady?.(readModelWithSceneFallback(handle, () => resolveDocument(iframe), compositionId), handle);
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
    <div style={shellStyle}>
      <div ref={frameRef} data-testid="composition-frame-box" style={{ ...frameStyle, ...frameSizing(ratio), aspectRatio: ratio }}>
      {status !== "error" ? (
        <div style={playerControlsStyle}>
          <button
            type="button"
            style={playerControlButtonStyle}
            aria-label="Change aspect ratio"
            title={`Aspect ratio: ${ratio.replace(/\s/g, "")}`}
            onClick={cycleRatio}
          >
            <AspectRatioIcon />
          </button>
          <button
            type="button"
            style={playerControlButtonStyle}
            aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
            title={isFullscreen ? "Exit full screen" : "Full screen"}
            onClick={toggleFullscreen}
          >
            <FullscreenIcon active={isFullscreen} />
          </button>
        </div>
      ) : null}
      {status !== "error" ? (
        <>
          <iframe
            key={`${src}::${compositionId ?? "sole"}`}
            ref={iframeRef}
            data-testid="composition-frame"
            title="Composition preview"
            src={src}
            onLoad={handleLoad}
            sandbox="allow-scripts allow-same-origin"
            style={{ ...fillStyle, opacity: status === "ready" ? 1 : 0 }}
          />
          {status === "loading" ? (
            <div data-testid="composition-loading" role="status" style={statusStyle}>
              Loading editable preview
            </div>
          ) : null}
        </>
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
    </div>
  );
}
