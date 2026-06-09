import type { z } from "zod";
import type {
  AddZoomOperationSchema,
  AIEditOperationSchema,
  AIEditSchema,
  AssetSchema,
  AssetSourceSchema,
  AssetTypeSchema,
  AutoZoomOperationSchema,
  AutoZoomSchema,
  ClipSchema,
  CursorEventSchema,
  DemoProjectSchema,
  ManualZoomSchema,
  RectSchema,
  RemoveClipOperationSchema,
  RemoveZoomOperationSchema,
  SpeedOperationSchema,
  SpeedValueSchema,
  TrackSchema,
  TrackTypeSchema,
  TrimOperationSchema,
  ZoomKeyframePointSchema,
  ZoomRegionSchema,
} from "./validators.js";

export type ProjectSchemaVersion = "0.2.0";
export type AssetType = z.infer<typeof AssetTypeSchema>;
export type AssetSource = z.infer<typeof AssetSourceSchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type Clip = z.infer<typeof ClipSchema>;
export type TrackType = z.infer<typeof TrackTypeSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type Rect = z.infer<typeof RectSchema>;
export type ZoomKeyframePoint = z.infer<typeof ZoomKeyframePointSchema>;
export type ManualZoom = z.infer<typeof ManualZoomSchema>;
export type AutoZoom = z.infer<typeof AutoZoomSchema>;
export type ZoomRegion = z.infer<typeof ZoomRegionSchema>;
export type CursorEvent = z.infer<typeof CursorEventSchema>;
export type AutoZoomOperation = z.input<typeof AutoZoomOperationSchema>;
export type AddZoomOperation = z.input<typeof AddZoomOperationSchema>;
export type TrimOperation = z.input<typeof TrimOperationSchema>;
export type SpeedValue = z.infer<typeof SpeedValueSchema>;
export type SpeedOperation = z.input<typeof SpeedOperationSchema>;
export type RemoveZoomOperation = z.input<typeof RemoveZoomOperationSchema>;
export type RemoveClipOperation = z.input<typeof RemoveClipOperationSchema>;
export type AIEditOperation = z.input<typeof AIEditOperationSchema>;
export type AIEdit = z.infer<typeof AIEditSchema>;
export type DemoProject = z.infer<typeof DemoProjectSchema>;
