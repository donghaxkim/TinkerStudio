import type { z } from "zod";
import type {
  AddZoomOperationSchema,
  AIEditOperationSchema,
  AIEditSchema,
  AssetSchema,
  AssetSourceSchema,
  AssetTypeSchema,
  ClipSchema,
  CursorEventSchema,
  DemoProjectSchema,
  RemoveEntityOperationSchema,
  TrackSchema,
  TrackTypeSchema,
  ZoomKeyframeSchema,
} from "./validators.js";

export type ProjectSchemaVersion = "0.1.0";
export type AssetType = z.infer<typeof AssetTypeSchema>;
export type AssetSource = z.infer<typeof AssetSourceSchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type Clip = z.infer<typeof ClipSchema>;
export type TrackType = z.infer<typeof TrackTypeSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type ZoomKeyframe = z.infer<typeof ZoomKeyframeSchema>;
export type CursorEvent = z.infer<typeof CursorEventSchema>;
export type AddZoomOperation = z.infer<typeof AddZoomOperationSchema>;
export type RemoveEntityOperation = z.infer<typeof RemoveEntityOperationSchema>;
export type AIEditOperation = z.infer<typeof AIEditOperationSchema>;
export type AIEdit = z.infer<typeof AIEditSchema>;
export type DemoProject = z.infer<typeof DemoProjectSchema>;
