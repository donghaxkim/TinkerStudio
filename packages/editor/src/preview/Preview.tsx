import { useEffect, useRef, type CSSProperties } from "react";
import type { DemoProject } from "@tinker/project-schema";
import { getActiveClip, getClipSourceTime, resolveBrowserPreviewAsset } from "../project/assetResolver.js";
import { buildPreviewMotionState } from "./previewMotionState.js";

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

type PreviewPlacement = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const OUTPUT_DIMENSIONS: Record<DemoProject["aspectRatio"], { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
};

function aspectRatioToCss(aspectRatio: DemoProject["aspectRatio"]) {
  if (aspectRatio === "9:16") return "9 / 16";
  if (aspectRatio === "1:1") return "1 / 1";
  return "16 / 9";
}

function sourceToPreviewPlacement(project: DemoProject, source: { width: number; height: number }): PreviewPlacement {
  const output = OUTPUT_DIMENSIONS[project.aspectRatio];
  const sourceWidth = Number.isFinite(source.width) && source.width > 0 ? source.width : output.width;
  const sourceHeight = Number.isFinite(source.height) && source.height > 0 ? source.height : output.height;
  const scale = Math.min(output.width / sourceWidth, output.height / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;

  return {
    left: ((output.width - width) / 2 / output.width) * 100,
    top: ((output.height - height) / 2 / output.height) * 100,
    width: (width / output.width) * 100,
    height: (height / output.height) * 100,
  };
}

function mapSourcePointToPreview(cx: number, cy: number, placement: PreviewPlacement) {
  return {
    left: placement.left + clamp(cx, 0, 1) * placement.width,
    top: placement.top + clamp(cy, 0, 1) * placement.height,
  };
}

function mapCameraToPreview(camera: ReturnType<typeof buildPreviewMotionState>["camera"], placement: PreviewPlacement) {
  const focus = mapSourcePointToPreview(camera.focus.cx, camera.focus.cy, placement);
  const scale = Number.isFinite(camera.scale) && camera.scale > 1 ? camera.scale : 1;
  const cropWidth = 100 / scale;
  const cropHeight = 100 / scale;
  const cropLeft = clamp(focus.left - cropWidth / 2, 0, 100 - cropWidth);
  const cropTop = clamp(focus.top - cropHeight / 2, 0, 100 - cropHeight);

  return {
    scale,
    left: -cropLeft * scale,
    top: -cropTop * scale,
    width: scale * 100,
    height: scale * 100,
  };
}

function percent(value: number) {
  return `${value}%`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function Preview({ project, currentTime }: PreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const primary = getActiveClip(project, currentTime);
  const clip = primary?.clip;
  const asset = primary?.asset;
  const previewAsset = asset ? resolveBrowserPreviewAsset(asset, "preview") : undefined;
  const motion = buildPreviewMotionState(project, currentTime);
  const placement = sourceToPreviewPlacement(project, motion.frame);
  const camera = mapCameraToPreview(motion.camera, placement);

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
        <div
          data-testid="preview-motion-layer"
          style={{
            position: "absolute",
            left: percent(camera.left),
            top: percent(camera.top),
            width: percent(camera.width),
            height: percent(camera.height),
            willChange: "left, top, width, height",
          }}
        >
          {previewAsset?.ok ? (
            <video
              ref={videoRef}
              data-testid="preview-video"
              src={previewAsset.url}
              muted
              controls
              style={{
                position: "absolute",
                left: percent(placement.left),
                top: percent(placement.top),
                width: percent(placement.width),
                height: percent(placement.height),
                objectFit: "contain",
              }}
            />
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

          {motion.cursor ? (
            (() => {
              const point = mapSourcePointToPreview(motion.cursor.cx, motion.cursor.cy, placement);

              return (
                <div
                  data-testid="active-cursor"
                  aria-label={`Cursor at ${Math.round(motion.cursor.x)}, ${Math.round(motion.cursor.y)}`}
                  style={{
                    position: "absolute",
                    left: percent(point.left),
                    top: percent(point.top),
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    border: motion.cursor.type === "click" ? "5px solid #facc15" : "3px solid white",
                    background: "rgba(15,23,42,0.5)",
                    transform: "translate(-50%, -50%)",
                  }}
                />
              );
            })()
          ) : null}

          {motion.clickEvents.map((event, index) => {
            const point = mapSourcePointToPreview(event.cx, event.cy, placement);

            return (
              <div
                key={`${event.time}-${index}`}
                data-testid="click-event"
                aria-label="Click indicator"
                style={{
                  position: "absolute",
                  left: percent(point.left),
                  top: percent(point.top),
                  width: 24,
                  height: 24,
                  borderRadius: 999,
                  background: "#facc15",
                  border: "3px solid rgba(17,24,39,0.85)",
                  boxShadow: "0 0 0 8px rgba(250,204,21,0.25)",
                  transform: "translate(-50%, -50%)",
                }}
              />
            );
          })}
        </div>
      </div>
      <div style={{ marginTop: 8, color: "#94a3b8" }}>
        Primary media: {asset?.name ?? asset?.id ?? "none"} {asset?.type ? `(${asset.type})` : ""}
      </div>
    </section>
  );
}
