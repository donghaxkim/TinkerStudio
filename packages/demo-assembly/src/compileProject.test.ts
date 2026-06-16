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
assert.equal(project.fps, 60);
assert.equal(project.tracks[0]?.clips[0]?.assetId, "capture-video-main");
assert.equal(project.tracks[0]?.clips[0]?.end, 12);
assert.equal(project.tracks[0]?.clips[0]?.sourceEnd, 12);
assert.equal(project.cursorEvents.length, 3);
assert.equal(project.cursor, undefined);
assert.equal(project.zooms.length, 1);
assert.equal(project.zooms[0]?.id, "zoom_001");
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

const consecutiveTargetProject = DemoProjectSchema.parse(
  compileProject({
    ...input,
    captureResult: {
      ...input.captureResult,
      clips: [{ ...input.captureResult.clips[0]!, width: 1920, height: 1080 }],
      events: [
        { type: "zoomTarget", time: 7.537, x: 1451, y: 79, width: 188, height: 29, label: "Chat" },
        { type: "zoomTarget", time: 9.048, x: 1646, y: 79, width: 188, height: 29, label: "Notes" },
      ],
    },
  }),
);

assert.equal(consecutiveTargetProject.zooms.length, 2);
assert.deepEqual(
  consecutiveTargetProject.zooms.map((zoom) => zoom.target),
  [
    { x: 1451, y: 79, width: 188, height: 29 },
    { x: 1646, y: 79, width: 188, height: 29 },
  ],
);

const terminalRightEdgeTargetProject = DemoProjectSchema.parse(
  compileProject({
    ...input,
    storyboard: { ...input.storyboard, durationCapSeconds: 10.514 },
    captureResult: {
      ...input.captureResult,
      clips: [{ ...input.captureResult.clips[0]!, duration: 10.514, width: 1920, height: 1080 }],
      events: [
        { type: "zoomTarget", time: 7.361, x: 1451, y: 79, width: 188, height: 29, label: "Chat" },
        { type: "zoomTarget", time: 8.876, x: 1646, y: 79, width: 188, height: 29, label: "Notes" },
      ],
    },
  }),
);

assert.equal(terminalRightEdgeTargetProject.zooms.length, 3);
const [firstRightEdgeZoom, terminalRightEdgeZoom, terminalRightEdgeOutroZoom] = terminalRightEdgeTargetProject.zooms;
assert.deepEqual(firstRightEdgeZoom?.target, { x: 1451, y: 79, width: 188, height: 29 });
assert.deepEqual(terminalRightEdgeZoom?.target, { x: 1646, y: 79, width: 188, height: 29 });
assert.ok(terminalRightEdgeZoom !== undefined && terminalRightEdgeZoom.end <= 9.914);
assert.ok(
  terminalRightEdgeOutroZoom !== undefined && terminalRightEdgeOutroZoom.start >= terminalRightEdgeZoom.end,
  "clean outro crop should not overlap the interaction zoom",
);

const finalMomentRightEdgeTargetProject = DemoProjectSchema.parse(
  compileProject({
    ...input,
    storyboard: { ...input.storyboard, durationCapSeconds: 10.514 },
    captureResult: {
      ...input.captureResult,
      clips: [{ ...input.captureResult.clips[0]!, duration: 10.514, width: 1920, height: 1080 }],
      events: [{ type: "zoomTarget", time: 10.2, x: 1646, y: 79, width: 188, height: 29, label: "Notes" }],
    },
  }),
);

assert.equal(finalMomentRightEdgeTargetProject.zooms.length, 0, "last-moment right-edge zooms should not become terminal");

const lateRightEdgeTargetProject = DemoProjectSchema.parse(
  compileProject({
    ...input,
    storyboard: { ...input.storyboard, durationCapSeconds: 10.514 },
    captureResult: {
      ...input.captureResult,
      clips: [{ ...input.captureResult.clips[0]!, duration: 10.514, width: 1920, height: 1080 }],
      events: [{ type: "zoomTarget", time: 9.7, x: 1646, y: 79, width: 188, height: 29, label: "Notes" }],
    },
  }),
);

assert.equal(lateRightEdgeTargetProject.zooms.length, 0, "late right-edge zooms should not become terminal");

const adjacentTargetProject = DemoProjectSchema.parse(
  compileProject({
    ...input,
    captureResult: {
      ...input.captureResult,
      events: [
        { type: "zoomTarget", time: 1, x: 100, y: 100, width: 100, height: 100, label: "First" },
        { type: "zoomTarget", time: 3.5, x: 250, y: 120, width: 80, height: 60, label: "Second" },
      ],
    },
  }),
);

assert.equal(adjacentTargetProject.zooms.length, 2);
assert.deepEqual(
  adjacentTargetProject.zooms.map((zoom) => zoom.target),
  [
    { x: 100, y: 100, width: 100, height: 100 },
    { x: 250, y: 120, width: 80, height: 60 },
  ],
);

const outOfOrderTargetProject = DemoProjectSchema.parse(
  compileProject({
    ...input,
    captureResult: {
      ...input.captureResult,
      events: [
        { type: "zoomTarget", time: 3, x: 250, y: 120, width: 80, height: 60, label: "Second" },
        { type: "zoomTarget", time: 1, x: 100, y: 100, width: 100, height: 100, label: "First" },
      ],
    },
  }),
);

assert.equal(outOfOrderTargetProject.zooms.length, 2);
assert.deepEqual(
  outOfOrderTargetProject.zooms.map((zoom) => zoom.target),
  [
    { x: 100, y: 100, width: 100, height: 100 },
    { x: 250, y: 120, width: 80, height: 60 },
  ],
);

const clickFirstProject = DemoProjectSchema.parse(
  compileProject({
    ...input,
    captureResult: {
      ...input.captureResult,
      events: [
        { type: "cursor", time: 1.7, x: 200, y: 200 },
        { type: "click", time: 2, x: 640, y: 360, label: "Open menu" },
        { type: "cursor", time: 2.2, x: 900, y: 640 },
      ],
    },
  }),
);

assert.equal(clickFirstProject.zooms.length, 1);
assert.deepEqual(clickFirstProject.zooms[0], {
  id: "zoom_001",
  start: 1.75,
  end: 3.1,
  target: { x: 288, y: 162, width: 704, height: 396 },
  easing: "easeInOut",
});

const explicitWithoutClickProject = DemoProjectSchema.parse(
  compileProject({
    ...input,
    captureResult: {
      ...input.captureResult,
      events: [{ type: "zoomTarget", time: 1.3, x: 80, y: 96, width: 140, height: 48, label: "Start demo" }],
    },
  }),
);

assert.equal(explicitWithoutClickProject.zooms.length, 1);
assert.deepEqual(explicitWithoutClickProject.zooms[0], {
  id: "zoom-0",
  start: 1.3,
  end: 3.8,
  target: { x: 80, y: 96, width: 140, height: 48 },
  easing: "easeInOut",
});

const nearbyClickAndExplicitProject = DemoProjectSchema.parse(
  compileProject({
    ...input,
    captureResult: {
      ...input.captureResult,
      events: [
        { type: "click", time: 2.1, x: 640, y: 360, label: "Submit" },
        { type: "zoomTarget", time: 2, x: 0, y: 0, width: 1280, height: 720, label: "Broad target" },
      ],
    },
  }),
);

assert.equal(nearbyClickAndExplicitProject.zooms.length, 1);
assert.deepEqual(nearbyClickAndExplicitProject.zooms[0], {
  id: "zoom_001",
  start: 1.85,
  end: 3.2,
  target: { x: 288, y: 162, width: 704, height: 396 },
  easing: "easeInOut",
});

const distantOverlappingExplicitProject = DemoProjectSchema.parse(
  compileProject({
    ...input,
    captureResult: {
      ...input.captureResult,
      events: [
        { type: "zoomTarget", time: 1, x: 100, y: 100, width: 100, height: 100, label: "First" },
        { type: "zoomTarget", time: 2, x: 900, y: 100, width: 100, height: 100, label: "Second" },
      ],
    },
  }),
);

assert.equal(distantOverlappingExplicitProject.zooms.length, 2);
assert.deepEqual(
  distantOverlappingExplicitProject.zooms.map((zoom) => zoom.target),
  [
    { x: 100, y: 100, width: 100, height: 100 },
    { x: 900, y: 100, width: 100, height: 100 },
  ],
);

console.log("compileProject tests passed");
