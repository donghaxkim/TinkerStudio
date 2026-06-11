import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CaptureResult } from "@tinker/browser-capture";
import type { ManualStoryboard } from "./types.js";

function readFixture(path: string) {
  return JSON.parse(readFileSync(resolve("../../packages/project-schema/fixtures", path), "utf8")) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectString(value: unknown, message: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(message);
}

function expectNumber(value: unknown, message: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(message);
}

function expectArray(value: unknown, message: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new Error(message);
}

function expectManualStoryboard(value: unknown): asserts value is ManualStoryboard {
  if (!isRecord(value)) throw new Error("storyboard fixture must be an object");
  expectString(value.title, "storyboard fixture must include title");
  expectString(value.aspectRatio, "storyboard fixture must include aspectRatio");
  expectNumber(value.durationCapSeconds, "storyboard fixture must include durationCapSeconds");
  expectArray(value.beats, "storyboard fixture must include beats");

  for (const beat of value.beats) {
    if (!isRecord(beat)) throw new Error("storyboard beat must be an object");
    expectString(beat.id, "storyboard beat must include id");
    expectString(beat.type, "storyboard beat must include type");
    expectString(beat.goal, "storyboard beat must include goal");
  }
}

function expectCaptureResult(value: unknown): asserts value is CaptureResult {
  if (!isRecord(value)) throw new Error("capture fixture must be an object");
  expectArray(value.clips, "capture fixture must include clips");
  expectArray(value.screenshots, "capture fixture must include screenshots");
  expectArray(value.events, "capture fixture must include events");
  expectArray(value.checkpoints, "capture fixture must include checkpoints");

  const capture = value;
  const metadata = capture.metadata as Record<string, unknown> | undefined;
  if (!isRecord(metadata)) throw new Error("capture fixture must include metadata");
  expectString(metadata.startedAt, "capture metadata must include startedAt");
  expectString(metadata.completedAt, "capture metadata must include completedAt");
  expectString(metadata.targetUrl, "capture metadata must include targetUrl");
  if (!isRecord(metadata.viewport)) throw new Error("capture metadata must include viewport");
  expectNumber(metadata.viewport.width, "capture metadata viewport must include width");
  expectNumber(metadata.viewport.height, "capture metadata viewport must include height");

  for (const asset of [...value.clips, ...value.screenshots]) {
    if (!isRecord(asset)) throw new Error("capture asset must be an object");
    expectString(asset.id, "capture asset must include id");
    expectString(asset.type, "capture asset must include type");
    expectString(asset.uri, "capture asset must include uri");
    if (asset.source !== "captured") throw new Error("capture assets must use source captured");
  }

  for (const event of value.events) {
    if (!isRecord(event)) throw new Error("capture event must be an object");
    expectNumber(event.time, "capture event must include time");
    expectString(event.type, "capture event must include type");

    if (event.type === "click" || event.type === "cursor") {
      expectNumber(event.x, "capture pointer event must include x");
      expectNumber(event.y, "capture pointer event must include y");
    } else if (event.type === "scroll") {
      expectNumber(event.x, "capture scroll event must include x");
      expectNumber(event.y, "capture scroll event must include y");
      expectNumber(event.deltaX, "capture scroll event must include deltaX");
      expectNumber(event.deltaY, "capture scroll event must include deltaY");
    } else if (event.type === "zoomTarget") {
      expectNumber(event.x, "capture zoomTarget event must include x");
      expectNumber(event.y, "capture zoomTarget event must include y");
      expectNumber(event.width, "capture zoomTarget event must include width");
      expectNumber(event.height, "capture zoomTarget event must include height");
    } else {
      throw new Error(`capture event has unsupported type '${event.type}'`);
    }
  }

  for (const checkpoint of value.checkpoints) {
    if (!isRecord(checkpoint)) throw new Error("capture checkpoint must be an object");
    expectString(checkpoint.id, "capture checkpoint must include id");
    expectString(checkpoint.label, "capture checkpoint must include label");
    if (typeof checkpoint.passed !== "boolean") throw new Error("capture checkpoint must include passed");
  }
}

const storyboard = readFixture("storyboard.sample.json");
expectManualStoryboard(storyboard);

const captureResult = readFixture("capture-result.sample.json");
expectCaptureResult(captureResult);

console.log("fixture sample shape tests passed");
