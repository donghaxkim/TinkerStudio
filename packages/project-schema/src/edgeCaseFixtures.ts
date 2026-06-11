import type { DemoProject } from "./types.js";

export type EdgeCaseFixture = {
  id: string;
  description: string;
  project: DemoProject;
  exportable: boolean;
  expectedFailure?: "schema" | "asset_resolution";
};

const baseTimestamp = "2026-06-08T00:00:00.000Z";
const baseAsset = {
  id: "asset_capture_001",
  type: "video" as const,
  uri: "assets/capture-001.mp4",
  source: "captured" as const,
  name: "Primary browser capture",
  mimeType: "video/mp4",
  duration: 45,
  width: 1920,
  height: 1080,
  metadata: {},
};

const baseClip = {
  id: "clip_capture_001",
  assetId: "asset_capture_001",
  start: 0,
  end: 45,
  sourceStart: 0,
  sourceEnd: 45,
  name: "Browser flow",
  muted: false,
  opacity: 1,
  transform: { x: 0, y: 0, scale: 1, rotation: 0 },
};

function projectWith(overrides: Partial<DemoProject>): DemoProject {
  return {
    schemaVersion: "0.1.0",
    id: "edge_case_base",
    title: "Edge Case Demo",
    duration: 45,
    fps: 30,
    aspectRatio: "16:9",
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp,
    assets: [baseAsset],
    tracks: [
      {
        id: "track_video_main",
        type: "video",
        name: "Main capture",
        locked: false,
        hidden: false,
        clips: [baseClip],
      },
    ],
    zooms: [],
    cursorEvents: [],
    aiEditHistory: [],
    metadata: { notes: [] },
    ...overrides,
  };
}

function fixture(fixtureInput: EdgeCaseFixture): EdgeCaseFixture {
  return fixtureInput;
}

export const EDGE_CASE_DEMO_PROJECT_FIXTURES: EdgeCaseFixture[] = [
  fixture({
    id: "empty_tracks",
    description: "Schema-valid project with no tracks or clips.",
    project: projectWith({ id: "edge_empty_tracks", title: "Empty Tracks", tracks: [] }),
    exportable: true,
  }),
  fixture({
    id: "one_valid_video_clip",
    description: "Minimal valid project with one captured video clip.",
    project: projectWith({ id: "edge_one_valid_video_clip", title: "One Valid Video Clip" }),
    exportable: true,
  }),
  fixture({
    id: "multiple_clips_with_gap",
    description: "Two clips on the same track with a timeline gap between them.",
    project: projectWith({
      id: "edge_multiple_clips_with_gap",
      title: "Multiple Clips With Gap",
      tracks: [
        {
          id: "track_video_main",
          type: "video",
          name: "Main capture",
          locked: false,
          hidden: false,
          clips: [
            { ...baseClip, id: "clip_gap_first", start: 0, end: 5, sourceStart: 0, sourceEnd: 5 },
            { ...baseClip, id: "clip_gap_second", start: 8, end: 14, sourceStart: 8, sourceEnd: 14 },
          ],
        },
      ],
    }),
    exportable: true,
  }),
  fixture({
    id: "trimmed_clip",
    description: "A clip whose source range differs from its timeline range.",
    project: projectWith({
      id: "edge_trimmed_clip",
      title: "Trimmed Clip",
      tracks: [
        {
          id: "track_video_main",
          type: "video",
          name: "Main capture",
          locked: false,
          hidden: false,
          clips: [{ ...baseClip, id: "clip_trimmed", start: 0, end: 4, sourceStart: 12, sourceEnd: 16 }],
        },
      ],
    }),
    exportable: true,
  }),
  fixture({
    id: "overlapping_clips_separate_tracks",
    description: "Two overlapping clips on separate video tracks.",
    project: projectWith({
      id: "edge_overlapping_clips",
      title: "Overlapping Clips",
      tracks: [
        {
          id: "track_video_main",
          type: "video",
          name: "Main capture",
          locked: false,
          hidden: false,
          clips: [{ ...baseClip, id: "clip_overlap_a", start: 2, end: 10, sourceStart: 2, sourceEnd: 10 }],
        },
        {
          id: "track_video_overlay",
          type: "video",
          name: "Secondary capture",
          locked: false,
          hidden: false,
          clips: [{ ...baseClip, id: "clip_overlap_b", start: 5, end: 12, sourceStart: 5, sourceEnd: 12 }],
        },
      ],
    }),
    exportable: true,
  }),
  fixture({
    id: "missing_asset",
    description: "Schema-valid project whose required local media file is missing.",
    project: projectWith({
      id: "edge_missing_asset",
      title: "Missing Asset",
      assets: [{ ...baseAsset, uri: "assets/missing-capture.mp4" }],
    }),
    exportable: false,
    expectedFailure: "asset_resolution",
  }),
  fixture({
    id: "invalid_asset_reference",
    description: "Schema-invalid project whose clip references an unknown asset id.",
    project: projectWith({
      id: "edge_invalid_asset_reference",
      title: "Invalid Asset Reference",
      tracks: [
        {
          id: "track_video_main",
          type: "video",
          name: "Main capture",
          locked: false,
          hidden: false,
          clips: [{ ...baseClip, assetId: "asset_does_not_exist" }],
        },
      ],
    }),
    exportable: false,
    expectedFailure: "schema",
  }),
  fixture({
    id: "cursor_outside_frame_bounds",
    description: "Cursor coordinates outside the captured source dimensions.",
    project: projectWith({
      id: "edge_cursor_outside_frame_bounds",
      title: "Cursor Outside Frame Bounds",
      cursorEvents: [{ id: "cursor_outside", time: 2, type: "click", x: 2400, y: -80, label: "Outside click" }],
    }),
    exportable: true,
  }),
  fixture({
    id: "duplicate_timestamps",
    description: "Multiple cursor events share the same timestamp.",
    project: projectWith({
      id: "edge_duplicate_timestamps",
      title: "Duplicate Timestamps",
      cursorEvents: [
        { id: "cursor_duplicate_a", time: 3, type: "move", x: 320, y: 220 },
        { id: "cursor_duplicate_b", time: 3, type: "click", x: 320, y: 220, label: "Same timestamp click" },
      ],
    }),
    exportable: true,
  }),
  fixture({
    id: "zoom_target_outside_frame_bounds",
    description: "Zoom target rectangle extends outside the captured source frame.",
    project: projectWith({
      id: "edge_zoom_target_outside_frame_bounds",
      title: "Zoom Target Outside Frame Bounds",
      zooms: [
        {
          id: "zoom_outside",
          start: 4,
          end: 8,
          target: { x: -200, y: 700, width: 900, height: 520 },
          easing: "easeInOut",
        },
      ],
    }),
    exportable: true,
  }),
  fixture({
    id: "aspect_16_9",
    description: "Standard widescreen output.",
    project: projectWith({ id: "edge_aspect_16_9", title: "Aspect 16 9", aspectRatio: "16:9" }),
    exportable: true,
  }),
  fixture({
    id: "aspect_9_16",
    description: "Vertical output for short-form video.",
    project: projectWith({ id: "edge_aspect_9_16", title: "Aspect 9 16", aspectRatio: "9:16" }),
    exportable: true,
  }),
  fixture({
    id: "aspect_1_1",
    description: "Square output for feed video.",
    project: projectWith({ id: "edge_aspect_1_1", title: "Aspect 1 1", aspectRatio: "1:1" }),
    exportable: true,
  }),
  fixture({
    id: "very_short_under_one_second",
    description: "Very short but valid project under one second.",
    project: projectWith({
      id: "edge_very_short",
      title: "Very Short Under One Second",
      duration: 0.75,
      tracks: [
        {
          id: "track_video_main",
          type: "video",
          name: "Main capture",
          locked: false,
          hidden: false,
          clips: [{ ...baseClip, start: 0, end: 0.75, sourceStart: 0, sourceEnd: 0.75 }],
        },
      ],
    }),
    exportable: true,
  }),
  fixture({
    id: "long_over_three_minutes",
    description: "Long project over three minutes.",
    project: projectWith({
      id: "edge_long_over_three_minutes",
      title: "Long Over Three Minutes",
      duration: 181,
      tracks: [
        {
          id: "track_video_main",
          type: "video",
          name: "Main capture",
          locked: false,
          hidden: false,
          clips: [{ ...baseClip, start: 0, end: 181, sourceStart: 0, sourceEnd: 181 }],
        },
      ],
    }),
    exportable: true,
  }),
];
