import { z } from "zod";

export const PROJECT_SCHEMA_VERSION = "0.2.0" as const;

type IssuePath = Array<string | number>;
type TimeRange = { start: number; end: number };

function addCustomIssue(ctx: z.RefinementCtx, path: IssuePath, message: string) {
  ctx.addIssue({ code: "custom", path, message });
}

function validateTimelineRange(
  ctx: z.RefinementCtx,
  range: TimeRange,
  duration: number,
  path: IssuePath = [],
) {
  if (range.start < 0) {
    addCustomIssue(ctx, [...path, "start"], "start must be greater than or equal to 0");
  }

  if (range.end <= range.start) {
    addCustomIssue(ctx, [...path, "end"], "end must be greater than start");
  }

  if (range.end > duration) {
    addCustomIssue(ctx, [...path, "end"], "end must be within project duration");
  }
}

function validateUniqueIds<T extends { id: string }>(
  ctx: z.RefinementCtx,
  items: T[],
  path: IssuePath,
) {
  validateUniqueIdsWithPaths(
    ctx,
    items.map((item, index) => ({ item, path: [...path, index, "id"] })),
  );
}

function validateUniqueIdsWithPaths<T extends { id: string }>(
  ctx: z.RefinementCtx,
  entries: Array<{ item: T; path: IssuePath }>,
) {
  const seen = new Map<string, IssuePath>();

  entries.forEach(({ item, path }) => {
    const firstPath = seen.get(item.id);

    if (firstPath) {
      addCustomIssue(
        ctx,
        path,
        `duplicate id '${item.id}', first used at ${firstPath.join(".")}`,
      );
      return;
    }

    seen.set(item.id, path);
  });
}

export const AspectRatioSchema = z.enum(["16:9", "9:16", "1:1"]);

export const AssetTypeSchema = z.enum(["video", "image", "svg", "json", "trace"]);

export const AssetSourceSchema = z.enum(["local", "remote", "generated", "captured"]);

export const AssetSchema = z
  .object({
    id: z.string().min(1),
    type: AssetTypeSchema,
    uri: z.string().min(1),
    source: AssetSourceSchema,
    name: z.string().min(1).optional(),
    mimeType: z.string().min(1).optional(),
    duration: z.number().nonnegative().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    sizeBytes: z.number().nonnegative().optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const ClipSchema = z
  .object({
    id: z.string().min(1),
    assetId: z.string().min(1),
    start: z.number().nonnegative(),
    end: z.number().positive(),
    sourceStart: z.number().nonnegative().default(0),
    sourceEnd: z.number().positive().optional(),
    playbackRate: z.number().positive().default(1),
    name: z.string().min(1).optional(),
    muted: z.boolean().default(false),
    opacity: z.number().min(0).max(1).default(1),
    transform: z
      .object({
        x: z.number().default(0),
        y: z.number().default(0),
        scale: z.number().positive().default(1),
        rotation: z.number().default(0),
      })
      .strict()
      .default({ x: 0, y: 0, scale: 1, rotation: 0 }),
  })
  .strict();

export const TrackTypeSchema = z.enum(["video"]);

export const TrackSchema = z
  .object({
    id: z.string().min(1),
    type: TrackTypeSchema,
    name: z.string().min(1),
    locked: z.boolean().default(false),
    hidden: z.boolean().default(false),
    clips: z.array(ClipSchema).default([]),
  })
  .strict();

export const RectSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  })
  .strict();

export const ZoomKeyframePointSchema = z
  .object({
    time: z.number().nonnegative(),
    target: RectSchema,
  })
  .strict();

export const ManualZoomSchema = z
  .object({
    id: z.string().min(1),
    mode: z.literal("manual").default("manual"),
    start: z.number().nonnegative(),
    end: z.number().positive(),
    target: RectSchema,
    scale: z.number().positive(),
    easing: z.enum(["linear", "easeIn", "easeOut", "easeInOut"]).default("easeInOut"),
  })
  .strict();

export const AutoZoomSchema = z
  .object({
    id: z.string().min(1),
    mode: z.literal("auto"),
    start: z.number().nonnegative(),
    end: z.number().positive(),
    scale: z.number().positive(),
    keyframes: z.array(ZoomKeyframePointSchema).min(1),
    easing: z.enum(["linear", "easeIn", "easeOut", "easeInOut"]).default("easeInOut"),
  })
  .strict();

export const ZoomRegionSchema = z.discriminatedUnion("mode", [ManualZoomSchema, AutoZoomSchema]);

export const CursorEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      id: z.string().min(1).optional(),
      time: z.number().nonnegative(),
      type: z.literal("move"),
      x: z.number(),
      y: z.number(),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1).optional(),
      time: z.number().nonnegative(),
      type: z.literal("click"),
      x: z.number(),
      y: z.number(),
      label: z.string().optional(),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1).optional(),
      time: z.number().nonnegative(),
      type: z.literal("scroll"),
      x: z.number(),
      y: z.number(),
      deltaX: z.number().default(0),
      deltaY: z.number().default(0),
    })
    .strict(),
]);

export const AutoZoomOperationSchema = z
  .object({
    type: z.literal("auto_zoom"),
    start: z.number().nonnegative(),
    end: z.number().positive(),
    scale: z.number().positive(),
  })
  .strict();

export const AddZoomOperationSchema = z
  .object({
    type: z.literal("add_zoom"),
    start: z.number().nonnegative(),
    end: z.number().positive(),
    target: RectSchema,
    scale: z.number().positive(),
    easing: z.enum(["linear", "easeIn", "easeOut", "easeInOut"]).default("easeInOut"),
  })
  .strict();

export const TrimOperationSchema = z
  .object({
    type: z.literal("trim"),
    start: z.number().nonnegative(),
    end: z.number().positive(),
  })
  .strict();

export const SpeedValueSchema = z.union([
  z.literal(0.5),
  z.literal(1),
  z.literal(2),
  z.literal(4),
]);

export const SpeedOperationSchema = z
  .object({
    type: z.literal("speed"),
    start: z.number().nonnegative(),
    end: z.number().positive(),
    speed: SpeedValueSchema,
  })
  .strict();

export const RemoveZoomOperationSchema = z
  .object({
    type: z.literal("remove_zoom"),
    id: z.string().min(1),
  })
  .strict();

export const RemoveClipOperationSchema = z
  .object({
    type: z.literal("remove_clip"),
    id: z.string().min(1),
  })
  .strict();

export const AIEditOperationSchema = z.discriminatedUnion("type", [
  AutoZoomOperationSchema,
  AddZoomOperationSchema,
  TrimOperationSchema,
  SpeedOperationSchema,
  RemoveZoomOperationSchema,
  RemoveClipOperationSchema,
]);

export const AIEditSchema = z
  .object({
    id: z.string().min(1),
    createdAt: z.string().datetime(),
    prompt: z.string().min(1),
    targetRange: z
      .object({
        start: z.number().nonnegative(),
        end: z.number().positive(),
      })
      .strict()
      .optional(),
    operations: z.array(AIEditOperationSchema),
    status: z.enum(["proposed", "accepted", "rejected"]).default("proposed"),
  })
  .strict();

export const DemoProjectSchema = z
  .object({
    schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
    id: z.string().min(1),
    title: z.string().min(1),
    duration: z.number().positive(),
    fps: z.number().positive(),
    aspectRatio: AspectRatioSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    assets: z.array(AssetSchema),
    tracks: z.array(TrackSchema),
    zooms: z.array(ZoomRegionSchema).default([]),
    cursorEvents: z.array(CursorEventSchema).default([]),
    aiEditHistory: z.array(AIEditSchema).default([]),
    metadata: z
      .object({
        sourceRepoUrl: z.string().url().optional(),
        productUrl: z.string().url().optional(),
        prompt: z.string().optional(),
        notes: z.array(z.string()).default([]),
      })
      .strict()
      .default({ notes: [] }),
  })
  .strict()
  .superRefine((project, ctx) => {
    const assetIds = new Set(project.assets.map((asset) => asset.id));

    validateUniqueIds(ctx, project.assets, ["assets"]);
    validateUniqueIds(ctx, project.tracks, ["tracks"]);
    validateUniqueIds(ctx, project.zooms, ["zooms"]);
    validateUniqueIds(ctx, project.aiEditHistory, ["aiEditHistory"]);

    const clips = project.tracks.flatMap((track, trackIndex) =>
      track.clips.map((clip, clipIndex) => ({ clip, trackIndex, clipIndex })),
    );

    validateUniqueIdsWithPaths(
      ctx,
      clips.map(({ clip, trackIndex, clipIndex }) => ({
        item: clip,
        path: ["tracks", trackIndex, "clips", clipIndex, "id"],
      })),
    );

    clips.forEach(({ clip, trackIndex, clipIndex }) => {
      const path = ["tracks", trackIndex, "clips", clipIndex];

      validateTimelineRange(ctx, clip, project.duration, path);

      if (clip.sourceEnd !== undefined && clip.sourceEnd <= clip.sourceStart) {
        addCustomIssue(ctx, [...path, "sourceEnd"], "sourceEnd must be greater than sourceStart");
      }

      if (!assetIds.has(clip.assetId)) {
        addCustomIssue(ctx, [...path, "assetId"], `unknown assetId '${clip.assetId}'`);
      }
    });

    project.zooms.forEach((zoom, index) => {
      const path = ["zooms", index];
      validateTimelineRange(ctx, zoom, project.duration, path);

      if (zoom.mode === "auto") {
        zoom.keyframes.forEach((keyframe, keyframeIndex) => {
          if (keyframe.time < zoom.start || keyframe.time >= zoom.end) {
            addCustomIssue(
              ctx,
              [...path, "keyframes", keyframeIndex, "time"],
              "auto zoom keyframe time must be within [start, end)",
            );
          }
        });
      }
    });

    project.cursorEvents.forEach((event, index) => {
      if (event.time > project.duration) {
        addCustomIssue(ctx, ["cursorEvents", index, "time"], "time must be within project duration");
      }
    });

    project.aiEditHistory.forEach((edit, editIndex) => {
      if (edit.targetRange) {
        const path = ["aiEditHistory", editIndex, "targetRange"];
        validateTimelineRange(ctx, edit.targetRange, project.duration, path);
      }

      edit.operations.forEach((operation, operationIndex) => {
        if (operation.type === "remove_zoom" || operation.type === "remove_clip") {
          return;
        }

        const path = ["aiEditHistory", editIndex, "operations", operationIndex];
        validateTimelineRange(ctx, operation, project.duration, path);
      });
    });
  });

export function parseDemoProject(input: unknown) {
  return DemoProjectSchema.parse(input);
}

export function safeParseDemoProject(input: unknown) {
  return DemoProjectSchema.safeParse(input);
}
