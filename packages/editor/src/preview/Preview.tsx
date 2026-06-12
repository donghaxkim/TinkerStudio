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
  borderRadius: "var(--tk-radius-lg, 11px)",
  border: "1px solid var(--tk-border, rgba(20,20,15,0.12))",
  background: "var(--tk-preview-bg, #10192C)",
  color: "white",
  boxShadow: "var(--tk-shadow-md, 0 10px 28px rgba(20,20,15,0.09))",
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
            <div
              data-testid="missing-asset-placeholder"
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                padding: 24,
                textAlign: "center",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 40,
                    marginBottom: 12,
                    color: "rgba(255,255,255,0.25)",
                  }}
                >
                  ▣
                </div>
                <strong style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 600 }}>
                  Preview placeholder
                </strong>
                <p
                  style={{
                    color: "rgba(255,255,255,0.45)",
                    fontSize: 12,
                    marginTop: 6,
                    lineHeight: 1.5,
                  }}
                >
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
                    border:
                      motion.cursor.type === "click"
                        ? `5px solid var(--tk-accent, #3B5BD9)`
                        : "3px solid rgba(255,255,255,0.90)",
                    background: "rgba(16,25,44,0.45)",
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
                  background: "var(--tk-accent, #3B5BD9)",
                  border: "3px solid rgba(16,25,44,0.70)",
                  boxShadow: "0 0 0 8px var(--tk-accent-soft, rgba(59,91,217,0.25))",
                  transform: "translate(-50%, -50%)",
                }}
              />
            );
          })}
        </div>
      </div>
      <div
        style={{
          marginTop: 8,
          color: "var(--tk-text-ter, #9D9B94)",
          fontSize: 11,
          fontFamily: "var(--tk-mono, 'IBM Plex Mono', ui-monospace, monospace)",
        }}
      >
        Primary media: {asset?.name ?? asset?.id ?? "none"} {asset?.type ? `(${asset.type})` : ""}
      </div>
    </section>
  );
}
