import { DemoProjectSchema, type DemoProject } from "@tinker/project-schema";

export type RenderDimensions = {
  width: number;
  height: number;
};

export type RenderOutput = RenderDimensions & {
  fileName: string;
  mimeType: "video/mp4";
};

export type RenderTimeline = {
  duration: number;
  fps: number;
};

export type RenderLayerKind = "video" | "zoom" | "cursor";

export type BaseRenderLayer = {
  id: string;
  kind: RenderLayerKind;
  start: number;
  end: number;
  label: string;
};

export type MediaRenderLayer = BaseRenderLayer & {
  kind: "video";
  trackId: string;
  assetId: string;
  sourceStart: number;
  sourceEnd?: number;
};

export type ZoomRenderLayer = BaseRenderLayer & {
  kind: "zoom";
  target: { x: number; y: number; width: number; height: number };
};

export type CursorRenderLayer = BaseRenderLayer & {
  kind: "cursor";
  x: number;
  y: number;
  eventType: "move" | "click" | "scroll";
};

export type RenderLayer = MediaRenderLayer | ZoomRenderLayer | CursorRenderLayer;

export type FinalRenderPlan = {
  projectId: string;
  projectTitle: string;
  source: RenderDimensions;
  output: RenderOutput;
  timeline: RenderTimeline;
  layers: RenderLayer[];
};

export type BuildFinalRenderPlanOptions = {
  fileName?: string;
};

const ASPECT_RATIO_DIMENSIONS: Record<DemoProject["aspectRatio"], RenderDimensions> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
};

export function buildFinalRenderPlan(projectInput: DemoProject, options: BuildFinalRenderPlanOptions = {}): FinalRenderPlan {
  const project = DemoProjectSchema.parse(projectInput);
  const fileName = options.fileName ?? `${slugify(project.title)}.mp4`;
  const output = ASPECT_RATIO_DIMENSIONS[project.aspectRatio];

  if (!fileName.toLowerCase().endsWith(".mp4")) {
    throw new Error("Export v0 only writes MP4 artifacts; output fileName must end in .mp4");
  }

  return {
    projectId: project.id,
    projectTitle: project.title,
    source: inferSourceDimensions(project, output),
    output: {
      ...output,
      fileName,
      mimeType: "video/mp4",
    },
    timeline: {
      duration: project.duration,
      fps: project.fps,
    },
    layers: buildLayers(project),
  };
}

function inferSourceDimensions(project: DemoProject, fallback: RenderDimensions): RenderDimensions {
  const sourceAsset = project.assets.find(
    (asset) => (asset.type === "video" || asset.type === "image") && asset.width && asset.height,
  );

  return sourceAsset?.width && sourceAsset.height
    ? { width: sourceAsset.width, height: sourceAsset.height }
    : fallback;
}

function buildLayers(project: DemoProject): RenderLayer[] {
  const mediaLayers = project.tracks.flatMap((track) =>
    track.clips.map<MediaRenderLayer>((clip) => ({
      id: clip.id,
      kind: "video",
      trackId: track.id,
      assetId: clip.assetId,
      start: clip.start,
      end: clip.end,
      sourceStart: clip.sourceStart,
      sourceEnd: clip.sourceEnd,
      label: clip.name ?? track.name,
    })),
  );

  const zooms = project.zooms.map<ZoomRenderLayer>((zoom) => ({
    id: zoom.id,
    kind: "zoom",
    start: zoom.start,
    end: zoom.end,
    label: "Zoom target",
    target: zoom.target,
  }));

  const cursorEvents = project.cursorEvents.map<CursorRenderLayer>((event, index) => ({
    id: event.id ?? `cursor_${index + 1}`,
    kind: "cursor",
    start: event.time,
    end: Math.min(project.duration, event.time + 0.5),
    label: event.type === "click" ? (event.label ?? "Click") : event.type,
    x: event.x,
    y: event.y,
    eventType: event.type,
  }));

  return [...mediaLayers, ...zooms, ...cursorEvents].sort((left, right) => {
    if (left.start !== right.start) return left.start - right.start;
    return left.kind.localeCompare(right.kind);
  });
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "demo-project-export";
}
