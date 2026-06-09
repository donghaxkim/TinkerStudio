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

export type RenderLayerKind = "video" | "audio" | "caption" | "zoom" | "callout" | "cursor";

export type BaseRenderLayer = {
  id: string;
  kind: RenderLayerKind;
  start: number;
  end: number;
  label: string;
};

export type MediaRenderLayer = BaseRenderLayer & {
  kind: "video" | "audio";
  trackId: string;
  assetId: string;
  sourceStart: number;
  sourceEnd?: number;
};

export type TextRenderLayer = BaseRenderLayer & {
  kind: "caption" | "callout";
  text: string;
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

export type RenderLayer = MediaRenderLayer | TextRenderLayer | ZoomRenderLayer | CursorRenderLayer;

export type FinalRenderPlan = {
  projectId: string;
  projectTitle: string;
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

  if (!fileName.toLowerCase().endsWith(".mp4")) {
    throw new Error("Export v0 only writes MP4 artifacts; output fileName must end in .mp4");
  }

  return {
    projectId: project.id,
    projectTitle: project.title,
    output: {
      ...ASPECT_RATIO_DIMENSIONS[project.aspectRatio],
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

function buildLayers(project: DemoProject): RenderLayer[] {
  const mediaLayers = project.tracks.flatMap((track) =>
    track.clips.map<MediaRenderLayer>((clip) => ({
      id: clip.id,
      kind: track.type === "audio" ? "audio" : "video",
      trackId: track.id,
      assetId: clip.assetId,
      start: clip.start,
      end: clip.end,
      sourceStart: clip.sourceStart,
      sourceEnd: clip.sourceEnd,
      label: clip.name ?? track.name,
    })),
  );

  const captions = project.captions.map<TextRenderLayer>((caption) => ({
    id: caption.id,
    kind: "caption",
    start: caption.start,
    end: caption.end,
    label: "Caption",
    text: caption.text,
  }));

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

  const callouts = project.callouts.map<TextRenderLayer>((callout) => ({
    id: callout.id,
    kind: "callout",
    start: callout.start,
    end: callout.end,
    label: "Callout",
    text: callout.text,
  }));

  return [...mediaLayers, ...captions, ...zooms, ...cursorEvents, ...callouts].sort((left, right) => {
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
