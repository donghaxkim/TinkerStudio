import { useEffect, useRef, type CSSProperties } from "react";
import type { DemoProject } from "@tinker/project-schema";
import { getActiveClip, getClipSourceTime, isBrowserRenderableMedia } from "../project/assetResolver.js";
import { getActivePreviewOverlays } from "./activeOverlays.js";

export type PreviewProps = {
  project: DemoProject;
  currentTime: number;
};

const stageStyle: CSSProperties = {
  position: "relative",
  aspectRatio: "16 / 9",
  width: "100%",
  minHeight: 320,
  overflow: "hidden",
  borderRadius: 16,
  border: "1px solid #334155",
  background: "radial-gradient(circle at 50% 30%, #1e3a8a 0%, #0f172a 55%, #020617 100%)",
  color: "white",
};

function aspectRatioToCss(aspectRatio: DemoProject["aspectRatio"]) {
  if (aspectRatio === "9:16") return "9 / 16";
  if (aspectRatio === "1:1") return "1 / 1";
  return "16 / 9";
}

export function Preview({ project, currentTime }: PreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const primary = getActiveClip(project, currentTime);
  const clip = primary?.clip;
  const asset = primary?.asset;
  const overlays = getActivePreviewOverlays(project, currentTime);

  useEffect(() => {
    if (!clip || !videoRef.current) {
      return;
    }

    const nextTime = getClipSourceTime(clip, currentTime);

    if (Math.abs(videoRef.current.currentTime - nextTime) > 0.15) {
      videoRef.current.currentTime = nextTime;
    }
  }, [clip, currentTime]);

  return (
    <section aria-label="Preview">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Preview</h2>
        <output aria-label="Current preview time">{currentTime.toFixed(1)}s</output>
      </div>
      <div data-testid="preview-stage" style={{ ...stageStyle, aspectRatio: aspectRatioToCss(project.aspectRatio) }}>
        {asset && isBrowserRenderableMedia(asset) && asset.type === "video" ? (
          <video ref={videoRef} data-testid="preview-video" src={asset.uri} muted controls style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div data-testid="missing-asset-placeholder" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
            <div>
              <div style={{ fontSize: 48, marginBottom: 12 }}>▣</div>
              <strong>Preview placeholder</strong>
              <p style={{ color: "#cbd5e1" }}>
                {asset
                  ? `Sample asset '${asset.name ?? asset.id}' is referenced at ${asset.uri}, but no browser-resolvable media is available.`
                  : "No media asset is available for the active clip."}
              </p>
            </div>
          </div>
        )}

        {overlays.zooms.map((zoom) => (
          <div
            key={zoom.id}
            data-testid="active-zoom"
            aria-label={`Active zoom ${zoom.id}`}
            style={{
              position: "absolute",
              left: "24%",
              top: "22%",
              width: "38%",
              height: "32%",
              border: "3px solid #c084fc",
              boxShadow: "0 0 0 9999px rgba(2,6,23,0.28)",
              borderRadius: 14,
            }}
          >
            <span style={{ position: "absolute", left: 8, top: 8, padding: "2px 8px", borderRadius: 999, background: "#581c87" }}>
              Zoom {zoom.target.width}×{zoom.target.height}
            </span>
          </div>
        ))}

        {overlays.callouts.map((callout) => (
          <div
            key={callout.id}
            data-testid="active-callout"
            style={{
              position: "absolute",
              top: callout.position.includes("top") ? 24 : undefined,
              right: callout.position.includes("right") ? 24 : undefined,
              bottom: callout.position.includes("bottom") ? 24 : undefined,
              left: callout.position.includes("left") ? 24 : callout.position === "center" ? "50%" : undefined,
              transform: callout.position === "center" ? "translate(-50%, -50%)" : undefined,
              padding: "10px 14px",
              borderRadius: 12,
              background: "#f97316",
              color: "#111827",
              fontWeight: 800,
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
            }}
          >
            {callout.text}
          </div>
        ))}

        {overlays.latestCursor ? (
          <div
            data-testid="active-cursor"
            aria-label={`Cursor at ${overlays.latestCursor.x}, ${overlays.latestCursor.y}`}
            style={{
              position: "absolute",
              left: `${Math.min(95, Math.max(0, overlays.latestCursor.x / 19.2))}%`,
              top: `${Math.min(95, Math.max(0, overlays.latestCursor.y / 10.8))}%`,
              width: 18,
              height: 18,
              borderRadius: 999,
              border: overlays.latestCursor.type === "click" ? "5px solid #facc15" : "3px solid white",
              background: "rgba(15,23,42,0.5)",
            }}
          />
        ) : null}

        {overlays.cursorEvents.map((event, index) =>
          event.type === "click" ? (
            <div
              key={`${event.time}-${index}`}
              data-testid="click-event"
              style={{
                position: "absolute",
                left: `${Math.min(95, Math.max(0, event.x / 19.2))}%`,
                top: `${Math.min(95, Math.max(0, event.y / 10.8))}%`,
                padding: "4px 8px",
                borderRadius: 999,
                background: "#facc15",
                color: "#111827",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {event.label ?? "Click"}
            </div>
          ) : null,
        )}

        <div style={{ position: "absolute", left: 0, right: 0, bottom: 24, display: "grid", placeItems: "center", gap: 8 }}>
          {overlays.captions.map((caption) => (
            <div key={caption.id} data-testid="active-caption" style={{ maxWidth: "80%", padding: "8px 14px", borderRadius: 12, background: "rgba(15,23,42,0.84)", fontSize: 22, fontWeight: 700, textAlign: "center" }}>
              {caption.text}
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 8, color: "#94a3b8" }}>
        Primary media: {asset?.name ?? asset?.id ?? "none"} {asset?.type ? `(${asset.type})` : ""}
      </div>
    </section>
  );
}
