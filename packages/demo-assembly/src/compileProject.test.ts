import assert from "node:assert/strict";
import { DemoProjectSchema } from "@tinker/project-schema";
import { compileProject } from "./compileProject.js";
import type { CompileProjectInput } from "./types.js";

const input: CompileProjectInput = {
  projectId: "manual-demo-test",
  outputRoot: "generated/manual-demo-test",
  createdAt: "2026-06-08T00:00:00.000Z",
  prompt: "Show the core Tinker demo flow.",
  productUrl: "http://127.0.0.1:4173/",
  storyboard: {
    title: "Manual Demo Test",
    durationCapSeconds: 12,
    aspectRatio: "16:9",
    beats: [
      {
        id: "hook",
        type: "hook",
        goal: "Introduce the product promise.",
        startHint: 0,
        endHint: 4,
      },
    ],
  },
  capturePlan: {
    targetUrl: "http://127.0.0.1:4173/",
    viewport: { width: 1280, height: 720 },
    steps: [{ type: "goto", url: "http://127.0.0.1:4173/" }],
    expectedCheckpoints: [],
  },
  captureResult: {
    clips: [
      {
        id: "capture-video-main",
        type: "video",
        uri: "videos/main.webm",
        source: "captured",
        mimeType: "video/webm",
        width: 1280,
        height: 720,
        sizeBytes: 1234,
        metadata: { recorder: "playwright", frameRate: 25 },
      },
    ],
    screenshots: [],
    events: [
      { type: "cursor", time: 1.2, x: 100, y: 120 },
      { type: "click", time: 1.3, x: 100, y: 120, label: "Start demo" },
      { type: "scroll", time: 2.1, x: 0, y: 0, deltaX: 0, deltaY: 400 },
      { type: "zoomTarget", time: 1.3, x: 80, y: 96, width: 140, height: 48, label: "Start demo" },
    ],
    checkpoints: [],
    metadata: {
      startedAt: "2026-06-08T00:00:00.000Z",
      completedAt: "2026-06-08T00:00:06.000Z",
      targetUrl: "http://127.0.0.1:4173/",
      viewport: { width: 1280, height: 720 },
    },
  },
};

const project = DemoProjectSchema.parse(compileProject(input));

assert.equal(project.id, "manual-demo-test");
assert.equal(project.title, "Manual Demo Test");
assert.equal(project.duration, 12);
assert.equal(project.assets.length, 1);
assert.equal(project.assets[0]?.uri, "capture/videos/main.webm");
assert.equal(project.assets[0]?.width, 1280);
assert.equal(project.assets[0]?.height, 720);
assert.equal(project.assets[0]?.mimeType, "video/webm");
assert.equal(project.assets[0]?.sizeBytes, 1234);
assert.deepEqual(project.assets[0]?.metadata, { recorder: "playwright", frameRate: 25 });
assert.equal(project.fps, 25);
assert.equal(project.tracks[0]?.clips[0]?.assetId, "capture-video-main");
assert.equal(project.tracks[0]?.clips[0]?.end, 12);
assert.equal(project.tracks[0]?.clips[0]?.sourceEnd, 12);
assert.equal(project.cursorEvents.length, 3);
assert.equal(project.zooms.length, 1);
assert.equal(project.zooms[0]?.id, "zoom-3");
assert.equal(project.metadata.productUrl, "http://127.0.0.1:4173/");

const clampedProject = DemoProjectSchema.parse(
  compileProject({
    ...input,
    storyboard: {
      ...input.storyboard,
      durationCapSeconds: 2,
      beats: [{ ...input.storyboard.beats[0]!, startHint: -1, endHint: 1 }],
    },
  }),
);

assert.equal(clampedProject.cursorEvents.length, 2);

const shortCaptureProject = DemoProjectSchema.parse(
  compileProject({
    ...input,
    captureResult: {
      ...input.captureResult,
      clips: [{ ...input.captureResult.clips[0]!, duration: 6 }],
      events: [
        ...input.captureResult.events,
        { type: "zoomTarget", time: 5, x: 80, y: 96, width: 140, height: 48, label: "Late target" },
      ],
    },
  }),
);

// Footage is the source of truth: the timeline must not outlive the captured
// clip (LongCut rendered 4.3 seconds of black past the end of footage).
assert.equal(shortCaptureProject.duration, 6);
assert.equal(shortCaptureProject.tracks[0]?.clips[0]?.end, 6);
assert.equal(shortCaptureProject.tracks[0]?.clips[0]?.sourceEnd, 6);

const lateZoom = shortCaptureProject.zooms[shortCaptureProject.zooms.length - 1];
assert.ok(lateZoom !== undefined && lateZoom.end <= 6, `zooms must end inside footage, got ${lateZoom?.end}`);

console.log("compileProject tests passed");
