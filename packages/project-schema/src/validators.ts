import { z } from "zod";

export const PROJECT_SCHEMA_VERSION = "0.1.0" as const;

type IssuePath = Array<string | number>;
type TimeRange = { start: number; end: number };

function addCustomIssue(ctx: z.RefinementCtx, path: IssuePath, message: string) {
  ctx.addIssue({ code: "custom", path, message });
}

function validateOrderedRange(ctx: z.RefinementCtx, range: TimeRange, path: IssuePath = []) {
  if (range.end <= range.start) {
    addCustomIssue(ctx, [...path, "end"], "end must be greater than start");
  }
}

function validateRangeWithinDuration(
  ctx: z.RefinementCtx,
  range: TimeRange,
  duration: number,
  path: IssuePath = [],
) {
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

export const AssetTypeSchema = z.enum([
  "video",
  "image",
  "svg",
  "json",
  "trace",
]);

export const AssetSourceSchema = z.enum(["local", "remote", "generated", "captured"]);

export const AssetSchema = z.object({
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
});

export const ClipSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  start: z.number().nonnegative(),
  end: z.number().positive(),
  sourceStart: z.number().nonnegative().default(0),
  sourceEnd: z.number().positive().optional(),
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
    .default({ x: 0, y: 0, scale: 1, rotation: 0 }),
});

export const TrackTypeSchema = z.enum(["video", "overlay"]);

export const TrackSchema = z.object({
  id: z.string().min(1),
  type: TrackTypeSchema,
  name: z.string().min(1),
  locked: z.boolean().default(false),
  hidden: z.boolean().default(false),
  clips: z.array(ClipSchema).default([]),
});

export const RectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const ZoomKeyframeSchema = z.object({
  id: z.string().min(1),
  start: z.number().nonnegative(),
  end: z.number().positive(),
  target: RectSchema,
  scale: z.number().positive().optional(),
  easing: z.enum(["linear", "easeIn", "easeOut", "easeInOut"]).default("easeInOut"),
});

export const CursorEventSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().min(1).optional(),
    time: z.number().nonnegative(),
    type: z.literal("move"),
    x: z.number(),
    y: z.number(),
  }),
  z.object({
    id: z.string().min(1).optional(),
    time: z.number().nonnegative(),
    type: z.literal("click"),
    x: z.number(),
    y: z.number(),
    label: z.string().optional(),
  }),
  z.object({
    id: z.string().min(1).optional(),
    time: z.number().nonnegative(),
    type: z.literal("scroll"),
    x: z.number(),
    y: z.number(),
    deltaX: z.number().default(0),
    deltaY: z.number().default(0),
  }),
]);

export const AddZoomOperationSchema = z.object({
  type: z.literal("add_zoom"),
  start: z.number().nonnegative(),
  end: z.number().positive(),
  target: RectSchema,
  easing: z.enum(["linear", "easeIn", "easeOut", "easeInOut"]).default("easeInOut"),
});

export const RemoveEntityOperationSchema = z.object({
  type: z.literal("remove_entity"),
  entityType: z.enum(["zoom", "clip"]),
  id: z.string().min(1),
});

export const AIEditOperationSchema = z.discriminatedUnion("type", [
  AddZoomOperationSchema,
  RemoveEntityOperationSchema,
]);

export const AIEditSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  prompt: z.string().min(1),
  targetRange: z
    .object({
      start: z.number().nonnegative(),
      end: z.number().positive(),
    })
    .optional(),
  operations: z.array(AIEditOperationSchema),
  status: z.enum(["proposed", "accepted", "rejected"]).default("proposed"),
});

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
    zooms: z.array(ZoomKeyframeSchema).default([]),
    cursorEvents: z.array(CursorEventSchema).default([]),
    aiEditHistory: z.array(AIEditSchema).default([]),
    metadata: z
      .object({
        sourceRepoUrl: z.string().url().optional(),
        productUrl: z.string().url().optional(),
        prompt: z.string().optional(),
        notes: z.array(z.string()).default([]),
      })
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

      validateOrderedRange(ctx, clip, path);
      validateRangeWithinDuration(ctx, clip, project.duration, path);

      if (clip.sourceEnd !== undefined && clip.sourceEnd <= clip.sourceStart) {
        addCustomIssue(ctx, [...path, "sourceEnd"], "sourceEnd must be greater than sourceStart");
      }

      if (!assetIds.has(clip.assetId)) {
        addCustomIssue(ctx, [...path, "assetId"], `unknown assetId '${clip.assetId}'`);
      }
    });

    project.zooms.forEach((zoom, index) => {
      const path = ["zooms", index];
      validateOrderedRange(ctx, zoom, path);
      validateRangeWithinDuration(ctx, zoom, project.duration, path);
    });

    project.cursorEvents.forEach((event, index) => {
      if (event.time > project.duration) {
        addCustomIssue(ctx, ["cursorEvents", index, "time"], "time must be within project duration");
      }
    });

    project.aiEditHistory.forEach((edit, editIndex) => {
      if (edit.targetRange) {
        const path = ["aiEditHistory", editIndex, "targetRange"];
        validateOrderedRange(ctx, edit.targetRange, path);
        validateRangeWithinDuration(ctx, edit.targetRange, project.duration, path);
      }

      edit.operations.forEach((operation, operationIndex) => {
        if (operation.type === "remove_entity") {
          return;
        }

        const path = ["aiEditHistory", editIndex, "operations", operationIndex];
        validateOrderedRange(ctx, operation, path);
        validateRangeWithinDuration(ctx, operation, project.duration, path);
      });
    });
  });

export function parseDemoProject(input: unknown) {
  return DemoProjectSchema.parse(input);
}

export function safeParseDemoProject(input: unknown) {
  return DemoProjectSchema.safeParse(input);
}
