import type { DemoProject } from "@tinker/project-schema";

export const sampleProject: DemoProject = {
  schemaVersion: "0.2.0",
  id: "demo_project_sample",
  title: "Sample Product Demo",
  duration: 45,
  fps: 30,
  aspectRatio: "16:9",
  createdAt: "2026-06-08T00:00:00.000Z",
  updatedAt: "2026-06-08T00:00:00.000Z",
  assets: [
    {
      id: "asset_capture_001",
      type: "video",
      uri: "assets/capture-001.mp4",
      source: "captured",
      name: "Primary browser capture",
      mimeType: "video/mp4",
      duration: 45,
      width: 1920,
      height: 1080,
      metadata: {},
    },
  ],
  tracks: [
    {
      id: "track_video_main",
      type: "video",
      name: "Main capture",
      locked: false,
      hidden: false,
      clips: [
        {
          id: "clip_capture_001",
          assetId: "asset_capture_001",
          start: 0,
          end: 45,
          sourceStart: 0,
          sourceEnd: 45,
          playbackRate: 1,
          name: "Browser flow",
          muted: false,
          opacity: 1,
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        },
      ],
    },
  ],
  zooms: [
    {
      id: "zoom_manual_001",
      mode: "manual",
      start: 12,
      end: 18,
      target: { x: 620, y: 260, width: 620, height: 380 },
      scale: 2,
      easing: "easeInOut",
    },
    {
      id: "zoom_auto_001",
      mode: "auto",
      start: 24,
      end: 30,
      scale: 2,
      easing: "easeInOut",
      keyframes: [
        {
          time: 24.5,
          target: { x: 820, y: 340, width: 420, height: 260 },
        },
        {
          time: 28.2,
          target: { x: 980, y: 410, width: 420, height: 260 },
        },
      ],
    },
  ],
  cursorEvents: [
    { time: 11.7, type: "move", x: 740, y: 420 },
    { time: 12.1, type: "click", x: 740, y: 420, label: "Open analytics" },
    { time: 24.5, type: "click", x: 1030, y: 470, label: "Open share menu" },
    { time: 28.2, type: "click", x: 1190, y: 540, label: "Copy link" },
  ],
  aiEditHistory: [],
  metadata: {
    sourceRepoUrl: "https://github.com/example/product",
    productUrl: "https://example.com",
    prompt: "Make a 45-second launch demo showing onboarding, dashboard, and analytics.",
    notes: ["Sample project used to validate schema v0.2.0."],
  },
};
